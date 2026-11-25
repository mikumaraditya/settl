import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

import groupsRouter from "../src/routes/groups.js";
import User from "../src/models/User.js";
import Group from "../src/models/Group.js";
import Expense from "../src/models/Expense.js";
import Settlement from "../src/models/Settlement.js";
import SettlementSchedule from "../src/models/SettlementSchedule.js";
import ActivityLog from "../src/models/ActivityLog.js";
import Message from "../src/models/Message.js";
import { getTestDbConfig } from "./testDbHelper.mjs";

const app = express();
app.use(express.json());
app.use("/api/groups", groupsRouter);

describe("Group lifecycle routes", () => {
  let creator;
  let member;
  let creatorToken;
  let memberToken;
  const groupIds = [];

  const makeGroup = async () => {
    const group = await Group.create({
      name: `Group lifecycle ${Date.now()} ${groupIds.length}`,
      createdBy: creator._id,
      members: [
        { user: creator._id, role: "admin" },
        { user: member._id, role: "member" },
      ],
    });
    groupIds.push(group._id);
    return group;
  };

  before(async () => {
    const { testUri } = getTestDbConfig();
    await mongoose.connect(testUri);

    const jwtSecret = process.env.JWT_SECRET || "group-routes-test-secret";
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = jwtSecret;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    creator = await User.create({
      name: "Group Creator",
      email: `group-creator-${suffix}@example.com`,
      password: "test-password-hash",
      isEmailVerified: true,
    });
    member = await User.create({
      name: "Group Member",
      email: `group-member-${suffix}@example.com`,
      password: "test-password-hash",
      isEmailVerified: true,
    });

    creatorToken = jwt.sign({ id: creator._id.toString() }, jwtSecret, { expiresIn: "1h" });
    memberToken = jwt.sign({ id: member._id.toString() }, jwtSecret, { expiresIn: "1h" });
  });

  after(async () => {
    if (groupIds.length) {
      const groupFilter = { group: { $in: groupIds } };
      await Promise.all([
        Expense.deleteMany(groupFilter),
        Settlement.deleteMany(groupFilter),
        SettlementSchedule.deleteMany(groupFilter),
        ActivityLog.deleteMany(groupFilter),
        Message.deleteMany(groupFilter),
        Group.deleteMany({ _id: { $in: groupIds } }),
      ]);
    }
    const userIds = [creator?._id, member?._id].filter(Boolean);
    if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
    await mongoose.disconnect();
  });

  it("rejects blank group names and overlong descriptions without creating a group", async () => {
    const blank = await request(app)
      .post("/api/groups")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ name: "   " });
    assert.equal(blank.status, 400);

    const tooLong = await request(app)
      .post("/api/groups")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ name: "Valid name", description: "x".repeat(281) });
    assert.equal(tooLong.status, 400);
  });

  it("trims valid group names and creates the creator as the initial admin", async () => {
    const response = await request(app)
      .post("/api/groups")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ name: "  Trip Crew  ", description: "  Shared travel costs  " });

    assert.equal(response.status, 201);
    assert.equal(response.body.name, "Trip Crew");
    assert.equal(response.body.description, "Shared travel costs");
    assert.equal(response.body.members.length, 1);
    assert.equal(response.body.members[0].user.toString(), creator._id.toString());
    assert.equal(response.body.members[0].role, "admin");
    groupIds.push(response.body._id);
  });

  it("does not delete a group while a payment request is pending", async () => {
    const group = await makeGroup();
    await Settlement.create({
      group: group._id,
      from: member._id,
      to: creator._id,
      amount: 10,
      status: "pending",
    });

    const response = await request(app)
      .delete(`/api/groups/${group._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 409);
    assert.ok(await Group.exists({ _id: group._id }));
  });

  it("does not delete a group while an active settlement schedule exists", async () => {
    const group = await makeGroup();
    await SettlementSchedule.create({
      group: group._id,
      from: member._id,
      to: creator._id,
      amount: 10,
      dueDate: new Date("2026-12-01T12:00:00.000Z"),
      status: "accepted",
      active: true,
    });

    const response = await request(app)
      .delete(`/api/groups/${group._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 409);
    assert.ok(await Group.exists({ _id: group._id }));
  });

  it("does not start deleting a group while an expense mutation is in flight", async () => {
    const group = await makeGroup();
    await Group.updateOne({ _id: group._id }, { $set: { activeMutations: 1 } });

    const response = await request(app)
      .delete(`/api/groups/${group._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 409);
    assert.ok(await Group.exists({ _id: group._id }));
    assert.equal((await Group.findById(group._id)).isDeleting, false);
  });

  it("can retry a group deletion after an earlier cleanup attempt marked it as deleting", async () => {
    const group = await makeGroup();
    const expense = await Expense.create({
      description: "Cleanup retry",
      amount: 20,
      paidBy: creator._id,
      group: group._id,
      splits: [{ user: creator._id, amount: 20 }, { user: member._id, amount: 0 }],
    });
    await Group.updateOne({ _id: group._id }, { $set: { isDeleting: true } });

    const response = await request(app)
      .delete(`/api/groups/${group._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 200);
    assert.equal(await Group.exists({ _id: group._id }), null);
    assert.equal(await Expense.exists({ _id: expense._id }), null);
  });

  it("deletes a settled group and removes its completed settlement schedules", async () => {
    const group = await makeGroup();
    const schedule = await SettlementSchedule.create({
      group: group._id,
      from: creator._id,
      to: member._id,
      amount: 25,
      dueDate: new Date("2026-11-20T12:00:00.000Z"),
      status: "completed",
      active: false,
      completedAt: new Date("2026-11-20T12:00:00.000Z"),
    });
    await ActivityLog.create({
      group: group._id,
      actor: creator._id,
      type: "group_created",
      meta: { groupName: group.name },
    });
    await Message.create({
      group: group._id,
      sender: creator._id,
      content: "Group cleanup test",
    });

    const response = await request(app)
      .delete(`/api/groups/${group._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 200);
    assert.equal(await Group.exists({ _id: group._id }), null);
    assert.equal(await SettlementSchedule.exists({ _id: schedule._id }), null);
    assert.equal(await ActivityLog.exists({ group: group._id }), null);
    assert.equal(await Message.exists({ group: group._id }), null);
  });

  it("does not allow a non-creator member to delete the group", async () => {
    const group = await makeGroup();

    const response = await request(app)
      .delete(`/api/groups/${group._id}`)
      .set("Authorization", `Bearer ${memberToken}`);

    assert.equal(response.status, 403);
    assert.ok(await Group.exists({ _id: group._id }));
  });

  it("keeps a group when an outstanding balance remains", async () => {
    const group = await makeGroup();
    await Expense.create({
      description: "Unsettled group expense",
      amount: 100,
      paidBy: creator._id,
      group: group._id,
      splits: [
        { user: creator._id, amount: 50 },
        { user: member._id, amount: 50 },
      ],
    });

    const response = await request(app)
      .delete(`/api/groups/${group._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 409);
    assert.ok(await Group.exists({ _id: group._id }));
  });
});
