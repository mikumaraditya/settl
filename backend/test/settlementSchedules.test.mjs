import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

import settlementsRouter from "../src/routes/settlements.js";
import expensesRouter from "../src/routes/expenses.js";
import notificationsRouter from "../src/routes/notifications.js";
import User from "../src/models/User.js";
import Group from "../src/models/Group.js";
import Expense from "../src/models/Expense.js";
import Settlement from "../src/models/Settlement.js";
import SettlementSchedule from "../src/models/SettlementSchedule.js";
import ActivityLog from "../src/models/ActivityLog.js";
import Notification from "../src/models/Notification.js";
import { processSettlementScheduleReminders } from "../src/services/settlementReminderWorker.js";
import { getTestDbConfig } from "./testDbHelper.mjs";
import { reserveGroupMutation, releaseGroupMutation } from "../src/utils/groupMutation.js";

const app = express();
app.use(express.json());
app.use("/api/settlements", settlementsRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/notifications", notificationsRouter);

const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_jwt_key_123";
const tokenFor = (user) => jwt.sign(
  { id: user._id.toString(), email: user.email },
  JWT_SECRET,
  { expiresIn: "1h" },
);

let userA;
let userB;
let userC;
let userD;
let tokenA;
let tokenB;
let tokenC;
let tokenD;
let group;
let groupId;
let scheduleId;

before(async () => {
  const { testUri, testDbName } = getTestDbConfig();
  await mongoose.connect(testUri);
  await Promise.all([Settlement.syncIndexes(), SettlementSchedule.syncIndexes(), Notification.syncIndexes()]);

  const stamp = Date.now();
  [userA, userB, userC, userD] = await User.create([
    { name: "Schedule Payer", email: `schedule_payer_${stamp}@example.com`, password: "password123", isEmailVerified: true },
    { name: "Schedule Receiver", email: `schedule_receiver_${stamp}@example.com`, password: "password123", isEmailVerified: true },
    { name: "Schedule Group Member", email: `schedule_member_${stamp}@example.com`, password: "password123", isEmailVerified: true },
    { name: "Schedule Outsider", email: `schedule_outsider_${stamp}@example.com`, password: "password123", isEmailVerified: true },
  ]);
  tokenA = tokenFor(userA);
  tokenB = tokenFor(userB);
  tokenC = tokenFor(userC);
  tokenD = tokenFor(userD);

  group = await Group.create({
    name: `Schedule Test Group ${stamp}`,
    members: [{ user: userA._id }, { user: userB._id }, { user: userC._id }],
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
      Notification.deleteMany({ group: group._id }),
    ]);
  }
  if (userA?._id) {
    await User.deleteMany({ _id: { $in: [userA._id, userB._id, userC._id, userD._id] } });
  }
  if (mongoose.connection.readyState) await mongoose.disconnect();
});

test("payer-provided UPI references are validated and visible only to settlement participants", async () => {
  const invalidShort = await request(app)
    .post("/api/settlements/settle")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({
      groupId,
      toUserId: userB._id.toString(),
      amount: 100,
      upiReference: "123",
    });
  assert.equal(invalidShort.status, 400);

  const invalidCharacters = await request(app)
    .post("/api/settlements/settle")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({
      groupId,
      toUserId: userB._id.toString(),
      amount: 100,
      upiReference: "UPI 123456",
    });
  assert.equal(invalidCharacters.status, 400);

  const payment = await request(app)
    .post("/api/settlements/settle")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({
      groupId,
      toUserId: userB._id.toString(),
      amount: 100,
      upiReference: "123456789012",
    });
  assert.equal(payment.status, 201, JSON.stringify(payment.body));
  assert.equal(payment.body.upiReference, "123456789012");

  const saved = await Settlement.findById(payment.body._id).lean();
  assert.equal(saved.upiReference, "123456789012");

  const payerView = await request(app)
    .get(`/api/settlements/simplify/${groupId}`)
    .set("Authorization", `Bearer ${tokenA}`);
  const receiverView = await request(app)
    .get(`/api/settlements/simplify/${groupId}`)
    .set("Authorization", `Bearer ${tokenB}`);
  const otherMemberView = await request(app)
    .get(`/api/settlements/simplify/${groupId}`)
    .set("Authorization", `Bearer ${tokenC}`);

  assert.equal(payerView.body.pendingRequests[0].upiReference, "123456789012");
  assert.equal(receiverView.body.pendingRequests[0].upiReference, "123456789012");
  assert.equal(
    Object.hasOwn(otherMemberView.body.pendingRequests[0], "upiReference"),
    false,
    "non-participating group members must not receive the reference",
  );

  const rejected = await request(app)
    .post("/api/settlements/reject")
    .set("Authorization", `Bearer ${tokenB}`)
    .send({ groupId, fromUserId: userA._id.toString(), reason: "Reference does not match receipt" });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.settlement.upiReference, "123456789012");

  const balance = await request(app)
    .get(`/api/settlements/simplify/${groupId}`)
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(balance.body.transactions[0].amount, 500, "rejecting an unverified reference must not clear any debt");
});

