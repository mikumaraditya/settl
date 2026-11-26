import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

import groupsRouter from "../src/routes/groups.js";
import settlementsRouter from "../src/routes/settlements.js";
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
app.use("/api/settlements", settlementsRouter);

describe("Group lifecycle routes", () => {
  let creator;
  let member;
  let invitee;
  let rateLimitedCreator;
  let creatorToken;
  let rateLimitedCreatorToken;
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

    invitee = await User.create({
      name: "Invitee User",
      email: `invitee-${suffix}@example.com`,
      password: "test-password-hash",
      isEmailVerified: true,
    });
    rateLimitedCreator = await User.create({
      name: "Rate Limited Group Creator",
      email: `group-rate-limited-${suffix}@example.com`,
      password: "test-password-hash",
      isEmailVerified: true,
    });

    creatorToken = jwt.sign({ id: creator._id.toString() }, jwtSecret, { expiresIn: "1h" });
    rateLimitedCreatorToken = jwt.sign({ id: rateLimitedCreator._id.toString() }, jwtSecret, { expiresIn: "1h" });
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
    const userIds = [creator?._id, member?._id, invitee?._id, rateLimitedCreator?._id].filter(Boolean);
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

  it("validates invitation emails and returns a useful not-found response", async () => {
    const group = await makeGroup();

    const malformed = await request(app)
      .post(`/api/groups/${group._id}/members`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ email: "not-an-email" });
    assert.equal(malformed.status, 400);

    const missing = await request(app)
      .post(`/api/groups/${group._id}/members`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ email: "not-registered@example.com" });
    assert.equal(missing.status, 404);
    assert.equal((await Group.findById(group._id)).members.length, 2);
  });

  it("allows only an admin to add a registered member and normalizes email", async () => {
    const group = await makeGroup();

    const denied = await request(app)
      .post(`/api/groups/${group._id}/members`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ email: invitee.email });
    assert.equal(denied.status, 403);

    const added = await request(app)
      .post(`/api/groups/${group._id}/members`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ email: `  ${invitee.email.toUpperCase()}  ` });

    assert.equal(added.status, 201);
    assert.equal(added.body.members.length, 3);
    assert.ok(added.body.members.some(item => item.user?._id === invitee._id.toString()));
    assert.equal((await Group.findById(group._id)).membershipMutation, false);
  });

  it("rejects an existing member and does not create duplicate memberships", async () => {
    const group = await makeGroup();

    const response = await request(app)
      .post(`/api/groups/${group._id}/members`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ email: member.email });

    assert.equal(response.status, 409);
    assert.equal((await Group.findById(group._id)).members.length, 2);
  });

  it("serializes concurrent invitations so the same user is added only once", async () => {
    const group = await makeGroup();
    const sendInvite = () => request(app)
      .post(`/api/groups/${group._id}/members`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ email: invitee.email });

    const responses = await Promise.all([sendInvite(), sendInvite()]);
    assert.equal(responses.filter(response => response.status === 201).length, 1);
    assert.ok(responses.every(response => [201, 409].includes(response.status)));

    const updated = await Group.findById(group._id);
    assert.equal(updated.members.filter(item => item.user.toString() === invitee._id.toString()).length, 1);
    assert.equal(updated.membershipMutation, false);
  });

  it("does not add members while a group is deleting or another expense is in flight", async () => {
    const deletingGroup = await makeGroup();
    await Group.updateOne({ _id: deletingGroup._id }, { $set: { isDeleting: true } });
    const deletingResponse = await request(app)
      .post(`/api/groups/${deletingGroup._id}/members`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ email: invitee.email });
    assert.equal(deletingResponse.status, 409);

    const busyGroup = await makeGroup();
    await Group.updateOne(
      { _id: busyGroup._id },
      {
        $set: {
          activeMutations: 1,
          mutationExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    );
    const busyResponse = await request(app)
      .post(`/api/groups/${busyGroup._id}/members`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ email: invitee.email });
    assert.equal(busyResponse.status, 409);
  });

  it("allows an admin to remove a member with no balance or unresolved payment", async () => {
    const group = await makeGroup();
    const response = await request(app)
      .delete(`/api/groups/${group._id}/members/${member._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.members.length, 1);
    assert.equal(response.body.members.some(item => item.user?._id === member._id.toString()), false);
    assert.equal((await Group.findById(group._id)).membershipMutation, false);
  });

  it("allows a member to leave voluntarily when their balance and payment activity are clear", async () => {
    const group = await makeGroup();
    const response = await request(app)
      .delete(`/api/groups/${group._id}/members/${member._id}`)
      .set("Authorization", `Bearer ${memberToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.message, "You have left the group");
    assert.equal((await Group.findById(group._id)).members.length, 1);
  });

  it("does not allow a non-admin to remove another member", async () => {
    const group = await makeGroup();
    await request(app)
      .post(`/api/groups/${group._id}/members`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ email: invitee.email })
      .expect(201);

    const response = await request(app)
      .delete(`/api/groups/${group._id}/members/${invitee._id}`)
      .set("Authorization", `Bearer ${memberToken}`);

    assert.equal(response.status, 403);
    assert.equal((await Group.findById(group._id)).members.length, 3);
  });

  it("blocks member removal when unpaid balances remain", async () => {
    const group = await makeGroup();
    await Expense.create({
      description: "Member still owes",
      amount: 100,
      paidBy: creator._id,
      group: group._id,
      splits: [
        { user: creator._id, amount: 50 },
        { user: member._id, amount: 50 },
      ],
    });

    const response = await request(app)
      .delete(`/api/groups/${group._id}/members/${member._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 409);
    assert.equal((await Group.findById(group._id)).members.length, 2);
  });

  it("blocks member removal when a payment request is awaiting confirmation", async () => {
    const group = await makeGroup();
    await Settlement.create({
      group: group._id,
      from: member._id,
      to: creator._id,
      amount: 10,
      status: "pending",
    });

    const response = await request(app)
      .delete(`/api/groups/${group._id}/members/${member._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 409);
    assert.equal((await Group.findById(group._id)).members.length, 2);
  });

  it("blocks member removal while an active settlement schedule references them", async () => {
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
      .delete(`/api/groups/${group._id}/members/${member._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 409);
    assert.equal((await Group.findById(group._id)).members.length, 2);
  });

  it("does not let the sole admin leave the group", async () => {
    const group = await Group.create({
      name: `Single admin ${Date.now()}`,
      createdBy: creator._id,
      members: [{ user: creator._id, role: "admin" }],
    });
    groupIds.push(group._id);

    const response = await request(app)
      .delete(`/api/groups/${group._id}/members/${creator._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 409);
    assert.equal((await Group.findById(group._id)).members.length, 1);
  });

  it("rejects malformed group and member identifiers", async () => {
    const badGroup = await request(app)
      .post("/api/groups/not-an-id/members")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ email: invitee.email });
    assert.equal(badGroup.status, 400);

    const group = await makeGroup();
    const badMember = await request(app)
      .delete(`/api/groups/${group._id}/members/not-an-id`)
      .set("Authorization", `Bearer ${creatorToken}`);
    assert.equal(badMember.status, 400);
  });

  it("rejects membership changes during group deletion or active expense mutations", async () => {
    const deletingGroup = await makeGroup();
    await Group.updateOne({ _id: deletingGroup._id }, { $set: { isDeleting: true } });
    const deletingResponse = await request(app)
      .delete(`/api/groups/${deletingGroup._id}/members/${member._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);
    assert.equal(deletingResponse.status, 409);

    const busyGroup = await makeGroup();
    await Group.updateOne(
      { _id: busyGroup._id },
      {
        $set: {
          activeMutations: 1,
          mutationExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    );
    const busyResponse = await request(app)
      .delete(`/api/groups/${busyGroup._id}/members/${member._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);
    assert.equal(busyResponse.status, 409);
  });

  it("recovers an abandoned membership lock before adding a member", async () => {
    const group = await makeGroup();
    await Group.updateOne(
      { _id: group._id },
      {
        $set: {
          membershipMutation: true,
          membershipMutationExpiresAt: new Date(Date.now() - 1000),
        },
      },
    );

    const response = await request(app)
      .post(`/api/groups/${group._id}/members`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ email: invitee.email });

    assert.equal(response.status, 201);
    const updated = await Group.findById(group._id);
    assert.equal(updated.membershipMutation, false);
    assert.ok(updated.members.some(item => item.user.toString() === invitee._id.toString()));
  });

  it("does not delete a group while a membership update has a live lease", async () => {
    const group = await makeGroup();
    await Group.updateOne(
      { _id: group._id },
      {
        $set: {
          membershipMutation: true,
          membershipMutationExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    );

    const response = await request(app)
      .delete(`/api/groups/${group._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 409);
    assert.ok(await Group.exists({ _id: group._id }));
  });

  it("can recover a group after an abandoned membership lock has expired", async () => {
    const group = await Group.create({
      name: `Expired membership lock ${Date.now()}`,
      createdBy: creator._id,
      members: [{ user: creator._id, role: "admin" }],
      membershipMutation: true,
      membershipMutationExpiresAt: new Date(Date.now() - 1000),
    });
    groupIds.push(group._id);

    const response = await request(app)
      .delete(`/api/groups/${group._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 200);
    assert.equal(await Group.exists({ _id: group._id }), null);
  });

  it("does not create settlements or payment schedules during a membership update", async () => {
    const group = await makeGroup();
    await Group.updateOne(
      { _id: group._id },
      {
        $set: {
          membershipMutation: true,
          membershipMutationExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    );

    const settlementResponse = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        groupId: group._id.toString(),
        toUserId: creator._id.toString(),
        amount: 10,
      });

    const scheduleResponse = await request(app)
      .post("/api/settlements/schedule")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        groupId: group._id.toString(),
        toUserId: creator._id.toString(),
        amount: 10,
        dueDate: "2026-12-20",
        timeZone: "UTC",
      });

    assert.equal(settlementResponse.status, 409);
    assert.equal(scheduleResponse.status, 409);
    assert.equal(await Settlement.countDocuments({ group: group._id }), 0);
    assert.equal(await SettlementSchedule.countDocuments({ group: group._id }), 0);
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

  it("can delete a group after an abandoned expense mutation lease has expired", async () => {
    const group = await makeGroup();
    await Group.updateOne(
      { _id: group._id },
      {
        $set: {
          activeMutations: 1,
          mutationExpiresAt: new Date(Date.now() - 1000),
        },
      },
    );

    const response = await request(app)
      .delete(`/api/groups/${group._id}`)
      .set("Authorization", `Bearer ${creatorToken}`);

    assert.equal(response.status, 200);
    assert.equal(await Group.exists({ _id: group._id }), null);
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

  it("limits group creation per user without blocking another creator", async () => {
    const responses = [];

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request(app)
        .post("/api/groups")
        .set("Authorization", `Bearer ${rateLimitedCreatorToken}`)
        .send({ name: `Rate limited group ${attempt}` });
      responses.push(response);
      if (response.status === 201) groupIds.push(response.body._id);
    }

    assert.equal(responses.slice(0, 10).filter(response => response.status === 201).length, 10);
    assert.equal(responses[10].status, 429);
    assert.equal(
      responses[10].body.message,
      "Too many groups created. Please try again in an hour.",
    );

    const otherCreatorResponse = await request(app)
      .post("/api/groups")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ name: "Independent creator allowance" });
    assert.equal(otherCreatorResponse.status, 201);
    groupIds.push(otherCreatorResponse.body._id);
  });
});
