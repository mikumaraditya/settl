import assert from 'assert';
import { computeMentorReport } from './src/utils/financialMentor.js';

console.log("Running AI Financial Mentor Scoring Formula Unit Tests...");

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
  assert.strictEqual(res.score, 100); // 1
  assert.strictEqual(res.scoreBand, "Excellent"); // 2
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
  assert.strictEqual(res.score, 50); // 3
  assert.strictEqual(res.scoreBand, "Needs Attention"); // 4
  console.log("✔ Test Case 2 Passed (No settlements, moderate consistency)");
}

// Test Case 3: Confirmed settlements (100% follow-through, fast promptness)
// 1 settlement: confirmed in 2.4 hours.
// AverageConfirmationHours = 2.4.
// Promptness = clamp(100 - (2.4 / 336) * 100, 0, 100) = 99.28 -> 99.
// FollowThrough = 100%.
// Expenses: consistency = 100.
// Score = 0.35 * 100 + 0.30 * 99 + 0.35 * 100 = 35 + 29.7 + 35 = 99.7 -> 100.
{
  const createdAt = new Date("2026-06-01T12:00:00Z");
  const updatedAt = new Date("2026-06-01T14:24:00Z"); // 2.4 hours later
  const settlements = [
    { status: "confirmed", createdAt, updatedAt }
  ];
  const expenses = [
    { personalShare: 100, createdAt: new Date("2026-05-01") },
    { personalShare: 100, createdAt: new Date("2026-06-01") }
  ];
  const res = computeMentorReport(settlements, expenses);
  assert.strictEqual(res.signals.followThrough, 100); // 5
  assert.strictEqual(res.signals.promptness, 99); // 6
  assert.strictEqual(res.signals.consistency, 100); // 7
  assert.strictEqual(res.score, 100); // 8
  assert.strictEqual(res.scoreBand, "Excellent"); // 9
  assert.strictEqual(res.signalBreakdown.find(s => s.key === "promptness").isWeakest, true); // 10
  console.log("✔ Test Case 3 Passed (Confirmed settlement, high score)");
}

// Test Case 4: Mixed settlements (50% follow-through, slow promptness)
// 2 settlements: 1 confirmed after 168 hours (7 days), 1 pending.
// Follow-through = 50.
// Promptness = 50.
// Consistency = 50.
// Score = 0.35 * 50 + 0.30 * 50 + 0.35 * 50 = 50.
{
  const createdAt = new Date("2026-06-01T00:00:00Z");
  const updatedAt = new Date("2026-06-08T00:00:00Z"); // 7 days later = 168 hours
  const settlements = [
    { status: "confirmed", createdAt, updatedAt },
    { status: "pending", createdAt: new Date(), updatedAt: new Date() }
  ];
  const expenses = [
    { personalShare: 100, createdAt: new Date("2026-05-01") },
    { personalShare: 300, createdAt: new Date("2026-06-01") }
  ];
  const res = computeMentorReport(settlements, expenses);
  assert.strictEqual(res.signals.followThrough, 50); // 11
  assert.strictEqual(res.signals.promptness, 50); // 12
  assert.strictEqual(res.signals.consistency, 50); // 13
  assert.strictEqual(res.score, 50); // 14
  console.log("✔ Test Case 4 Passed (Mixed settlements, moderate score)");
}

console.log("All unit tests passed successfully!");