test("settlement idempotency replays the same pending payment and rejects a changed amount", async () => {
  const retryGroup = await Group.create({
    name: `Settlement idempotency group ${Date.now()}`,
    members: [{ user: userA._id }, { user: userB._id }],
    createdBy: userA._id,
  });
  try {
    await Expense.create({
      description: "Settlement idempotency debt",
      amount: 1000,
      paidBy: userB._id,
      group: retryGroup._id,
      splits: [
        { user: userA._id, amount: 500 },
        { user: userB._id, amount: 500 },
      ],
    });

    const payload = {
      groupId: retryGroup._id.toString(),
      toUserId: userB._id.toString(),
      amount: 120,
      upiReference: "123456789012",
    };
    const key = `settlement-retry-${Date.now()}`;
    const first = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", key)
      .send(payload);
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const replay = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", key)
      .send(payload);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body._id, first.body._id);
    assert.equal(replay.body.upiReference, payload.upiReference);
    assert.equal(await Settlement.countDocuments({ group: retryGroup._id, status: "pending" }), 1);

    const changedAmount = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", key)
      .send({ ...payload, amount: 130 });
    assert.equal(changedAmount.status, 409);
    assert.equal(changedAmount.body.code, "IDEMPOTENCY_KEY_REUSED");
    assert.equal(await Settlement.countDocuments({ group: retryGroup._id }), 1);
  } finally {
    await Promise.all([
      Settlement.deleteMany({ group: retryGroup._id }),
      Expense.deleteMany({ group: retryGroup._id }),
      SettlementSchedule.deleteMany({ group: retryGroup._id }),
      ActivityLog.deleteMany({ group: retryGroup._id }),
      Group.deleteOne({ _id: retryGroup._id }),
    ]);
  }
});

test("retrying an accepted-schedule payment reuses its existing settlement link", async () => {
  const retryGroup = await Group.create({
    name: `Settlement schedule retry group ${Date.now()}`,
    members: [{ user: userA._id }, { user: userB._id }],
    createdBy: userA._id,
  });
  try {
    await Expense.create({
      description: "Scheduled settlement retry debt",
      amount: 1000,
      paidBy: userB._id,
      group: retryGroup._id,
      splits: [
        { user: userA._id, amount: 500 },
        { user: userB._id, amount: 500 },
      ],
    });

    const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const proposed = await request(app)
      .post("/api/settlements/schedule")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        groupId: retryGroup._id.toString(),
        toUserId: userB._id.toString(),
        amount: 100,
        dueDate,
      });
    assert.equal(proposed.status, 201, JSON.stringify(proposed.body));

    const accepted = await request(app)
      .post(`/api/settlements/schedule/${proposed.body._id}/respond`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ action: "accept" });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

    const paymentPayload = {
      groupId: retryGroup._id.toString(),
      toUserId: userB._id.toString(),
      amount: 100,
      scheduleId: proposed.body._id,
    };
    const key = `scheduled-payment-retry-${Date.now()}`;
    const first = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", key)
      .send(paymentPayload);
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const replay = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", key)
      .send(paymentPayload);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body._id, first.body._id);

    const storedSchedule = await SettlementSchedule.findById(proposed.body._id).lean();
    assert.equal(storedSchedule.status, "payment_pending");
    assert.equal(String(storedSchedule.paymentSettlement), first.body._id);
    assert.equal(await Settlement.countDocuments({ group: retryGroup._id }), 1);
  } finally {
    await Promise.all([
      Settlement.deleteMany({ group: retryGroup._id }),
      Expense.deleteMany({ group: retryGroup._id }),
      SettlementSchedule.deleteMany({ group: retryGroup._id }),
      ActivityLog.deleteMany({ group: retryGroup._id }),
      Group.deleteOne({ _id: retryGroup._id }),
    ]);
  }
});

