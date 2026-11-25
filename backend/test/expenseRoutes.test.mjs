import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

import expensesRouter from "../src/routes/expenses.js";
import User from "../src/models/User.js";
import Group from "../src/models/Group.js";
import Expense from "../src/models/Expense.js";
import Settlement from "../src/models/Settlement.js";
import SettlementSchedule from "../src/models/SettlementSchedule.js";
import ActivityLog from "../src/models/ActivityLog.js";
import { getTestDbConfig } from "./testDbHelper.mjs";

const app = express();
app.use(express.json());
app.use("/api/expenses", expensesRouter);

describe("Expense creation and deletion lifecycle", () => {
  let payer;
  let member;
  let outsider;
  let payerToken;
  let memberToken;
  let outsiderToken;
  const groupIds = [];

  const makeGroup = async (overrides = {}) => {
    const group = await Group.create({
      name: `Expense lifecycle ${Date.now()} ${groupIds.length}`,
      createdBy: payer._id,
      members: [
        { user: payer._id, role: "admin" },
        { user: member._id, role: "member" },
      ],
      ...overrides,
    });
    groupIds.push(group._id);
    return group;
  };

  const makeExpense = async (group, overrides = {}) => Expense.create({
    description: "Test expense",
    amount: 100,
    paidBy: payer._id,
    group: group._id,
    splits: [
      { user: payer._id, amount: 50 },
      { user: member._id, amount: 50 },
    ],
    ...overrides,
  });

  before(async () => {
    const { testUri } = getTestDbConfig();
    await mongoose.connect(testUri);

    const jwtSecret = process.env.JWT_SECRET || "expense-routes-test-secret";
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = jwtSecret;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    payer = await User.create({
      name: "Expense Payer",
      email: `expense-payer-${suffix}@example.com`,
      password: "test-password-hash",
      isEmailVerified: true,
    });
    member = await User.create({
      name: "Expense Member",
      email: `expense-member-${suffix}@example.com`,
      password: "test-password-hash",
      isEmailVerified: true,
    });
    outsider = await User.create({
      name: "Expense Outsider",
      email: `expense-outsider-${suffix}@example.com`,
      password: "test-password-hash",
      isEmailVerified: true,
    });

    payerToken = jwt.sign({ id: payer._id.toString() }, jwtSecret, { expiresIn: "1h" });
    memberToken = jwt.sign({ id: member._id.toString() }, jwtSecret, { expiresIn: "1h" });
    outsiderToken = jwt.sign({ id: outsider._id.toString() }, jwtSecret, { expiresIn: "1h" });
  });

  after(async () => {
    if (groupIds.length) {
      const groupFilter = { group: { $in: groupIds } };
      await Promise.all([
        Expense.deleteMany(groupFilter),
        Settlement.deleteMany(groupFilter),
        SettlementSchedule.deleteMany(groupFilter),
        ActivityLog.deleteMany(groupFilter),
        Group.deleteMany({ _id: { $in: groupIds } }),
      ]);
    }
    const userIds = [payer?._id, member?._id, outsider?._id].filter(Boolean);
    if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
    await mongoose.disconnect();
  });

  it("rejects missing or blank expense descriptions with a validation response", async () => {
    const group = await makeGroup();
    for (const description of [undefined, "   "]) {
      const response = await request(app)
        .post("/api/expenses")
        .set("Authorization", `Bearer ${payerToken}`)
        .send({ groupId: group._id.toString(), amount: 100, description });
      assert.equal(response.status, 400);
      assert.match(response.body.message, /description/i);
    }
    assert.equal(await Expense.countDocuments({ group: group._id }), 0);
  });

  it("rejects malformed amounts, unsupported categories and unknown split types", async () => {
    const group = await makeGroup();
    const cases = [
      { amount: 0 },
      { amount: -10 },
      { amount: "abc" },
      { amount: 10.123 },
      { amount: 20, category: "crypto" },
      { amount: 20, splitType: "random" },
    ];

    for (const data of cases) {
      const response = await request(app)
        .post("/api/expenses")
        .set("Authorization", `Bearer ${payerToken}`)
        .send({ groupId: group._id.toString(), description: "Validation test", ...data });
      assert.equal(response.status, 400, JSON.stringify(data));
    }
    assert.equal(await Expense.countDocuments({ group: group._id }), 0);
  });

  it("creates a valid equal split using exact paise totals", async () => {
    const group = await makeGroup();
    const response = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${payerToken}`)
      .send({
        groupId: group._id.toString(),
        description: "  Shared lunch  ",
        amount: 100.01,
        category: "food",
        splitType: "equal",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.description, "Shared lunch");
    assert.equal(response.body.amount, 100.01);
    assert.equal(response.body.splits.length, 2);
    assert.equal(response.body.splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0), 10001);
    assert.equal(await Expense.countDocuments({ group: group._id }), 1);
    const storedGroup = await Group.findById(group._id);
    assert.equal(storedGroup.activeMutations, 0);
  });

  it("rejects exact splits with missing, duplicate or mismatched members", async () => {
    const group = await makeGroup();
    const badPayloads = [
      [{ user: payer._id.toString(), amount: 100 }],
      [
        { user: payer._id.toString(), amount: 50 },
        { user: payer._id.toString(), amount: 50 },
      ],
      [
        { user: payer._id.toString(), amount: 50 },
        { user: member._id.toString(), amount: 49.99 },
      ],
      [
        { user: payer._id.toString(), amount: 100.001 },
        { user: member._id.toString(), amount: 0 },
      ],
    ];

    for (const splits of badPayloads) {
      const response = await request(app)
        .post("/api/expenses")
        .set("Authorization", `Bearer ${payerToken}`)
        .send({
          groupId: group._id.toString(),
          description: "Bad exact split",
          amount: 100,
          splitType: "exact",
          splits,
        });
      assert.equal(response.status, 400);
    }
    assert.equal(await Expense.countDocuments({ group: group._id }), 0);
    assert.equal((await Group.findById(group._id)).activeMutations, 0);
  });

  it("rejects percentage splits that do not total 100 or omit a selected member", async () => {
    const group = await makeGroup();
    const badCases = [
      [
        { user: payer._id.toString(), percentage: 50 },
        { user: member._id.toString(), percentage: 49 },
      ],
      [
        { user: payer._id.toString(), percentage: 100 },
      ],
    ];

    for (const splits of badCases) {
      const response = await request(app)
        .post("/api/expenses")
        .set("Authorization", `Bearer ${payerToken}`)
        .send({
          groupId: group._id.toString(),
          description: "Bad percentage split",
          amount: 100,
          splitType: "percentage",
          splits,
        });
      assert.equal(response.status, 400);
    }
    assert.equal(await Expense.countDocuments({ group: group._id }), 0);
  });

  it("does not let an outsider or a deleting group add an expense", async () => {
    const group = await makeGroup();
    const outsiderResponse = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ groupId: group._id.toString(), description: "Not allowed", amount: 10 });
    assert.equal(outsiderResponse.status, 403);

    await Group.updateOne({ _id: group._id }, { $set: { isDeleting: true } });
    const lockedResponse = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${payerToken}`)
      .send({ groupId: group._id.toString(), description: "Group is deleting", amount: 10 });
    assert.equal(lockedResponse.status, 409);
    assert.equal(await Expense.countDocuments({ group: group._id }), 0);
  });

  it("allows the payer to delete a recent expense and rejects repeat deletion", async () => {
    const group = await makeGroup();
    const expense = await makeExpense(group);

    const response = await request(app)
      .delete(`/api/expenses/${expense._id}`)
      .set("Authorization", `Bearer ${payerToken}`);

    assert.equal(response.status, 200);
    assert.equal(await Expense.exists({ _id: expense._id }), null);

    const repeat = await request(app)
      .delete(`/api/expenses/${expense._id}`)
      .set("Authorization", `Bearer ${payerToken}`);
    assert.equal(repeat.status, 404);
  });

  it("only allows the payer to delete an expense", async () => {
    const group = await makeGroup();
    const expense = await makeExpense(group);
    const response = await request(app)
      .delete(`/api/expenses/${expense._id}`)
      .set("Authorization", `Bearer ${memberToken}`);

    assert.equal(response.status, 403);
    assert.ok(await Expense.exists({ _id: expense._id }));
  });

  it("preserves expenses that already have pending or confirmed settlement history", async () => {
    for (const status of ["pending", "confirmed"]) {
      const group = await makeGroup();
      const expense = await makeExpense(group);
      await Settlement.create({
        group: group._id,
        from: member._id,
        to: payer._id,
        amount: 10,
        status,
      });

      const response = await request(app)
        .delete(`/api/expenses/${expense._id}`)
        .set("Authorization", `Bearer ${payerToken}`);

      assert.equal(response.status, 409);
      assert.ok(await Expense.exists({ _id: expense._id }));
    }
  });

  it("preserves expenses while an active settlement schedule exists", async () => {
    const group = await makeGroup();
    const expense = await makeExpense(group);
    await SettlementSchedule.create({
      group: group._id,
      from: member._id,
      to: payer._id,
      amount: 10,
      dueDate: new Date("2026-12-01T12:00:00.000Z"),
      status: "accepted",
      active: true,
    });

    const response = await request(app)
      .delete(`/api/expenses/${expense._id}`)
      .set("Authorization", `Bearer ${payerToken}`);

    assert.equal(response.status, 409);
    assert.ok(await Expense.exists({ _id: expense._id }));
  });

  it("rejects expense deletion after the two-hour correction window", async () => {
    const group = await makeGroup();
    const expense = await makeExpense(group);
    await Expense.updateOne(
      { _id: expense._id },
      { $set: { createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) } },
    );

    const response = await request(app)
      .delete(`/api/expenses/${expense._id}`)
      .set("Authorization", `Bearer ${payerToken}`);

    assert.equal(response.status, 403);
    assert.ok(await Expense.exists({ _id: expense._id }));
  });
});
