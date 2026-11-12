import test from "node:test";
import assert from "node:assert/strict";
import { buildGroupBalanceEvidence } from "../src/utils/financialReconciliation.js";

const userId = "user-aditya";
const payerId = "user-krishna";
const group = {
  _id: "group-roomies",
  name: "Roomies",
  members: [
    { user: { _id: userId, name: "Aditya" } },
    { user: { _id: payerId, name: "Krishna" } },
  ],
};

test("reconciles a user's expense share against Settl's existing balance engine", () => {
  const result = buildGroupBalanceEvidence({
    group,
    userId,
    expenses: [{
      _id: "expense-cab",
      description: "Cab Ride",
      category: "travel",
      amount: 400,
      paidBy: { _id: payerId, name: "Krishna" },
      splits: [
        { user: { _id: userId }, amount: 200 },
        { user: { _id: payerId }, amount: 200 },
      ],
      createdAt: new Date("2026-09-04T10:00:00.000Z"),
    }],
  });

  assert.equal(result.userNetBalance, -200);
  assert.equal(result.balanceDirection, "you_owe");
  assert.equal(result.expenseEvidence[0].yourShare, 200);
  assert.equal(result.reconciliation.matches, true);
  assert.equal(result.reconciliation.difference, 0);
});

test("only confirmed settlements change the authoritative balance", () => {
  const base = {
    group,
    userId,
    expenses: [{
      amount: 400,
      paidBy: payerId,
      splits: [{ user: userId, amount: 200 }, { user: payerId, amount: 200 }],
    }],
  };
  const pending = buildGroupBalanceEvidence({
    ...base,
    settlements: [{ _id: "pending-1", from: userId, to: payerId, amount: 200, status: "pending" }],
  });
  const confirmed = buildGroupBalanceEvidence({
    ...base,
    settlements: [{ _id: "confirmed-1", from: userId, to: payerId, amount: 200, status: "confirmed" }],
  });

  assert.equal(pending.userNetBalance, -200);
  assert.equal(confirmed.userNetBalance, 0);
  assert.equal(pending.settlementEvidence[0].affectsCurrentBalance, false);
  assert.equal(confirmed.settlementEvidence[0].affectsCurrentBalance, true);
  assert.equal(confirmed.reconciliation.matches, true);
});

test("flags incomplete evidence rather than inventing a reconciliation", () => {
  const result = buildGroupBalanceEvidence({
    group,
    userId,
    limit: 1,
    expenses: [
      { _id: "e1", amount: 100, paidBy: payerId, splits: [{ user: userId, amount: 50 }], createdAt: new Date("2026-09-01") },
      { _id: "e2", amount: 100, paidBy: payerId, splits: [{ user: userId, amount: 50 }], createdAt: new Date("2026-09-02") },
    ],
  });

  assert.equal(result.evidenceIsPartial, true);
  assert.equal(result.hasMoreExpenses, true);
  assert.equal(result.reconciliation.matches, false);
});