test("schedule proposal idempotency replays the same proposal and rejects changed details", async () => {
  const retryGroup = await Group.create({
    name: `Schedule proposal idempotency group ${Date.now()}`,
    members: [{ user: userA._id }, { user: userB._id }],
    createdBy: userA._id,
  });
  try {
    await Expense.create({
      description: "Schedule proposal idempotency debt",
      amount: 1000,
      paidBy: userB._id,
      group: retryGroup._id,
      splits: [
        { user: userA._id, amount: 500 },
        { user: userB._id, amount: 500 },
      ],
    });

    const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const payload = {
      groupId: retryGroup._id.toString(),
      toUserId: userB._id.toString(),
      amount: 125,
      dueDate,
    };
    const key = `schedule-proposal-retry-${Date.now()}`;

    const invalidKey = await request(app)
      .post("/api/settlements/schedule")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", "short")
      .send(payload);
    assert.equal(invalidKey.status, 400);

    const first = await request(app)
      .post("/api/settlements/schedule")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", key)
      .send(payload);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.status, "proposed");

    const replay = await request(app)
      .post("/api/settlements/schedule")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", key)
      .send(payload);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body._id, first.body._id);
    assert.equal(await SettlementSchedule.countDocuments({ group: retryGroup._id }), 1);

    const changedDetails = await request(app)
      .post("/api/settlements/schedule")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", key)
      .send({ ...payload, amount: 150 });
    assert.equal(changedDetails.status, 409);
    assert.equal(changedDetails.body.code, "IDEMPOTENCY_KEY_REUSED");
    assert.equal(await SettlementSchedule.countDocuments({ group: retryGroup._id }), 1);

    const accepted = await request(app)
      .post(`/api/settlements/schedule/${first.body._id}/respond`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ action: "accept" });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

    const replayAfterTransition = await request(app)
      .post("/api/settlements/schedule")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", key)
      .send(payload);
    assert.equal(replayAfterTransition.status, 200, JSON.stringify(replayAfterTransition.body));
    assert.equal(replayAfterTransition.body._id, first.body._id);
    assert.equal(replayAfterTransition.body.status, "accepted");
    assert.equal(await SettlementSchedule.countDocuments({ group: retryGroup._id }), 1);
  } finally {
    await Promise.all([
      Settlement.deleteMany({ group: retryGroup._id }),
      Expense.deleteMany({ group: retryGroup._id }),
      SettlementSchedule.deleteMany({ group: retryGroup._id }),
      ActivityLog.deleteMany({ group: retryGroup._id }),
      Group.deleteOne({ _id: retryGroup._id }),
    ]);
  }
});

