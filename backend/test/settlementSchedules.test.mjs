import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

import settlementsRouter from "../src/routes/settlements.js";
import User from "../src/models/User.js";
import Group from "../src/models/Group.js";
import Expense from "../src/models/Expense.js";
import Settlement from "../src/models/Settlement.js";
import SettlementSchedule from "../src/models/SettlementSchedule.js";
import ActivityLog from "../src/models/ActivityLog.js";
import { getTestDbConfig } from "./testDbHelper.mjs";

const app = express();
app.use(express.json());
app.use("/api/settlements", settlementsRouter);

const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_jwt_key_123";
const tokenFor = (user) => jwt.sign(
  { id: user._id.toString(), email: user.email },
  JWT_SECRET,
  { expiresIn: "1h" },
);

let userA;
let userB;
let userC;
let tokenA;
let tokenB;
let tokenC;
let group;
let groupId;
let scheduleId;

before(async () => {
  const { testUri, testDbName } = getTestDbConfig();
  await mongoose.connect(testUri);
  await Promise.all([Settlement.syncIndexes(), SettlementSchedule.syncIndexes()]);

  const stamp = Date.now();
  [userA, userB, userC] = await User.create([
    { name: "Schedule Payer", email: `schedule_payer_${stamp}@example.com`, password: "password123", isEmailVerified: true },
    { name: "Schedule Receiver", email: `schedule_receiver_${stamp}@example.com`, password: "password123", isEmailVerified: true },
    { name: "Schedule Outsider", email: `schedule_outsider_${stamp}@example.com`, password: "password123", isEmailVerified: true },
  ]);
  tokenA = tokenFor(userA);
  tokenB = tokenFor(userB);
  tokenC = tokenFor(userC);

  group = await Group.create({
    name: `Schedule Test Group ${stamp}`,
    members: [{ user: userA._id }, { user: userB._id }],
    createdBy: userA._id,
  });
  groupId = group._id.toString();

  await Expense.create({
    description: "Schedule test expense",
    amount: 1000,
    paidBy: userB._id,
    group: group._id,
    splits: [
      { user: userA._id, amount: 500 },
      { user: userB._id, amount: 500 },
    ],
  });

  console.log(`Settlement schedule tests connected to isolated database: ${testDbName}`);
});

after(async () => {
  if (group?._id) {
    await Promise.all([
      Group.deleteMany({ _id: group._id }),
      Expense.deleteMany({ group: group._id }),
      Settlement.deleteMany({ group: group._id }),
      SettlementSchedule.deleteMany({ group: group._id }),
      ActivityLog.deleteMany({ group: group._id }),
    ]);
  }
  if (userA?._id) {
    await User.deleteMany({ _id: { $in: [userA._id, userB._id, userC._id] } });
  }
  if (mongoose.connection.readyState) await mongoose.disconnect();
});

test("payer can propose a date without changing the group's debt", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const create = await request(app)
    .post("/api/settlements/schedule")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({ groupId, toUserId: userB._id.toString(), amount: 300, dueDate: due });

  assert.equal(create.status, 201, JSON.stringify(create.body));
  assert.equal(create.body.status, "proposed");
  assert.equal(create.body.amount, 300);
  scheduleId = create.body._id;

  const snapshot = await request(app)
    .get(`/api/settlements/simplify/${groupId}`)
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.body.transactions[0].amount, 500, "a schedule proposal must not reserve or clear debt");
  assert.equal(snapshot.body.pendingRequests.length, 0);
  assert.equal(snapshot.body.scheduleRequests.length, 1);
  assert.equal(snapshot.body.scheduleRequests[0].status, "proposed");

  const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const invalid = await request(app)
    .post("/api/settlements/schedule")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({ groupId, toUserId: userB._id.toString(), amount: 50, dueDate: pastDate });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.message, /past/i);
  assert.ok(today);
});

test("only the receiver can accept; accepted schedule remains separate from payment", async () => {
  const outsider = await request(app)
    .post(`/api/settlements/schedule/${scheduleId}/respond`)
    .set("Authorization", `Bearer ${tokenC}`)
    .send({ action: "accept" });
  assert.equal(outsider.status, 404);

  const accepted = await request(app)
    .post(`/api/settlements/schedule/${scheduleId}/respond`)
    .set("Authorization", `Bearer ${tokenB}`)
    .send({ action: "accept" });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.status, "accepted");

  const duplicate = await request(app)
    .post("/api/settlements/schedule")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({
      groupId,
      toUserId: userB._id.toString(),
      amount: 100,
      dueDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    });
  assert.equal(duplicate.status, 409);

  const snapshot = await request(app)
    .get(`/api/settlements/simplify/${groupId}`)
    .set("Authorization", `Bearer ${tokenB}`);
  assert.equal(snapshot.body.transactions[0].amount, 500);
  assert.equal(snapshot.body.pendingRequests.length, 0);
  assert.equal(snapshot.body.scheduleRequests[0].status, "accepted");
});

test("scheduled payment completes only after receiver confirms; rejection restores accepted schedule", async () => {
  const mismatch = await request(app)
    .post("/api/settlements/settle")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({ groupId, toUserId: userB._id.toString(), amount: 250, scheduleId });
  assert.equal(mismatch.status, 400);
  assert.match(mismatch.body.message, /match/i);

  const payment = await request(app)
    .post("/api/settlements/settle")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({ groupId, toUserId: userB._id.toString(), amount: 300, scheduleId });
  assert.equal(payment.status, 201, JSON.stringify(payment.body));
  assert.equal(payment.body.status, "pending");

  let schedule = await SettlementSchedule.findById(scheduleId);
  assert.equal(schedule.status, "payment_pending");
  assert.equal(schedule.paymentSettlement.toString(), payment.body._id);

  let snapshot = await request(app)
    .get(`/api/settlements/simplify/${groupId}`)
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(snapshot.body.confirmedSettlements.length, 0);
  assert.equal(snapshot.body.pendingRequests.length, 1);
  assert.equal(snapshot.body.scheduleRequests[0].status, "payment_pending");

  const rejected = await request(app)
    .post("/api/settlements/reject")
    .set("Authorization", `Bearer ${tokenB}`)
    .send({ groupId, fromUserId: userA._id.toString(), reason: "Payment not received" });
  assert.equal(rejected.status, 200);
  schedule = await SettlementSchedule.findById(scheduleId);
  assert.equal(schedule.status, "accepted");
  assert.equal(schedule.paymentSettlement, null);

  snapshot = await request(app)
    .get(`/api/settlements/simplify/${groupId}`)
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(snapshot.body.transactions[0].amount, 500);
  assert.equal(snapshot.body.confirmedSettlements.length, 0);

  const retry = await request(app)
    .post("/api/settlements/settle")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({ groupId, toUserId: userB._id.toString(), amount: 300, scheduleId });
  assert.equal(retry.status, 201, JSON.stringify(retry.body));

  const confirmed = await request(app)
    .post("/api/settlements/confirm")
    .set("Authorization", `Bearer ${tokenB}`)
    .send({ groupId, fromUserId: userA._id.toString() });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.status, "confirmed");

  schedule = await SettlementSchedule.findById(scheduleId);
  assert.equal(schedule.status, "completed");
  assert.equal(schedule.active, false);
  assert.ok(schedule.completedAt);

  snapshot = await request(app)
    .get(`/api/settlements/simplify/${groupId}`)
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(snapshot.body.confirmedSettlements.length, 1);
  assert.equal(snapshot.body.transactions.length, 1);
  assert.equal(snapshot.body.transactions[0].amount, 200);
  assert.equal(snapshot.body.scheduleRequests.length, 0);
});
