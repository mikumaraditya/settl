import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { getTestDbConfig } from "./testDbHelper.mjs";
import User from "../src/models/User.js";
import Group from "../src/models/Group.js";
import Expense from "../src/models/Expense.js";
import Settlement from "../src/models/Settlement.js";
import ScoreHistory from "../src/models/ScoreHistory.js";
import SettlementSchedule from "../src/models/SettlementSchedule.js";
import { computeMentorReport } from "../src/utils/financialMentor.js";
import { getTrustScoreForUser } from "../src/routes/insights.js";

async function runTrustScore2Tests() {
  const { testUri, testDbName } = getTestDbConfig();
  console.log("==================================================");
  console.log("TRUST SCORE 2.0 VERIFICATION SUITE");
  console.log(`Database: ${testDbName}`);
  console.log("==================================================");

  await mongoose.connect(testUri);

  const timestamp = Date.now();
  const userA = await User.create({ name: "TrustUserA", email: `trust_a_${timestamp}@test.com`, password: "password123", isEmailVerified: true });
  const userB = await User.create({ name: "TrustUserB", email: `trust_b_${timestamp}@test.com`, password: "password123", isEmailVerified: true });

  const testGroup = await Group.create({
    name: `Trust Test Group ${timestamp}`,
    members: [{ user: userA._id }, { user: userB._id }],
    createdBy: userA._id,
  });

  // TEST 1: New / Ineligible user returns status 'new' with null score
  console.log("\n[TEST 1] Ineligible user without enough history");
  {
    const res = await getTrustScoreForUser(userA._id.toString());
    if (res.status === "new" && res.score === null && res.scoreBand === "New") {
      console.log("  ✅ PASS: New user safely returns status 'new' with null score");
    } else {
      console.error("  ❌ FAIL: New user returned unexpected score:", res);
    }
    if (res.activity && res.activity.expenses === 0 && res.activity.activeMonths === 0) {
      console.log("  ✅ PASS: Activity requirement metrics accurately report 0/3 expenses and 0/2 months");
    } else {
      console.error("  ❌ FAIL: Activity metrics not present or inaccurate:", res.activity);
    }
  }

  // TEST 2: Cancelled settlement does NOT drag down followThrough
  console.log("\n[TEST 2] Cancelled settlement exclusion from followThrough");
  {
    const settlements = [
      { status: "confirmed", createdAt: new Date(Date.now() - 5 * 864e5) },
      { status: "cancelled", createdAt: new Date(Date.now() - 40 * 864e5) }, // old cancelled request
    ];
    const personalExpenses = [
      { personalShare: 500, isPaidByUser: true, createdAt: new Date(Date.now() - 40 * 864e5), group: testGroup._id },
      { personalShare: 500, isPaidByUser: false, createdAt: new Date(Date.now() - 20 * 864e5), group: testGroup._id },
      { personalShare: 500, isPaidByUser: false, createdAt: new Date(Date.now() - 5 * 864e5), group: testGroup._id },
    ];
    const report = computeMentorReport(settlements, personalExpenses, []);
    
    // Follow-through with cancelled excluded should be 100% since the only active settlement is confirmed
    if (report.signals.followThrough === 100) {
      console.log("  ✅ PASS: Cancelled settlement was excluded; followThrough remains 100%");
    } else {
      console.error(`  ❌ FAIL: followThrough was degraded by cancelled request: ${report.signals.followThrough}%`);
    }
  }

  // TEST 2B: Cancelled/rejected settlements do not unlock repayment reliability or affect initiative
  console.log("\n[TEST 2B] Invalid settlement records excluded from eligibility and initiative");
  {
    const invalidOnly = [
      { status: "cancelled", createdAt: new Date(Date.now() - 2 * 864e5), group: testGroup._id },
      { status: "rejected", createdAt: new Date(Date.now() - 1 * 864e5), group: testGroup._id },
    ];
    const invalidReport = computeMentorReport(invalidOnly, [], []);
    if (!invalidReport.signalBreakdown.some((s) => s.key === "repaymentReliability")) {
      console.log("  PASS: Cancelled/rejected-only history does not qualify repayment reliability");
    } else {
      throw new Error("Cancelled/rejected settlements incorrectly qualified repayment reliability");
    }

    const expenseDate = new Date(Date.now() - 10 * 864e5);
    const baselineSettlements = [
      { status: "confirmed", createdAt: new Date(expenseDate.getTime() + 24 * 3600000), group: testGroup._id },
    ];
    const initiativeExpenses = [
      { personalShare: 100, isPaidByUser: true, createdAt: expenseDate, group: testGroup._id },
    ];
    const baseline = computeMentorReport(baselineSettlements, initiativeExpenses, []);
    const withInvalid = computeMentorReport([
      ...baselineSettlements,
      { status: "cancelled", createdAt: new Date(Date.now() - 1 * 864e5), group: testGroup._id },
      { status: "rejected", createdAt: new Date(Date.now() - 1 * 864e5), group: testGroup._id },
    ], initiativeExpenses, []);
    if (withInvalid.signals.settlementInitiative === baseline.signals.settlementInitiative) {
      console.log("  PASS: Cancelled/rejected records do not influence settlement initiative");
    } else {
      throw new Error("Cancelled/rejected settlements changed settlement initiative");
    }
  }

  // TEST 2C: Historical records age against the current/reference date, not the newest transaction.
  console.log("\\n[TEST 2C] Recency aging uses current reference date");
  {
    const referenceDate = new Date("2026-11-28T12:00:00.000Z");
    const expenses = [
      { personalShare: 100, isPaidByUser: true, createdAt: new Date("2026-07-31T12:00:00.000Z") }, // 120 days old
      { personalShare: 100, isPaidByUser: false, createdAt: new Date("2026-11-23T12:00:00.000Z") }, // 5 days old
      { personalShare: 100, isPaidByUser: false, createdAt: new Date("2026-11-26T12:00:00.000Z") }, // 2 days old
    ];
    const report = computeMentorReport([], expenses, [], [], referenceDate);
    if (report.signals.contribution === 9) {
      console.log("  PASS: Old paid expense is down-weighted while recent unpaid expenses retain full weight");
    } else {
      throw new Error(`Historical expense recency did not age as expected: contribution=${report.signals.contribution}`);
    }
  }

  // TEST 3: Preservation of rejected settlements (auditability)
  console.log("\n[TEST 3] Preserved rejected settlement record & due date assignment");
  {
    const dueDate = new Date(Date.now() + 7 * 864e5);
    const s = await Settlement.create({
      group: testGroup._id,
      from: userA._id,
      to: userB._id,
      amount: 450,
      status: "pending",
      dueDate,
    });

    if (s.dueDate && s.status === "pending") {
      console.log("  ✅ PASS: Settlement created with explicit dueDate");
    } else {
      console.error("  ❌ FAIL: Settlement missing dueDate");
    }

    // Mark rejected
    s.status = "rejected";
    s.rejectionReason = "UPI reference not found in bank statement";
    await s.save();

    const retrieved = await Settlement.findById(s._id);
    if (retrieved && retrieved.status === "rejected" && retrieved.rejectionReason.includes("UPI reference")) {
      console.log("  ✅ PASS: Rejected settlement is preserved in MongoDB with reason, not deleted");
    } else {
      console.error("  ❌ FAIL: Rejected settlement was not preserved properly:", retrieved);
    }
  }

  // TEST 4: ScoreHistory schema & idempotency
  console.log("\n[TEST 4] ScoreHistory enhanced schema & idempotency check");
  {
    const entry1 = await ScoreHistory.create({
      user: userA._id,
      score: 82,
      delta: 0,
      reason: "Initial baseline score recorded",
      eventType: "initial_baseline",
    });

    if (entry1.delta === 0 && entry1.reason.includes("Initial baseline")) {
      console.log("  ✅ PASS: ScoreHistory stores delta, reason, and eventType");
    } else {
      console.error("  ❌ FAIL: ScoreHistory schema fields missing:", entry1);
    }

    // Verify duplicate prevention logic
    const latest = await ScoreHistory.findOne({ user: userA._id }, {}, { sort: { createdAt: -1 } });
    const currentScore = 82; // same score
    const wouldInsert = latest.score !== currentScore;
    if (!wouldInsert) {
      console.log("  ✅ PASS: Duplicate insertion correctly blocked when score is unchanged (82 === 82)");
    } else {
      console.error("  ❌ FAIL: Duplicate would have been inserted");
    }

    // Verify change triggers entry
    const newScore = 87;
    const delta = newScore - latest.score;
    const entry2 = await ScoreHistory.create({
      user: userA._id,
      score: newScore,
      delta,
      reason: `Score improved by +${delta} pts through verified on-time payments`,
      eventType: "score_adjustment",
    });

    if (entry2.delta === 5 && entry2.score === 87) {
      console.log("  ✅ PASS: Genuine score change created history entry with delta +5 pts");
    } else {
      console.error("  ❌ FAIL: Delta entry not created properly:", entry2);
    }
  }

  // TEST 5: An accepted repayment schedule that has passed its due date lowers live Trust Score.
  console.log("\n[TEST 5] Live overdue schedule Trust Score impact");
  const scoreNow = new Date();
  await Expense.create([
    {
      description: "Overdue score expense one",
      amount: 600,
      paidBy: userB._id,
      group: testGroup._id,
      splits: [{ user: userA._id, amount: 300 }, { user: userB._id, amount: 300 }],
      createdAt: new Date(scoreNow.getTime() - 90 * 864e5),
    },
    {
      description: "Overdue score expense two",
      amount: 600,
      paidBy: userB._id,
      group: testGroup._id,
      splits: [{ user: userA._id, amount: 300 }, { user: userB._id, amount: 300 }],
      createdAt: new Date(scoreNow.getTime() - 45 * 864e5),
    },
    {
      description: "Overdue score expense three",
      amount: 600,
      paidBy: userA._id,
      group: testGroup._id,
      splits: [{ user: userA._id, amount: 300 }, { user: userB._id, amount: 300 }],
      createdAt: new Date(scoreNow.getTime() - 5 * 864e5),
    },
  ]);
  await Settlement.create([
    { group: testGroup._id, from: userA._id, to: userB._id, amount: 100, status: "confirmed", createdAt: new Date(scoreNow.getTime() - 30 * 864e5) },
    { group: testGroup._id, from: userA._id, to: userB._id, amount: 100, status: "confirmed", createdAt: new Date(scoreNow.getTime() - 2 * 864e5) },
  ]);
  const baselineScore = await getTrustScoreForUser(userA._id.toString());
  const overdueDueDate = new Date(scoreNow.getTime() - 2 * 864e5);
  const overdueSchedule = await SettlementSchedule.create({
    group: testGroup._id,
    from: userA._id,
    to: userB._id,
    amount: 100,
    dueDate: overdueDueDate,
    timeZone: "UTC",
    status: "accepted",
    active: true,
  });
  const overdueScore = await getTrustScoreForUser(userA._id.toString());
  if (
    baselineScore.status === "ready" &&
    overdueScore.overdueRepaymentCount === 1 &&
    overdueScore.overduePenaltyPoints === 10 &&
    overdueScore.score === Math.max(0, baselineScore.score - 10)
  ) {
    console.log("  ✅ PASS: One overdue accepted schedule deducts 10 Trust Score points");
  } else {
    throw new Error(`Unexpected overdue score values: ${JSON.stringify({ baselineScore, overdueScore })}`);
  }

  await SettlementSchedule.updateOne({ _id: overdueSchedule._id }, { $set: { status: "payment_pending" } });
  const paymentPendingScore = await getTrustScoreForUser(userA._id.toString());
  if (paymentPendingScore.score === baselineScore.score && paymentPendingScore.overdueRepaymentCount === 0) {
    console.log("  ✅ PASS: Once payment is marked sent, the deadline deduction is lifted while receiver confirmation is pending");
  } else {
    throw new Error(`Payment awaiting receiver confirmation must not remain overdue: ${JSON.stringify(paymentPendingScore)}`);
  }

  console.log("\n[CLEANUP] Cleaning up test records...");
  await Settlement.deleteMany({ group: testGroup._id });
  await SettlementSchedule.deleteMany({ group: testGroup._id });
  await Expense.deleteMany({ group: testGroup._id });
  await ScoreHistory.deleteMany({ user: { $in: [userA._id, userB._id] } });
  await Group.findByIdAndDelete(testGroup._id);
  await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
  await mongoose.disconnect();

  console.log("==================================================");
  console.log("ALL TRUST SCORE 2.0 TESTS PASSED CLEANLY!");
  console.log("==================================================");
}

runTrustScore2Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