test("a retry of a schedule whose due date has passed still replays its original record", async () => {
  const retryGroup = await Group.create({
    name: `Past schedule retry group ${Date.now()}`,
    members: [{ user: userA._id }, { user: userB._id }],
    createdBy: userA._id,
  });
  try {
    const dueDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const payload = {
      groupId: retryGroup._id.toString(),
      toUserId: userB._id.toString(),
      amount: 75,
      dueDate,
    };
    const key = `past-schedule-retry-${Date.now()}`;
    const idempotencyHash = createHash("sha256").update(JSON.stringify({
      groupId: payload.groupId,
      from: userA._id.toString(),
      to: payload.toUserId,
      amountPaise: 7500,
      dueDate,
      timeZone: null,
    })).digest("hex");
    const existing = await SettlementSchedule.create({
      group: retryGroup._id,
      from: userA._id,
      to: userB._id,
      amount: payload.amount,
      dueDate: new Date(`${dueDate}T12:00:00.000Z`),
      status: "accepted",
      active: true,
      idempotencyKey: key,
      idempotencyHash,
    });

    const replay = await request(app)
      .post("/api/settlements/schedule")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Idempotency-Key", key)
      .send(payload);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body._id, existing._id.toString());
    assert.equal(replay.body.status, "accepted");
    assert.equal(await SettlementSchedule.countDocuments({ group: retryGroup._id }), 1);
  } finally {
    await Promise.all([
      Settlement.deleteMany({ group: retryGroup._id }),
      SettlementSchedule.deleteMany({ group: retryGroup._id }),
      ActivityLog.deleteMany({ group: retryGroup._id }),
      Group.deleteOne({ _id: retryGroup._id }),
    ]);
  }
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

  const privateScheduleList = await request(app)
    .get(`/api/settlements/schedules/${groupId}`)
    .set("Authorization", `Bearer ${tokenC}`);
  assert.equal(privateScheduleList.status, 200);
  assert.deepEqual(privateScheduleList.body.schedules, [], "other group members must not see a participant's schedule");

  const outsiderList = await request(app)
    .get(`/api/settlements/schedules/${groupId}`)
    .set("Authorization", `Bearer ${tokenD}`);
  assert.equal(outsiderList.status, 403, "non-members cannot read schedules");

  const groupActivity = await request(app)
    .get(`/api/settlements/group/${groupId}/activity?limit=100`)
    .set("Authorization", `Bearer ${tokenC}`);
  assert.equal(groupActivity.status, 200);
  assert.equal(
    groupActivity.body.logs.filter((log) => String(log.type).startsWith("schedule_")).length,
    0,
    "non-participating group members must not see schedule activity details",
  );

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

  // The worker sends one persistent reminder to each participant the day before.
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(`${today}T12:00:00.000Z`);
  dueDate.setUTCDate(dueDate.getUTCDate() + 1);
  const dueDateOnly = dueDate.toISOString().slice(0, 10);
  await SettlementSchedule.updateOne(
    { _id: scheduleId },
    {
      $set: { dueDate },
    },
  );

  const dayBeforeCount = await processSettlementScheduleReminders({
    now: new Date(`${today}T10:00:00.000Z`),
  });
  assert.equal(dayBeforeCount, 2, "payer and receiver should each get a day-before notification");

  const duplicateDayBeforeCount = await processSettlementScheduleReminders({
    now: new Date(`${today}T10:15:00.000Z`),
  });
  assert.equal(duplicateDayBeforeCount, 0, "repeated scans must not duplicate reminders");

  const payerNotifications = await request(app)
    .get("/api/notifications")
    .set("Authorization", `Bearer ${tokenA}`);
  const receiverNotifications = await request(app)
    .get("/api/notifications")
    .set("Authorization", `Bearer ${tokenB}`);
  const otherMemberNotifications = await request(app)
    .get("/api/notifications")
    .set("Authorization", `Bearer ${tokenC}`);

  assert.equal(payerNotifications.status, 200);
  assert.equal(receiverNotifications.status, 200);
  assert.equal(payerNotifications.body.notifications.length, 1);
  assert.equal(receiverNotifications.body.notifications.length, 1);
  assert.equal(otherMemberNotifications.body.notifications.length, 0, "non-participants must not see schedule reminders");
  assert.equal(payerNotifications.body.notifications[0].type, "settlement_schedule_reminder");
  const markAllPayerRead = await request(app)
    .patch("/api/notifications/read-all")
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(markAllPayerRead.status, 200);
  assert.equal(
    await Notification.countDocuments({ user: userA._id, readAt: null }),
    0,
    "mark-all-read must persist for the current user",
  );
  const dayBeforeRows = await Notification.find({ schedule: scheduleId }).lean();
  assert.equal(dayBeforeRows.length, 2);
  assert.ok(dayBeforeRows.every((item) => item.reminderStage === "day_before"));

  const receiverReminderId = receiverNotifications.body.notifications[0].id;
  const unauthorizedRead = await request(app)
    .patch(`/api/notifications/${receiverReminderId}/read`)
    .set("Authorization", `Bearer ${tokenA}`);
  assert.equal(unauthorizedRead.status, 404, "a participant cannot modify another user's notification");

  const markRead = await request(app)
    .patch(`/api/notifications/${receiverReminderId}/read`)
    .set("Authorization", `Bearer ${tokenB}`);
  assert.equal(markRead.status, 200);
  const receiverReminder = await Notification.findById(receiverReminderId).lean();
  assert.ok(receiverReminder.readAt, "notification read state should persist in MongoDB");

  // The due-date scan creates a separate reminder stage for both participants.
  const dueTodayCount = await processSettlementScheduleReminders({
    now: new Date(`${dueDateOnly}T10:00:00.000Z`),
  });
  assert.equal(dueTodayCount, 2);

  const payerNotificationsAfterDue = await request(app)
    .get("/api/notifications")
    .set("Authorization", `Bearer ${tokenA}`);
  const receiverNotificationsAfterDue = await request(app)
    .get("/api/notifications")
    .set("Authorization", `Bearer ${tokenB}`);
  assert.equal(payerNotificationsAfterDue.body.notifications.length, 2);
  assert.equal(receiverNotificationsAfterDue.body.notifications.length, 2);
  assert.equal(
    receiverNotificationsAfterDue.body.notifications.filter((item) => item.type === "settlement_schedule_reminder").length,
    2,
  );
  const allReminderRows = await Notification.find({ schedule: scheduleId }).lean();
  assert.equal(allReminderRows.length, 4);
  assert.equal(allReminderRows.filter((item) => item.reminderStage === "day_before").length, 2);
  assert.equal(allReminderRows.filter((item) => item.reminderStage === "due_today").length, 2);

  const clearReceiverNotifications = await request(app)
    .delete("/api/notifications")
    .set("Authorization", `Bearer ${tokenB}`);
  assert.equal(clearReceiverNotifications.status, 200);
  const receiverFeedAfterClear = await request(app)
    .get("/api/notifications")
    .set("Authorization", `Bearer ${tokenB}`);
  assert.equal(receiverFeedAfterClear.body.notifications.length, 0);
  const scanAfterClear = await processSettlementScheduleReminders({
    now: new Date(`${dueDateOnly}T10:15:00.000Z`),
  });
  assert.equal(scanAfterClear, 0, "clearing a notification must not allow the worker to recreate it");
  assert.equal(
    await Notification.countDocuments({ schedule: scheduleId, deletedAt: { $ne: null } }),
    2,
  );

  const snapshot = await request(app)
    .get(`/api/settlements/simplify/${groupId}`)
    .set("Authorization", `Bearer ${tokenB}`);
  assert.equal(snapshot.body.transactions[0].amount, 500, "reminders must not change group balances");
  assert.equal(snapshot.body.pendingRequests.length, 0);
  assert.equal(snapshot.body.scheduleRequests[0].status, "accepted");
  assert.equal(snapshot.body.scheduleRequests[0].dueDateOnly, dueDateOnly);
  assert.equal(snapshot.body.scheduleRequests[0].dueStatus, "due_tomorrow");
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

test("settlement and schedule transitions respect an active group mutation lock", async () => {
  const settlement = await Settlement.create({
    group: group._id,
    from: userA._id,
    to: userB._id,
    amount: 25,
    status: "pending",
  });
  const schedule = await SettlementSchedule.create({
    group: group._id,
    from: userA._id,
    to: userB._id,
    amount: 25,
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    status: "proposed",
    active: true,
  });

  await Group.updateOne(
    { _id: group._id },
    {
      $set: {
        membershipMutation: true,
        membershipMutationExpiresAt: new Date(Date.now() + 60_000),
      },
    },
  );

  try {
    const confirm = await request(app)
      .post("/api/settlements/confirm")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ groupId, fromUserId: userA._id.toString() });
    const reject = await request(app)
      .post("/api/settlements/reject")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ groupId, fromUserId: userA._id.toString() });
    const cancel = await request(app)
      .delete("/api/settlements/settle")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ groupId, toUserId: userB._id.toString() });
    const respond = await request(app)
      .post(`/api/settlements/schedule/${schedule._id}/respond`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ action: "accept" });
    const cancelSchedule = await request(app)
      .post(`/api/settlements/schedule/${schedule._id}/cancel`)
      .set("Authorization", `Bearer ${tokenA}`);

    for (const response of [confirm, reject, cancel, respond, cancelSchedule]) {
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.match(response.body.message, /membership|updated|try again/i);
    }

    const [storedSettlement, storedSchedule] = await Promise.all([
      Settlement.findById(settlement._id).lean(),
      SettlementSchedule.findById(schedule._id).lean(),
    ]);
    assert.equal(storedSettlement.status, "pending", "payment must remain pending while membership is locked");
    assert.equal(storedSchedule.status, "proposed", "schedule must remain proposed while membership is locked");
    assert.equal(storedSchedule.active, true);
  } finally {
    await Group.updateOne(
      { _id: group._id },
      { $set: { membershipMutation: false, membershipMutationExpiresAt: null } },
    );
    await Promise.all([
      Settlement.deleteOne({ _id: settlement._id }),
      SettlementSchedule.deleteOne({ _id: schedule._id }),
    ]);
  }
});

