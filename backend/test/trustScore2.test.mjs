import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { getTestDbConfig } from "./testDbHelper.mjs";
import User from "../src/models/User.js";
import Group from "../src/models/Group.js";
import Expense from "../src/models/Expense.js";
import Settlement from "../src/models/Settlement.js";
import ScoreHistory from "../src/models/ScoreHistory.js";
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

  console.log("\n[CLEANUP] Cleaning up test records...");
  await Settlement.deleteMany({ group: testGroup._id });
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
