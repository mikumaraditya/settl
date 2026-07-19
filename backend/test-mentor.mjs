import assert from 'assert';
import { computeMentorReport } from './src/utils/financialMentor.js';

console.log("Running Redesigned Trust Score & Settlement Initiative Unit Tests...");

// Test Case 1: No settlements, consistency score only
// Expenses in 2 months: Month 1 = 100, Month 2 = 100.
// Mean = 100. CV = 0. Consistency = 100. Score = 100.
{
  const settlements = [];
  const expenses = [
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-05-01") },
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-06-01") }
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
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-05-01") },
    { personalShare: 300, splitType: "exact", createdAt: new Date("2026-06-01") }
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
// Score = 0.40 * 100 + 0.40 * 96.43 + 0.20 * 100 = 40 + 38.57 + 20 = 98.57 -> 99.
{
  const createdAt = new Date("2026-06-01T12:00:00Z");
  const updatedAt = new Date("2026-06-01T14:24:00Z");
  const settlements = [
    { status: "confirmed", createdAt, updatedAt }
  ];
  const expenses = [
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-05-01") },
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-06-01") }
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
// - Settlement 1: confirmed, created at 2026-06-16T12:00:00Z. Most recent prior expense at 2026-06-01 (00:00:00Z). Gap = 372 hours.
// - Settlement 2: pending, created at 2026-06-01T12:00:00Z. Most recent prior expense at 2026-06-01 (00:00:00Z). Gap = 12 hours.
// AverageInitiativeHours = (372 + 12) / 2 = 192 hours.
// SettlementInitiative = clamp(100 - (192 / 336) * 100, 0, 100) = 42.85 -> 43.
// Follow-through = 50 (since pending is 15 days old relative to 2026-06-16, c = 0.0).
// Consistency = 50.
// Score = 0.40 * 50 + 0.40 * 43 + 0.20 * 50 = 20 + 17.2 + 10 = 47.2 -> 47.
{
  const settlements = [
    { status: "confirmed", createdAt: new Date("2026-06-16T12:00:00Z"), updatedAt: new Date("2026-06-16T15:00:00Z") },
    { status: "pending", createdAt: new Date("2026-06-01T12:00:00Z") }
  ];
  const expenses = [
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-05-01") },
    { personalShare: 300, splitType: "exact", createdAt: new Date("2026-06-01") }
  ];
  const res = computeMentorReport(settlements, expenses);
  assert.strictEqual(res.signals.followThrough, 50);
  assert.strictEqual(res.signals.settlementInitiative, 43);
  assert.strictEqual(res.signals.consistency, 50);
  assert.strictEqual(res.score, 47);
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
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-06-02T00:00:00Z") }
  ];
  const res = computeMentorReport(settlements, expenses);
  assert.strictEqual(res.signals.settlementInitiative, 100);
  assert.strictEqual(res.score, 100);
  console.log("✔ Test Case 5 Passed (No prior expense, initiative defaulted to 100)");
}

// Test Case 6: Reliability incident (rejection penalty)
// 1 confirmed settlement at 2026-06-01T12:00:00Z (Initiative gap = 12 hours -> Initiative score = 96).
// 1 rejection at 2026-06-02T12:00:00Z.
// Rejections count = 1.0.
// Penalty points = Math.round(50 * (1 - Math.exp(-0.4 * 1.0))) = 16.
// Reliability incidents score = 100 - 16 = 84.
// Base score = 0.40 * 100 + 0.40 * 96.43 + 0.20 * 100 = 98.57 -> 99.
// Final score = 99 - 16 = 83.
{
  const settlements = [
    { status: "confirmed", createdAt: new Date("2026-06-01T12:00:00Z"), updatedAt: new Date("2026-06-01T15:00:00Z") }
  ];
  const expenses = [
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-05-01") },
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-06-01T00:00:00Z") }
  ];
  const rejections = [
    { createdAt: new Date("2026-06-02T12:00:00Z") }
  ];
  const res = computeMentorReport(settlements, expenses, rejections);
  assert.strictEqual(res.signals.followThrough, 100);
  assert.strictEqual(res.signals.settlementInitiative, 96);
  assert.strictEqual(res.signals.reliabilityIncidents, 84);
  assert.strictEqual(res.score, 83);
  assert.strictEqual(res.signalBreakdown.find(s => s.key === "reliabilityIncidents").isWeakest, true);
  console.log("✔ Test Case 6 Passed (Reliability incident penalty factored correctly)");
}

// Test Case 7: Staleness penalty for pending settlements
// - Fresh pending (2 days old): grace period applied, 100% follow-through credit, score remains high.
// - Stale pending (30 days old): 0% credit, follow-through drags down to 0, score drags down.
{
  // A. Fresh pending (2 days old relative to latest date 2026-06-03)
  const freshSettlements = [
    { status: "pending", createdAt: new Date("2026-06-01") } // 2 days old on 2026-06-03
  ];
  const freshExpenses = [
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-06-01") },
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-06-03") } // establishes 2026-06-03 as refDate
  ];
  
  const resFresh = computeMentorReport(freshSettlements, freshExpenses);
  assert.strictEqual(resFresh.signals.followThrough, 100);
  assert.strictEqual(resFresh.score, 100);

  // B. Stale pending (30 days old relative to latest date 2026-06-30)
  const staleSettlements = [
    { status: "pending", createdAt: new Date("2026-06-01") } // 29 days old on 2026-06-30
  ];
  const staleExpenses = [
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-06-01") },
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-06-30") } // establishes 2026-06-30 as refDate
  ];
  
  const resStale = computeMentorReport(staleSettlements, staleExpenses);
  assert.strictEqual(resStale.signals.followThrough, 0);
  assert.strictEqual(resStale.score, 60);
  console.log("✔ Test Case 7 Passed (Fresh pending gets grace credit, stale pending penalized fully)");
}

// Test Case 8: splitType-weighted consistency and confidence multiplier
// User A: Mostly equal splits (0.5x contribution, 0.6x confidence multiplier). Score: 60, low confidence description.
// User B: Mostly exact/percentage splits (1.0x contribution, 1.0x confidence multiplier). Score: 100, high confidence description.
{
  const settlements = [];
  
  // User A: Equal splits only
  const expensesA = [
    { personalShare: 100, splitType: "equal", createdAt: new Date("2026-05-01") },
    { personalShare: 100, splitType: "equal", createdAt: new Date("2026-06-01") }
  ];
  const resA = computeMentorReport(settlements, expensesA);
  assert.strictEqual(resA.score, 60);
  assert.ok(resA.signalBreakdown[0].description.includes("Low confidence"));

  // User B: Exact splits only
  const expensesB = [
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-05-01") },
    { personalShare: 100, splitType: "exact", createdAt: new Date("2026-06-01") }
  ];
  const resB = computeMentorReport(settlements, expensesB);
  assert.strictEqual(resB.score, 100);
  assert.ok(resB.signalBreakdown[0].description.includes("Confidence is high"));

  console.log("✔ Test Case 8 Passed (splitType weightings and confidence multiplier verified)");
}

console.log("All unit tests passed successfully!");