test("blank due date defaults to seven calendar days", async () => {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const expectedDate = new Date(`${todayUtc}T12:00:00.000Z`);
  expectedDate.setUTCDate(expectedDate.getUTCDate() + 7);
  const expectedDueDate = expectedDate.toISOString().slice(0, 10);

  const create = await request(app)
    .post("/api/settlements/schedule")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({
      groupId,
      toUserId: userB._id.toString(),
      amount: 50,
      dueDate: null,
      timeZone: "UTC",
    });

  assert.equal(create.status, 201, JSON.stringify(create.body));
  assert.equal(create.body.dueDate.slice(0, 10), expectedDueDate);
  assert.equal(create.body.status, "proposed");
});


test("group financial mutation leases serialize writes and prevent stale owners from releasing a newer lease", async () => {
  const first = await reserveGroupMutation(groupId, userA._id);
  assert.ok(first, "the first financial mutation should acquire the group lease");

  const blocked = await reserveGroupMutation(groupId, userB._id);
  assert.equal(blocked, null, "a concurrent financial mutation must not acquire the same group");

  const past = new Date(Date.now() - 1_000);
  await Group.updateOne(
    { _id: group._id, financialMutationId: first.token },
    {
      $set: {
        financialMutationExpiresAt: past,
        mutationExpiresAt: past,
      },
    },
  );

  const replacement = await reserveGroupMutation(groupId, userB._id);
  assert.ok(replacement, "a later request should recover an expired lease");
  assert.notEqual(replacement.token, first.token);

  await releaseGroupMutation(groupId, first.token);
  let storedGroup = await Group.findById(group._id).lean();
  assert.equal(
    storedGroup.financialMutationId,
    replacement.token,
    "a stale owner must not clear a replacement owner's lock",
  );
  assert.equal(storedGroup.activeMutations, 1);

  await releaseGroupMutation(groupId, replacement.token);
  storedGroup = await Group.findById(group._id).lean();
  assert.equal(storedGroup.financialMutationId, null);
  assert.equal(storedGroup.activeMutations, 0);
});

