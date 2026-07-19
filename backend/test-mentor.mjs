import assert from 'assert';
import { computeMentorReport } from './src/utils/financialMentor.js';

console.log("Running Redesigned Trust Score & Settlement Initiative Unit Tests...");

// Test Case 1: No settlements, consistency score only
// Expenses in 2 months: Month 1 = 100, Month 2 = 100.
// Mean = 100. CV = 0. Consistency = 100. Score = 100.
{
  const settlements = [];
  const expenses = [
    { personalShare: 100, createdAt: new Date("2026-05-01") },
    { personalShare: 100, createdAt: new Date("2026-06-01") }
  ];
  const res = computeMentorReport(settlements, expenses);
  assert.strictEqual(res.score, 100);
  assert.strictEqual(res.scoreBand, "Excellent");
  console.log("✔ Test Case 1 Passed (No settlements, perfect consistency)");
}

// Test Case 2: No settlements, low consistency
// Expenses in 2 months: Month 1 = 100, Month 2 = 300.
// Mean = 200. CV = 100 / 200 = 0.5. Consistency = 50.
{
  const settlements = [];
  const expenses = [
    { personalShare: 100, createdAt: new Date("2026-05-01") },
    { personalShare: 300, createdAt: new Date("2026-06-01") }
  ];
  const res = computeMentorReport(settlements, expenses);
  assert.strictEqual(res.score, 50);
  assert.strictEqual(res.scoreBand, "Needs Attention");
  console.log("✔ Test Case 2 Passed (No settlements, moderate consistency)");
}

// Test Case 3: Confirmed settlements (100% follow-through, fast settlement initiative)
// 1 settlement: confirmed, created at 2026-06-01T12:00:00Z.
// Prior expenses: 2026-05-01 and 2026-06-01 (00:00:00Z).
// Most recent prior expense is 2026-06-01 (00:00:00Z).
// Gap = 12 hours.
// AverageInitiativeHours = 12.
// SettlementInitiative = clamp(100 - (12 / 336) * 100, 0, 100) = 96.4 -> 96.
// FollowThrough = 100%.
// Expenses: consistency = 100.
// Score = 0.40 * 100 + 0.35 * 96.43 + 0.25 * 100 = 40 + 33.75 + 25 = 98.75 -> 99.
{
  const createdAt = new Date("2026-06-01T12:00:00Z");
  const updatedAt = new Date("2026-06-01T14:24:00Z");
  const settlements = [
    { status: "confirmed", createdAt, updatedAt }
  ];
  const expenses = [
    { personalShare: 100, createdAt: new Date("2026-05-01") },
    { personalShare: 100, createdAt: new Date("2026-06-01") }
  ];
  const res = computeMentorReport(settlements, expenses);
  assert.strictEqual(res.signals.followThrough, 100);
  assert.strictEqual(res.signals.settlementInitiative, 96);
  assert.strictEqual(res.signals.consistency, 100);
  assert.strictEqual(res.score, 99);
  assert.strictEqual(res.scoreBand, "Excellent");
  assert.strictEqual(res.signalBreakdown.find(s => s.key === "settlementInitiative").isWeakest, true);
  console.log("✔ Test Case 3 Passed (Confirmed settlement, high score)");
}

// Test Case 4: Mixed settlements (50% follow-through, mixed settlement initiative)
// 2 settlements: 
// - Settlement 1: confirmed, created at 2026-06-01T12:00:00Z. Most recent prior expense at 2026-06-01 (00:00:00Z). Gap = 12 hours.
// - Settlement 2: pending, created at 2026-06-15T12:00:00Z. Most recent prior expense at 2026-06-01 (00:00:00Z). Gap = 348 hours.
// AverageInitiativeHours = (12 + 348) / 2 = 180 hours.
// SettlementInitiative = clamp(100 - (180 / 336) * 100, 0, 100) = 46.4 -> 46.
// Follow-through = 50.
// Consistency = 50.
// Score = 0.40 * 50 + 0.35 * 46.43 + 0.25 * 50 = 20 + 16.25 + 12.5 = 48.75 -> 49.
{
  const settlements = [
    { status: "confirmed", createdAt: new Date("2026-06-01T12:00:00Z"), updatedAt: new Date("2026-06-01T15:00:00Z") },
    { status: "pending", createdAt: new Date("2026-06-15T12:00:00Z") }
  ];
  const expenses = [
    { personalShare: 100, createdAt: new Date("2026-05-01") },
    { personalShare: 300, createdAt: new Date("2026-06-01") }
  ];
  const res = computeMentorReport(settlements, expenses);
  assert.strictEqual(res.signals.followThrough, 50);
  assert.strictEqual(res.signals.settlementInitiative, 46);
  assert.strictEqual(res.signals.consistency, 50);
  assert.strictEqual(res.score, 49);
  console.log("✔ Test Case 4 Passed (Mixed settlements, moderate score)");
}

// Test Case 5: No prior expense in the group edge case
// 1 settlement at 2026-06-01, but the only expense in group is at 2026-06-02 (after settlement).
// Initiative should skip this settlement, default to 100.
{
  const settlements = [
    { status: "confirmed", createdAt: new Date("2026-06-01T00:00:00Z"), updatedAt: new Date("2026-06-01T02:00:00Z") }
  ];
  const expenses = [
    { personalShare: 100, createdAt: new Date("2026-06-02T00:00:00Z") }
  ];
  const res = computeMentorReport(settlements, expenses);
  assert.strictEqual(res.signals.settlementInitiative, 100);
  assert.strictEqual(res.score, 100);
  console.log("✔ Test Case 5 Passed (No prior expense, initiative defaulted to 100)");
}

console.log("All unit tests passed successfully!");
