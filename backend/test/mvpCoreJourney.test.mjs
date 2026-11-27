import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import request from "supertest";
dotenv.config();

import app from "../src/app.js";
import ActivityLog from "../src/models/ActivityLog.js";
import Expense from "../src/models/Expense.js";
import Group from "../src/models/Group.js";
import Message from "../src/models/Message.js";
import Settlement from "../src/models/Settlement.js";
import User from "../src/models/User.js";
import { getTestDbConfig } from "./testDbHelper.mjs";

describe("MVP core group-to-settlement journey", () => {
  let owner;
  let member;
  let ownerToken;
  let memberToken;
  const groupIds = [];
  const userIds = [];

  before(async () => {
    const { testUri } = getTestDbConfig();
    await mongoose.connect(testUri);
    process.env.JWT_SECRET ||= "settl-mvp-core-journey-test-secret";

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    [owner, member] = await User.create([
      {
        name: "Journey Group Owner",
        email: `journey-owner-${suffix}@example.com`,
        password: "test-password-hash",
        isEmailVerified: true,
      },
      {
        name: "Journey Group Member",
        email: `journey-member-${suffix}@example.com`,
        password: "test-password-hash",
        isEmailVerified: true,
      },
    ]);
    userIds.push(owner._id, member._id);

    const secret = process.env.JWT_SECRET;
    ownerToken = jwt.sign({ id: owner._id.toString() }, secret, { expiresIn: "1h" });
    memberToken = jwt.sign({ id: member._id.toString() }, secret, { expiresIn: "1h" });
  });

  after(async () => {
    if (groupIds.length) {
      const groupFilter = { group: { $in: groupIds } };
      await Promise.all([
        Message.deleteMany(groupFilter),
        Expense.deleteMany(groupFilter),
        Settlement.deleteMany(groupFilter),
        ActivityLog.deleteMany(groupFilter),
        Group.deleteMany({ _id: { $in: groupIds } }),
      ]);
    }
    if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
    await mongoose.disconnect();
  });

  it("creates a group, adds a member, records a shared expense, settles the debt, and sends group chat", async () => {
    // 1. The owner creates a group.
    const createdGroup = await request(app)
      .post("/api/groups")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Weekend trip", description: "Core journey regression" });

    assert.equal(createdGroup.status, 201);
    assert.equal(createdGroup.body.name, "Weekend trip");
    assert.equal(createdGroup.body.members.length, 1);
    assert.equal(createdGroup.body.members[0].role, "admin");

    const groupId = createdGroup.body._id;
    groupIds.push(groupId);

    // 2. The owner adds a registered member and the member can open the group.
    const addedMember = await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: member.email });

    assert.equal(addedMember.status, 201);
    assert.equal(addedMember.body.members.length, 2);
    assert.ok(addedMember.body.members.some(item => item.user?._id === member._id.toString()));

    const memberGroup = await request(app)
      .get(`/api/groups/${groupId}`)
      .set("Authorization", `Bearer ${memberToken}`);

    assert.equal(memberGroup.status, 200);
    assert.equal(memberGroup.body._id, groupId);
    assert.equal(memberGroup.body.members.length, 2);

    const memberGroupList = await request(app)
      .get("/api/groups")
      .set("Authorization", `Bearer ${memberToken}`);
    assert.equal(memberGroupList.status, 200);
    assert.ok(memberGroupList.body.some(group => group._id === groupId));

    // 3. The member records a ₹1,000 expense split equally between both members.
    const createdExpense = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        groupId,
        description: "Train tickets",
        amount: 1000,
        paidBy: member._id.toString(),
        members: [owner._id.toString(), member._id.toString()],
        splitType: "equal",
        category: "travel",
      });

    assert.equal(createdExpense.status, 201);
    assert.equal(createdExpense.body.amount, 1000);
    assert.equal(createdExpense.body.splits.length, 2);
    assert.deepEqual(
      createdExpense.body.splits.map(split => split.amount).sort((a, b) => a - b),
      [500, 500],
    );

    const expenseHistory = await request(app)
      .get(`/api/expenses/group/${groupId}?months=3&page=1`)
      .set("Authorization", `Bearer ${ownerToken}`);

    assert.equal(expenseHistory.status, 200);
    assert.equal(expenseHistory.body.expenses.length, 1);
    assert.equal(expenseHistory.body.expenses[0]._id, createdExpense.body._id);

    // 4. The balance endpoint identifies the owner as owing ₹500 to the payer.
    const initialBalances = await request(app)
      .get(`/api/settlements/simplify/${groupId}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    assert.equal(initialBalances.status, 200);
    assert.equal(initialBalances.body.transactions.length, 1);
    assert.equal(initialBalances.body.transactions[0].from._id, owner._id.toString());
    assert.equal(initialBalances.body.transactions[0].to._id, member._id.toString());
    assert.equal(initialBalances.body.transactions[0].amount, 500);

    // 5. The debtor marks the payment as sent; it remains pending until received.
    const paymentRequest = await request(app)
      .post("/api/settlements/settle")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        groupId,
        toUserId: member._id.toString(),
        amount: 500,
      });

    assert.equal(paymentRequest.status, 201);
    assert.equal(paymentRequest.body.status, "pending");

    const pendingBalances = await request(app)
      .get(`/api/settlements/simplify/${groupId}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    assert.equal(pendingBalances.status, 200);
    assert.equal(pendingBalances.body.pendingRequests.length, 1);
    assert.equal(pendingBalances.body.transactions.length, 0);

    // 6. Only the receiver confirms; confirmed payment clears the debt.
    const confirmedPayment = await request(app)
      .post("/api/settlements/confirm")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        groupId,
        settlementId: paymentRequest.body._id,
      });

    assert.equal(confirmedPayment.status, 200);
    assert.equal(confirmedPayment.body.status, "confirmed");

    const finalBalances = await request(app)
      .get(`/api/settlements/simplify/${groupId}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    assert.equal(finalBalances.status, 200);
    assert.equal(finalBalances.body.transactions.length, 0);
    assert.equal(finalBalances.body.pendingRequests.length, 0);
    assert.equal(finalBalances.body.confirmedSettlements.length, 1);

    // 7. A group member can send and retrieve a message after the financial flow.
    const sentMessage = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ groupId, content: "Train tickets are settled." });

    assert.equal(sentMessage.status, 201);
    assert.equal(sentMessage.body.content, "Train tickets are settled.");
    assert.equal(sentMessage.body.sender._id, owner._id.toString());

    const receivedMessages = await request(app)
      .get(`/api/messages/group/${groupId}`)
      .set("Authorization", `Bearer ${memberToken}`);

    assert.equal(receivedMessages.status, 200);
    assert.equal(receivedMessages.body.length, 1);
    assert.equal(receivedMessages.body[0].content, "Train tickets are settled.");
    assert.equal(receivedMessages.body[0].sender._id, owner._id.toString());
  });
});