test("expense creation and settlement scheduling return a conflict while another financial write owns the group", async () => {
  const reservation = await reserveGroupMutation(groupId, userA._id);
  assert.ok(reservation);

  try {
    const expensesBefore = await Expense.countDocuments({ group: group._id });
    const schedulesBefore = await SettlementSchedule.countDocuments({ group: group._id });

    const expense = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${tokenC}`)
      .send({
        groupId,
        description: "Concurrent expense should wait",
        amount: 20,
        splitType: "equal",
      });

    const schedule = await request(app)
      .post("/api/settlements/schedule")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        groupId,
        toUserId: userB._id.toString(),
        amount: 20,
        dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        timeZone: "UTC",
      });

    assert.equal(expense.status, 409, JSON.stringify(expense.body));
    assert.equal(schedule.status, 409, JSON.stringify(schedule.body));
    assert.equal(await Expense.countDocuments({ group: group._id }), expensesBefore);
    assert.equal(await SettlementSchedule.countDocuments({ group: group._id }), schedulesBefore);
  } finally {
    await releaseGroupMutation(groupId, reservation.token);
  }
});

test("an overdue settlement is expired before the receiver can confirm it", async () => {
  const expiryGroup = await Group.create({
    name: `Expired confirmation test ${Date.now()}`,
    members: [{ user: userA._id }, { user: userB._id }],
    createdBy: userA._id,
  });
  const expiryGroupId = expiryGroup._id.toString();

  let payment;
  let schedule;
  try {
    payment = await Settlement.create({
      group: expiryGroup._id,
      from: userA._id,
      to: userB._id,
      amount: 25,
      status: "pending",
    });
    schedule = await SettlementSchedule.create({
      group: expiryGroup._id,
      from: userA._id,
      to: userB._id,
      amount: 25,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "payment_pending",
      active: true,
      paymentSettlement: payment._id,
    });

    await Settlement.collection.updateOne(
      { _id: payment._id },
      { $set: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } },
    );

    const confirm = await request(app)
      .post("/api/settlements/confirm")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ groupId: expiryGroupId, fromUserId: userA._id.toString() });

    assert.equal(confirm.status, 404, JSON.stringify(confirm.body));
    const storedPayment = await Settlement.findById(payment._id).lean();
    const storedSchedule = await SettlementSchedule.findById(schedule._id).lean();
    assert.equal(storedPayment.status, "expired");
    assert.equal(storedSchedule.status, "accepted");
    assert.equal(storedSchedule.active, true);
    assert.equal(storedSchedule.paymentSettlement, null);
  } finally {
    await Promise.all([
      Settlement.deleteMany({ group: expiryGroup._id }),
      SettlementSchedule.deleteMany({ group: expiryGroup._id }),
      Expense.deleteMany({ group: expiryGroup._id }),
      Group.deleteOne({ _id: expiryGroup._id }),
    ]);
  }
});
