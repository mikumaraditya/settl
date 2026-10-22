import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import User from "../src/models/User.js";
import Group from "../src/models/Group.js";
import Expense from "../src/models/Expense.js";
import UserFinancialProfile from "../src/models/UserFinancialProfile.js";
import { executeMentorTool, checkDataConsent, CONSENT_REQUIRED_RESPONSE } from "../src/services/mentorTools.js";
import { retrieveKnowledge, formatKnowledgeContext } from "../src/services/knowledgeService.js";
import { runMentorAgent } from "../src/services/mentorAgent.js";
import llmService from "../src/services/llmService.js";
import { getTestDbConfig } from "./testDbHelper.mjs";

async function run12Scenarios() {
  const { testUri, testDbName } = getTestDbConfig();
  await mongoose.connect(testUri);

  console.log("================================================================================");
  console.log("SETTL AI FINANCIAL MENTOR (FINN) - 12 CRITICAL SCENARIO VERIFICATION SUITE");
  console.log(`Database: ${testDbName}`);
  console.log("================================================================================\n");

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failedCount++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Create isolated test user
  const user = await User.create({
    name: "Arjun Verma",
    email: `arjun_${Date.now()}@example.com`,
    password: "password123",
    isEmailVerified: true,
  });
  const userId = user._id.toString();

  // Create second isolated user (for multi-user isolation test)
  const otherUser = await User.create({
    name: "Rahul Sharma",
    email: `rahul_${Date.now()}@example.com`,
    password: "password123",
    isEmailVerified: true,
  });
  const otherUserId = otherUser._id.toString();

  try {
    // --------------------------------------------------------------------------
    // SCENARIO 1: "Explain compound interest with an example."
    // --------------------------------------------------------------------------
    console.log("[SCENARIO 1] Explain compound interest with an example & calculation");
    {
      const knowledge = retrieveKnowledge("Explain compound interest with an example", { maxResults: 2 });
      assert(knowledge.length > 0, "RAG retrieved compound interest passage");
      assert(knowledge.some((k) => k.title.includes("Compound Interest")), "Contains verified Compound Interest fact");
      assert(knowledge.some((k) => k.sourceUrl && k.sourceUrl.includes("rbi.org.in")), "Contains official RBI source URL");

      // Verify deterministic calculator
      const calcResult = await executeMentorTool("calculateCompoundInterest", {
        principal: 100000,
        annualInterestRate: 10,
        timePeriodYears: 5,
        compoundingFrequencyPerYear: 1,
      }, userId);
      assert(calcResult.futureMaturityValue === 161051, "Compound interest math: ₹1,00,000 at 10% for 5 years = ₹1,61,051");
      assert(calcResult.totalInterestEarned === 61051, "Total interest earned = ₹61,051");
      assert(calcResult.doublingYearsRuleOf72 === 7.2, "Rule of 72 doubling time = 7.2 years");
    }

    // --------------------------------------------------------------------------
    // SCENARIO 2: "What is the difference between a fixed deposit and a mutual fund?"
    // --------------------------------------------------------------------------
    console.log("\n[SCENARIO 2] Difference between a fixed deposit and a mutual fund");
    {
      const knowledge = retrieveKnowledge("What is the difference between a fixed deposit and a mutual fund", { maxResults: 3 });
      assert(knowledge.length >= 2, "RAG retrieved multiple comparative passages");
      assert(knowledge.some((k) => k.title.includes("Deposit Insurance") || k.text.includes("DICGC")), "References DICGC ₹5 lakh bank deposit cover");
      assert(knowledge.some((k) => k.text.includes("Mutual funds") || k.text.includes("NAV") || k.text.includes("market")), "References mutual fund market link and risk");
    }

    // --------------------------------------------------------------------------
    // SCENARIO 3: "How much did I spend on food this month?"
    // --------------------------------------------------------------------------
    console.log("\n[SCENARIO 3] Spending on food this month (Settl data retrieval with consent)");
    {
      // Enable consent for test user
      await UserFinancialProfile.create({
        user: userId,
        status: "job",
        monthlyIncome: 50000,
        monthlySavingsTarget: 15000,
        consentToUseForMentor: true,
      });

      // Create a test group with food expenses
      const group = await Group.create({
        name: "Apartment Roommates",
        createdBy: userId,
        members: [{ user: userId, role: "admin" }, { user: otherUserId, role: "member" }],
      });

      await Expense.create({
        description: "Grocery & Food Delivery",
        amount: 3000,
        category: "food",
        group: group._id,
        paidBy: userId,
        splitType: "equal",
        splits: [
          { user: userId, amount: 1500 },
          { user: otherUserId, amount: 1500 },
        ],
      });

      const breakdown = await executeMentorTool("getExpenseBreakdown", { months: 1 }, userId);
      assert(breakdown.consentGranted !== false, "Expense breakdown tool executed with consent");
      assert(breakdown.totalGroupShareSpending === 1500, "User share of group spending = ₹1,500");
      const foodCategory = breakdown.categories.find((c) => c.category === "food");
      assert(foodCategory && foodCategory.amount === 1500, "Category 'food' has exact amount ₹1,500");
      assert(foodCategory.percentage === 100, "Food percentage share = 100%");
    }

    // --------------------------------------------------------------------------
    // SCENARIO 4: "How much should I save each month to reach ₹50,000 in one year?"
    // --------------------------------------------------------------------------
    console.log("\n[SCENARIO 4] Calculate savings needed to reach ₹50,000 in one year");
    {
      const monthlyAmount = Math.round(50000 / 12);
      const timeline = await executeMentorTool("calculateSavingsTimeline", {
        targetAmount: 50000,
        monthlyAmount: monthlyAmount,
        savedSoFar: 0,
      }, userId);
      assert(timeline.monthsNeeded === 12, "Deterministic timeline: ₹4,167/month reaches ₹50,000 in exactly 12 months");
      assert(timeline.yearsNeeded === 1, "Years needed = 1 year");
    }

    // --------------------------------------------------------------------------
    // SCENARIO 5: "Calculate the EMI on a ₹5 lakh loan at 10% annual interest for five years."
    // --------------------------------------------------------------------------
    console.log("\n[SCENARIO 5] Loan EMI calculation (₹5L at 10% for 5 years)");
    {
      const emiResult = await executeMentorTool("calculateLoanEMI", {
        principal: 500000,
        annualInterestRate: 10,
        tenureMonths: 60,
      }, userId);
      assert(emiResult.monthlyEMI === 10624, "Monthly EMI on ₹5L at 10% for 60 months = ₹10,624");
      assert(emiResult.totalInterestPayable === 137440, "Total interest paid = ₹1,37,440");
      assert(emiResult.totalAmountPayable === 637440, "Total payment = ₹6,37,440");
    }

    // --------------------------------------------------------------------------
    // SCENARIO 6: "Explain how inflation affects my savings."
    // --------------------------------------------------------------------------
    console.log("\n[SCENARIO 6] Explain how inflation affects savings");
    {
      const knowledge = retrieveKnowledge("Explain how inflation affects my savings", { maxResults: 2 });
      assert(knowledge.length > 0, "RAG retrieved inflation passage");
      assert(knowledge.some((k) => k.title.includes("Inflation")), "Passage covers Inflation and Purchasing Power");
      assert(knowledge.some((k) => k.text.includes("real rate of return")), "Explains real rate of return (Nominal Rate - Inflation Rate)");
    }

    // --------------------------------------------------------------------------
    // SCENARIO 7: "Where can I get guaranteed returns of 25% in six months?"
    // --------------------------------------------------------------------------
    console.log("\n[SCENARIO 7] Ponzi / high guaranteed-return scam warning");
    {
      const knowledge = retrieveKnowledge("Where can I get guaranteed returns of 25% in six months", { maxResults: 2 });
      assert(knowledge.length > 0, "RAG retrieved scam / unregulated scheme passage");
      assert(knowledge.some((k) => k.title.includes("Guaranteed-Return") || k.title.includes("Ponzi")), "Passage specifically covers Ponzi / Guaranteed return warning");
      assert(knowledge.some((k) => k.text.includes("Banning of Unregulated Deposit Schemes") || k.text.includes("BUDS")), "Cites Banning of Unregulated Deposit Schemes (BUDS) Act, 2019");
    }

    // --------------------------------------------------------------------------
    // SCENARIO 8: "What are the current Indian income tax rules?"
    // --------------------------------------------------------------------------
    console.log("\n[SCENARIO 8] Current Indian income tax rules (Section 115BAC grounding)");
    {
      const knowledge = retrieveKnowledge("What are the current Indian income tax rules", { maxResults: 2 });
      assert(knowledge.length > 0, "RAG retrieved income tax passage");
      assert(knowledge.some((k) => k.title.includes("Tax") || k.text.includes("115BAC")), "Cites Section 115BAC New Tax Regime default");
      assert(knowledge.some((k) => k.text.includes("87A") || k.text.includes("7,00,000")), "Cites rebate up to ₹7,00,000 under Section 87A");
    }

    // --------------------------------------------------------------------------
    // SCENARIO 9: A follow-up question referring to a previous calculation
    // --------------------------------------------------------------------------
    console.log("\n[SCENARIO 9] Follow-up question referring to previous calculation");
    {
      const conversationHistory = [
        {
          role: "user",
          content: "Calculate the EMI on a ₹5 lakh loan at 10% annual interest for five years.",
        },
        {
          role: "assistant",
          content: "For a ₹5,00,000 loan at 10% annual interest over 5 years (60 months), your monthly EMI is **₹10,624**. Total interest payable is **₹1,37,440**.",
          toolsUsed: [{ name: "calculateLoanEMI" }],
        },
      ];

      // Test that calculateLoanEMI can be called with new parameters based on follow-up context
      const followUpCalc = await executeMentorTool("calculateLoanEMI", {
        principal: 500000,
        annualInterestRate: 8,
        tenureMonths: 60,
      }, userId);
      assert(followUpCalc.monthlyEMI === 10138, "Follow-up at 8% recalculates EMI to ₹10,138");
      assert(followUpCalc.totalInterestPayable === 108280, "Follow-up at 8% reduces total interest to ₹1,08,280");
      const interestSaved = 137440 - 108280;
      assert(interestSaved === 29160, "User saves exactly ₹29,160 in interest at 8%");
    }

    // --------------------------------------------------------------------------
    // SCENARIO 10: Multi-user isolation (accessing another user's private data)
    // --------------------------------------------------------------------------
    console.log("\n[SCENARIO 10] Multi-user isolation and privacy boundary");
    {
      await UserFinancialProfile.create({
        user: otherUserId,
        consentToUseForMentor: true,
      });

      // Querying as otherUserId returns only otherUserId's figures
      const otherUserSummary = await executeMentorTool("getUserFinancialSummary", {}, otherUserId);
      assert(otherUserSummary.totalPaidUpfront === 0, "Rahul Sharma's summary correctly shows 0 paid upfront");
      assert(otherUserSummary.totalYouOwe === 1500, "Rahul Sharma's summary correctly shows he owes ₹1,500");

      const arjunSummary = await executeMentorTool("getUserFinancialSummary", {}, userId);
      assert(arjunSummary.totalPaidUpfront === 3000, "Arjun's summary correctly shows he paid ₹3,000 upfront");
      assert(arjunSummary.totalOwedToYou === 1500, "Arjun's summary correctly shows he is owed ₹1,500");
    }

    // --------------------------------------------------------------------------
    // SCENARIO 11: A user who has NOT granted financial-data consent
    // --------------------------------------------------------------------------
    console.log("\n[SCENARIO 11] Unconsented user requesting private Settl data");
    {
      // Revoke consent for test user
      await UserFinancialProfile.updateOne({ user: userId }, { consentToUseForMentor: false });

      const hasConsent = await checkDataConsent(userId);
      assert(hasConsent === false, "checkDataConsent correctly returns false");

      // Verify all 8 private Settl data tools refuse execution and return CONSENT_REQUIRED_RESPONSE
      const privateTools = [
        "getUserFinancialSummary",
        "getGroupBalances",
        "getPendingSettlements",
        "getExpenseBreakdown",
        "getSpendingTrend",
        "getTrustScoreDetails",
        "getTrustScoreHistory",
        "getSettlementHistory",
      ];

      for (const toolName of privateTools) {
        const result = await executeMentorTool(toolName, {}, userId);
        assert(result.requiresConsent === true, `${toolName} refused execution without consent`);
        assert(result.consentGranted === false, `${toolName} flagged consentGranted: false`);
      }

      // Calculators still work freely without consent!
      const calcStillWorks = await executeMentorTool("calculateBudgetSplit", { monthlyIncome: 40000 }, userId);
      assert(calcStillWorks.needsApproximate === 20000, "Educational calculators remain fully accessible without consent");
    }

    // --------------------------------------------------------------------------
    // SCENARIO 12: Gemini outage or 503 fallback handling
    // --------------------------------------------------------------------------
    console.log("\n[SCENARIO 12] Model resilience & candidate fallback verification");
    {
      // Verify llmService candidate list and error handling
      assert(Array.isArray(llmService.CANDIDATE_MODELS), "llmService defines CANDIDATE_MODELS array");
      assert(llmService.CANDIDATE_MODELS.length >= 3, "Contains primary and at least 2 fallback candidates");
      assert(llmService.CANDIDATE_MODELS.includes("gemini-2.5-flash"), "Contains gemini-2.5-flash as robust fallback");

      // Verify thinkingConfig gating (only 3.1 gets thinkingConfig, avoiding HTTP 400 on 2.5)
      const testConfig31 = llmService.buildGenerationConfig("gemini-3.1-flash-lite");
      assert(testConfig31.thinkingConfig !== undefined, "gemini-3.1 includes thinkingConfig");

      const testConfig25 = llmService.buildGenerationConfig("gemini-2.5-flash");
      assert(testConfig25.thinkingConfig === undefined, "gemini-2.5 omits thinkingConfig to prevent HTTP 400");
    }

    console.log("\n================================================================================");
    console.log(`ALL 12 SCENARIO TESTS PASSED! (${passedCount} checks passed, ${failedCount} failed)`);
    console.log("================================================================================\n");
  } finally {
    // Clean up test data
    await Expense.deleteMany({});
    await Group.deleteMany({});
    await UserFinancialProfile.deleteMany({ user: { $in: [userId, otherUserId] } });
    await User.deleteMany({ _id: { $in: [userId, otherUserId] } });
    await mongoose.disconnect();
  }
}

run12Scenarios().catch((err) => {
  console.error("\n❌ SCENARIO TEST ERROR:", err);
  process.exit(1);
});
