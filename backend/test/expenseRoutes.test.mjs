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
  let rateLimitedPayer;
  let independentPayer;
  let payerToken;
  let memberToken;
  let outsiderToken;
  let rateLimitedPayerToken;
  let independentPayerToken;
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
    rateLimitedPayer = await User.create({
      name: "Rate Limited Expense Payer",
      email: `expense-rate-limited-${suffix}@example.com`,
      password: "test-password-hash",
      isEmailVerified: true,
    });
    independentPayer = await User.create({
      name: "Independent Expense Payer",
      email: `expense-independent-${suffix}@example.com`,
      password: "test-password-hash",
      isEmailVerified: true,
    });

    payerToken = jwt.sign({ id: payer._id.toString() }, jwtSecret, { expiresIn: "1h" });
    memberToken = jwt.sign({ id: member._id.toString() }, jwtSecret, { expiresIn: "1h" });
    outsiderToken = jwt.sign({ id: outsider._id.toString() }, jwtSecret, { expiresIn: "1h" });
    rateLimitedPayerToken = jwt.sign({ id: rateLimitedPayer._id.toString() }, jwtSecret, { expiresIn: "1h" });
    independentPayerToken = jwt.sign({ id: independentPayer._id.toString() }, jwtSecret, { expiresIn: "1h" });
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
    const userIds = [payer?._id, member?._id, outsider?._id, rateLimitedPayer?._id, independentPayer?._id].filter(Boolean);
    if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
    await mongoose.disconnect();
  });

  it("returns recent expenses across months with stable record pagination", async () => {
    const group = await makeGroup();
    const oldest = await makeExpense(group, { description: "January expense" });
    const middle = await makeExpense(group, { description: "February expense" });
    const newest = await makeExpense(group, { description: "March expense" });

    await Promise.all([
      Expense.collection.updateOne(
        { _id: oldest._id },
        { $set: { createdAt: new Date("2026-01-10T10:00:00.000Z") } },
      ),
      Expense.collection.updateOne(
        { _id: middle._id },
        { $set: { createdAt: new Date("2026-02-10T10:00:00.000Z") } },
      ),
      Expense.collection.updateOne(
        { _id: newest._id },
        { $set: { createdAt: new Date("2026-03-10T10:00:00.000Z") } },
      ),
    ]);

    const firstPage = await request(app)
      .get(`/api/expenses/group/${group._id}?limit=2&skip=0`)
      .set("Authorization", `Bearer ${payerToken}`);

    assert.equal(firstPage.status, 200);
    assert.deepEqual(
      firstPage.body.expenses.map(expense => expense.description),
      ["March expense", "February expense"],
    );
    assert.equal(firstPage.body.total, 3);
    assert.equal(firstPage.body.hasMore, true);
    assert.equal(firstPage.body.expenses[0].paidBy.name, payer.name);

    const secondPage = await request(app)
      .get(`/api/expenses/group/${group._id}?limit=2&skip=2`)
      .set("Authorization", `Bearer ${payerToken}`);

    assert.equal(secondPage.status, 200);
    assert.deepEqual(
      secondPage.body.expenses.map(expense => expense.description),
      ["January expense"],
    );
    assert.equal(secondPage.body.total, 3);
    assert.equal(secondPage.body.hasMore, false);
  });

  it("validates recent expense pagination and keeps group access checks", async () => {
    const group = await makeGroup();

    const invalidLimit = await request(app)
      .get(`/api/expenses/group/${group._id}?limit=101`)
      .set("Authorization", `Bearer ${payerToken}`);
    assert.equal(invalidLimit.status, 400);

    const invalidSkip = await request(app)
      .get(`/api/expenses/group/${group._id}?limit=6&skip=-1`)
      .set("Authorization", `Bearer ${payerToken}`);
    assert.equal(invalidSkip.status, 400);

    const outsiderResponse = await request(app)
      .get(`/api/expenses/group/${group._id}?limit=6`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    assert.equal(outsiderResponse.status, 403);
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

  it("replays a matching expense idempotency key and rejects changed payloads", async () => {
    const group = await makeGroup();
    const idempotencyKey = "expense-create-retry-001";
    const payload = {
      groupId: group._id.toString(),
      description: "Retry-safe shared lunch",
      amount: 240,
      category: "food",
      splitType: "equal",
    };

    const first = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${payerToken}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);
    assert.equal(first.status, 201);

    const replay = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${payerToken}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);
    assert.equal(replay.status, 200);
    assert.equal(replay.body._id, first.body._id);
    assert.equal(await Expense.countDocuments({ group: group._id }), 1);

    const changedPayload = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${payerToken}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ ...payload, amount: 260 });
    assert.equal(changedPayload.status, 409);
    assert.equal(changedPayload.body.code, "IDEMPOTENCY_KEY_REUSED");
    assert.equal(await Expense.countDocuments({ group: group._id }), 1);
    assert.equal((await Group.findById(group._id)).activeMutations, 0);
  });

  it("rejects malformed expense idempotency keys", async () => {
    const group = await makeGroup();
    const response = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${payerToken}`)
      .set("Idempotency-Key", "bad key")
      .send({
        groupId: group._id.toString(),
        description: "Invalid key",
        amount: 25,
      });

    assert.equal(response.status, 400);
    assert.equal(await Expense.countDocuments({ group: group._id }), 0);
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

  it("does not create an expense while membership is being updated", async () => {
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
      .post("/api/expenses")
      .set("Authorization", `Bearer ${payerToken}`)
      .send({
        groupId: group._id.toString(),
        description: "Do not race membership",
        amount: 25,
      });

    assert.equal(response.status, 409);
    assert.equal(await Expense.countDocuments({ group: group._id }), 0);
  });

  it("recovers an abandoned membership lock before creating an expense", async () => {
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
      .post("/api/expenses")
      .set("Authorization", `Bearer ${payerToken}`)
      .send({
        groupId: group._id.toString(),
        description: "Allowed after expired lock",
        amount: 25,
      });

    assert.equal(response.status, 201);
    let updatedGroup;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
      updatedGroup = await Group.findById(group._id);
      if (!updatedGroup.membershipMutation && updatedGroup.activeMutations === 0) break;
    }
    assert.equal(updatedGroup.membershipMutation, false);
    assert.equal(updatedGroup.activeMutations, 0);
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

  it("allows deletion of a later expense when earlier settlement history predates it", async () => {
    const group = await makeGroup();
    await Settlement.create({
      group: group._id,
      from: member._id,
      to: payer._id,
      amount: 10,
      status: "confirmed",
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    const expense = await makeExpense(group);

    const response = await request(app)
      .delete(`/api/expenses/${expense._id}`)
      .set("Authorization", `Bearer ${payerToken}`);

    assert.equal(response.status, 200);
    assert.equal(await Expense.exists({ _id: expense._id }), null);
  });

  it("allows deletion of a later expense when an active schedule predates it", async () => {
    const group = await makeGroup();
    await SettlementSchedule.create({
      group: group._id,
      from: member._id,
      to: payer._id,
      amount: 10,
      dueDate: new Date("2026-12-01T12:00:00.000Z"),
      status: "accepted",
      active: true,
    });
    await new Promise(resolve => setTimeout(resolve, 5));
    const expense = await makeExpense(group);

    const response = await request(app)
      .delete(`/api/expenses/${expense._id}`)
      .set("Authorization", `Bearer ${payerToken}`);

    assert.equal(response.status, 200);
    assert.equal(await Expense.exists({ _id: expense._id }), null);
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
    await Expense.collection.updateOne(
      { _id: expense._id },
      { $set: { createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) } },
    );

    const response = await request(app)
      .delete(`/api/expenses/${expense._id}`)
      .set("Authorization", `Bearer ${payerToken}`);

    assert.equal(response.status, 403);
    assert.ok(await Expense.exists({ _id: expense._id }));
  });

  it("limits expense creation per user without blocking another group member", async () => {
    const group = await Group.create({
      name: `Rate limited expense group ${Date.now()}`,
      createdBy: rateLimitedPayer._id,
      members: [
        { user: rateLimitedPayer._id, role: "admin" },
        { user: independentPayer._id, role: "member" },
      ],
    });
    groupIds.push(group._id);
    const responses = [];

    for (let attempt = 0; attempt < 21; attempt += 1) {
      const response = await request(app)
        .post("/api/expenses")
        .set("Authorization", `Bearer ${rateLimitedPayerToken}`)
        .send({
          groupId: group._id.toString(),
          description: `Rate limited expense ${attempt}`,
          amount: 100,
          paidBy: rateLimitedPayer._id.toString(),
          members: [rateLimitedPayer._id.toString(), independentPayer._id.toString()],
          splitType: "equal",
        });
      responses.push(response);
    }

    assert.equal(responses.slice(0, 20).filter(response => response.status === 201).length, 20);
    assert.equal(responses[20].status, 429);
    assert.equal(
      responses[20].body.message,
      "Too many expenses created. Please try again in 15 minutes.",
    );
    assert.equal(await Expense.countDocuments({ group: group._id }), 20);

    const otherMemberResponse = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${independentPayerToken}`)
      .send({
        groupId: group._id.toString(),
        description: "Independent member expense",
        amount: 100,
        paidBy: independentPayer._id.toString(),
        members: [rateLimitedPayer._id.toString(), independentPayer._id.toString()],
        splitType: "equal",
      });
    assert.equal(otherMemberResponse.status, 201);
  });
});
