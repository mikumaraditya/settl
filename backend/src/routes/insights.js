import express from "express";
import fs from "fs";
import path from "path";
import Expense from "../models/Expense.js";
import Group from "../models/Group.js";
import Settlement from "../models/Settlement.js";
import protect from "../middleware/auth.js";
import requireVerified from "../middleware/requireVerified.js";
import { computeMentorReport, computeWhatIfProjection } from "../utils/financialMentor.js";
import { getUserFinancialSummary } from "../services/mentorTools.js";
import ActivityLog from "../models/ActivityLog.js";
import ScoreHistory from "../models/ScoreHistory.js";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";

const router = express.Router();

// ── Mentor cache (4 h, full AI report) ───────────────────────────────────────
const MENTOR_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const mentorCache = new Map();

// ── Trust-score cache (20 min, lightweight score/band per user) ───────────────
// Keyed on targetUserId — score is viewer-independent, so one cached entry
// correctly serves every group member viewing the same user simultaneously.
const TRUST_SCORE_CACHE_TTL_MS = 20 * 60 * 1000;
const trustScoreCache = new Map();

/**
 * Evict a user's cached trust score immediately.
 * Call this whenever a settlement or expense affecting the user is
 * created/confirmed so the group list reflects the change without
 * waiting for the 20-minute TTL to expire.
 */
export function clearTrustScoreCache(userId) {
  trustScoreCache.delete(String(userId));
}

export function clearMentorCache(userId) {
  mentorCache.delete(String(userId));
}

export function clearInsightCaches(userIds) {
  for (const userId of new Set(userIds.filter(Boolean).map(String))) {
    clearTrustScoreCache(userId);
    clearMentorCache(userId);
    userTipsCache.delete(String(userId));
  }
}

const round = (value) => Math.round(value * 100) / 100;

const fallbackMentorCopy = (score, scoreBand, signalBreakdown, scoreTrend = null, whatIf = null) => {
  let explanation = `Your Trust Score is ${score}/100, placing you in the '${scoreBand}' category.`;
  if (scoreTrend && scoreTrend.delta > 0) {
    explanation += ` Your score is up ${scoreTrend.delta} point${scoreTrend.delta !== 1 ? 's' : ''} since last time — nice work.`;
  } else if (scoreTrend && scoreTrend.delta < 0) {
    explanation += ` Your score dipped ${Math.abs(scoreTrend.delta)} point${Math.abs(scoreTrend.delta) !== 1 ? 's' : ''} since last time — let's get it back up.`;
  } else {
    explanation += ` Your recent group activity shows some areas for potential improvement.`;
  }

  const suggestions = [];
  const repaymentSig = signalBreakdown.find((s) => s.key === "repaymentReliability");
  const contributionSig = signalBreakdown.find((s) => s.key === "contribution");
  const consistencySig = signalBreakdown.find((s) => s.key === "consistency");

  if (repaymentSig && repaymentSig.value < 80) {
    const base = "Pay back what you owe to someone in your group as soon as you can, so your group knows they'll get their money.";
    const suffix =
      whatIf && whatIf.dimension === "repaymentReliability" && whatIf.delta > 0
        ? ` Hitting a faster pace on repayments could push your score to around ${whatIf.projectedScore}.`
        : "";
    suggestions.push(base + suffix);
  } else if (contributionSig && contributionSig.value < 80) {
    const base = "Pay for a few more shared expenses upfront when you can — your group will notice.";
    const suffix =
      whatIf && whatIf.dimension === "contribution" && whatIf.delta > 0
        ? ` Paying upfront for just 15% more expenses could push your score to around ${whatIf.projectedScore}.`
        : "";
    suggestions.push(base + suffix);
  } else {
    suggestions.push("Keep paying people back quickly when you owe them money to maintain a high level of trust.");
  }

  if (consistencySig && consistencySig.value < 60) {
    suggestions.push("Try setting a steady monthly budget for shared bills so everyone knows what to expect.");
  } else {
    suggestions.push("Keep your shared bills steady to make it easy for your group to plan upcoming activities.");
  }

  return {
    explanation,
    suggestions: suggestions.slice(0, 2),
    suggestedCheckIn: "weekly",
  };
};

export const getMentorCopy = async (score, scoreBand, signalBreakdown, observations, signals, primaryFocus, scoreTrend = null, whatIf = null) => {
  return fallbackMentorCopy(score, scoreBand, signalBreakdown, scoreTrend, whatIf);
};

export async function getTrustScoreForUser(userId) {
  const groups = await Group.find({ "members.user": userId }).select("name").lean();
  const groupIds = groups.map((group) => group._id);
  if (groupIds.length === 0) {
    return { status: "not_enough_data", score: null, scoreBand: "N/A" };
  }

  const [expenses, settlements, rejections] = await Promise.all([
    Expense.find({
      group: { $in: groupIds },
      $or: [{ "splits.user": userId }, { paidBy: userId }],
    })
      .select("description amount category group splits splitType paidBy createdAt")
      .lean(),
    Settlement.find({ group: { $in: groupIds }, from: userId })
      .select("status amount group createdAt updatedAt")
      .lean(),
    ActivityLog.find({
      type: "settlement_rejected",
      "meta.fromId": new mongoose.Types.ObjectId(userId),
      group: { $in: groupIds },
    })
      .select("createdAt")
      .lean(),
  ]);

  const groupNames = new Map(groups.map((group) => [group._id.toString(), group.name]));
  const personalExpenses = expenses
    .map((expense) => {
      const share = expense.splits.find((split) => split.user.toString() === userId);
      return {
        ...expense,
        personalShare: Number(share?.amount || 0),
        isPaidByUser: expense.paidBy ? expense.paidBy.toString() === userId : false,
        groupName: groupNames.get(expense.group.toString()) || "a group",
      };
    })
    .filter((expense) => expense.personalShare > 0 || expense.isPaidByUser);

  const activeMonths = new Set(personalExpenses.map((expense) => expense.createdAt.toISOString().slice(0, 7)));
  if (personalExpenses.length < 3 || activeMonths.size < 2) {
    return {
      status: "new",
      // A trust score needs enough history to be comparable. Never rank a new
      // member at 100 simply because we have not observed their activity yet.
      score: null,
      scoreBand: "New",
      activity: { expenses: personalExpenses.length, activeMonths: activeMonths.size, settlements: settlements.length, groups: groups.length },
    };
  }

  const report = computeMentorReport(settlements, personalExpenses, rejections);
  return {
    status: "ready",
    score: report.score,
    scoreBand: report.scoreBand
  };
}

// Rate limiter for trust-score — much higher than /mentor (no Gemini cost),
// generous enough for groups with many members all loaded simultaneously.
const trustScoreRateLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute window
  max: 60,                     // 60 req/min per requesting user
  keyGenerator: (req) => req.user.id,
  message: { message: "Too many requests, please slow down." },
});

router.get("/trust-score/:userId", protect, requireVerified, trustScoreRateLimiter, async (req, res) => {
  try {
    const targetUserId = req.params.userId;

    // Access-control runs on every request, even cache hits.
    // This ensures a user who leaves a shared group loses access immediately
    // rather than seeing stale cached data for up to 20 minutes.
    if (targetUserId !== req.user.id) {
      const sharedGroup = await Group.findOne({
        "members.user": { $all: [req.user.id, targetUserId] }
      });
      if (!sharedGroup) {
        return res.status(403).json({ message: "You do not share any groups with this user." });
      }
    }

    // Serve from cache if still fresh
    const cacheKey = String(targetUserId);
    const cached = trustScoreCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    // Compute fresh and cache
    const result = await getTrustScoreForUser(targetUserId);
    trustScoreCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + TRUST_SCORE_CACHE_TTL_MS,
    });
    return res.json(result);
  } catch (error) {
    console.error("Error fetching user trust score:", error);
    return res.status(500).json({ message: "Unable to load trust score." });
  }
});


const mentorRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // Limit each user to 5 requests per day
  keyGenerator: (req) => req.user.id,
  message: { message: "Daily limit reached for AI mentor. Please try again tomorrow." },
});

router.get("/mentor", protect, requireVerified, mentorRateLimiter, async (req, res) => {
  try {
    const cached = mentorCache.get(req.user.id);
    if (cached && cached.expiresAt > Date.now() && req.query.bypassCache !== "true") return res.json({ ...cached.data, cached: true });

    const groups = await Group.find({ "members.user": req.user.id }).select("name").lean();
    const groupIds = groups.map((group) => group._id);
    if (groupIds.length === 0) {
      const data = { status: "not_enough_data", reason: "Join a group and add a few shared expenses to unlock your mentor report." };
      mentorCache.set(req.user.id, { data, expiresAt: Date.now() + MENTOR_CACHE_TTL_MS });
      return res.json(data);
    }

    const [expenses, settlements, rejections] = await Promise.all([
      Expense.find({
        group: { $in: groupIds },
        $or: [ { "splits.user": req.user.id }, { paidBy: req.user.id } ]
      })
        .select("description amount category group splits splitType paidBy createdAt")
        .lean(),
      Settlement.find({ group: { $in: groupIds }, from: req.user.id })
        .select("status amount group createdAt updatedAt")
        .lean(),
      ActivityLog.find({ type: 'settlement_rejected', 'meta.fromId': new mongoose.Types.ObjectId(req.user.id), group: { $in: groupIds } })
        .select("createdAt")
        .lean(),
    ]);

    const groupNames = new Map(groups.map((group) => [group._id.toString(), group.name]));
    const personalExpenses = expenses.map((expense) => {
      const share = expense.splits.find((split) => split.user.toString() === req.user.id);
      return {
        ...expense,
        personalShare: Number(share?.amount || 0),
        isPaidByUser: expense.paidBy ? expense.paidBy.toString() === req.user.id : false,
        groupName: groupNames.get(expense.group.toString()) || "a group"
      };
    }).filter((expense) => expense.personalShare > 0 || expense.isPaidByUser);

    const activeMonths = new Set(personalExpenses.map((expense) => expense.createdAt.toISOString().slice(0, 7)));
    if (personalExpenses.length < 3 || activeMonths.size < 2) {
      const data = {
        status: "new",
        score: null,
        scoreBand: "New",
        scoreBandSummary: "Your score will appear once there is enough shared activity for a fair comparison.",
        explanation: "Build a fair score by taking part in three shared expenses across at least two different months.",
        suggestions: [
          "Add or join shared expenses until you reach 3 total activities.",
          "Stay active in one more month so your score reflects a real pattern."
        ],
        observations: [],
        signalBreakdown: [],
        activity: { expenses: personalExpenses.length, activeMonths: activeMonths.size, settlements: settlements.length, groups: groups.length },
        generatedAt: new Date().toISOString(),
        cached: false,
      };
      mentorCache.set(req.user.id, { data, expiresAt: Date.now() + MENTOR_CACHE_TTL_MS });
      return res.json(data);
    }

    // Call computeMentorReport utility
    const report = computeMentorReport(settlements, personalExpenses, rejections);

    const totalPersonalShare = personalExpenses.reduce((sum, e) => sum + e.personalShare, 0);
    const totalFrontedAmount = personalExpenses.filter(e => e.isPaidByUser).reduce((sum, e) => sum + e.amount, 0);
    
    const observations = [];
    
    // 1. Buying Power & Generosity
    if (totalFrontedAmount > totalPersonalShare * 1.5) {
      observations.push(`You have strong buying power and generosity: you've fronted ₹${round(totalFrontedAmount).toLocaleString("en-IN")} for group expenses, which is significantly higher than your personal share of ₹${round(totalPersonalShare).toLocaleString("en-IN")}.`);
    } else if (totalFrontedAmount > 0) {
      observations.push(`You've paid ₹${round(totalFrontedAmount).toLocaleString("en-IN")} upfront for group expenses so far, while your personal share was ₹${round(totalPersonalShare).toLocaleString("en-IN")}.`);
    }

    // 2. Promptness
    if (report.signals.averageInitiativeHours !== undefined && report.signals.averageInitiativeHours > 0) {
      const avgHours = report.signals.averageInitiativeHours;
      if (avgHours <= 24) {
        observations.push(`Excellent promptness on your own debts: On average, for expenses where someone else paid for you, you initiate settlements to pay them back within ${avgHours} hours.`);
      } else {
        const days = Math.round(avgHours / 24);
        observations.push(`On average, for expenses where someone else paid for you (your own debts), it takes you about ${days} days to initiate settlements to pay them back.`);
      }
    }

    // 3. Reliability
    const rejectionsCount = report.signals.rejectionsCount || 0;
    const totalSettlements = report.signals.totalSettlements || 0;
    if (totalSettlements > 0) {
      if (rejectionsCount === 0) {
        observations.push(`Perfect reliability: Out of ${totalSettlements} settlements you initiated, none were flagged or rejected by receivers.`);
      } else {
        observations.push(`Reliability notice: Out of ${totalSettlements} settlements you initiated, ${rejectionsCount} were rejected by the receiver.`);
      }
    }

    // --- Score History & Trend ---
    // Save a new score entry (fire-and-forget; don't let DB errors break the response)
    let scoreTrend = null;
    try {
      const newEntry = await ScoreHistory.create({ user: req.user.id, score: report.score });
      // Fetch the single most-recent prior entry (before this one)
      const priorEntry = await ScoreHistory.findOne(
        { user: req.user.id, _id: { $ne: newEntry._id } },
        { score: 1, createdAt: 1 },
        { sort: { createdAt: -1 } }
      );
      if (priorEntry) {
        const daysAgo = Math.round((newEntry.createdAt - priorEntry.createdAt) / (1000 * 60 * 60 * 24));
        scoreTrend = {
          delta: report.score - priorEntry.score,
          previousScore: priorEntry.score,
          daysAgo: Math.max(daysAgo, 0),
        };
      }
    } catch (histErr) {
      console.warn("ScoreHistory write failed (non-fatal):", histErr.message);
    }

    // --- What-If Projection ---
    // Identify the weakest qualifying dimension (lowest value, excluding reliabilityIncidents)
    const qualifyingBreakdown = report.signalBreakdown.filter(s => s.key !== "reliabilityIncidents");
    const weakestEntry = qualifyingBreakdown.reduce((min, s) => (!min || s.value < min.value) ? s : min, null);
    const whatIf = weakestEntry
      ? computeWhatIfProjection(settlements, personalExpenses, rejections, weakestEntry.key, report.score)
      : null;

    // --- Why Facts ---
    // Plain-language facts derived from observation data, suitable for display in the widget.
    // Only include a fact when it's actually informative (skip zero-pending, skip if no settlements).
    const pendingSettlementsCount = settlements.filter(s => s.status === "pending").length;
    const confirmedSettlementsCount = settlements.filter(s => !s.status || s.status === "confirmed").length;
    const totalSettlementsForWhy = settlements.length;
    const onTimePercent = totalSettlementsForWhy > 0
      ? Math.round((confirmedSettlementsCount / totalSettlementsForWhy) * 100)
      : null;
    const activeMonthsCountForWhy = new Set(personalExpenses.map(e => e.createdAt.toISOString().slice(0, 7))).size;
    const paidByUserCount = personalExpenses.filter(e => e.isPaidByUser).length;
    const contributionRatio = personalExpenses.length > 0
      ? Math.round((paidByUserCount / personalExpenses.length) * 100)
      : 0;
    const rejectionsCountForWhy = rejections.length;

    const whyFacts = [];
    // Pending settlements — only show if > 0 (a zero is not a meaningful fact)
    if (pendingSettlementsCount > 0) {
      whyFacts.push({
        icon: "pending",
        sentiment: "warning",
        text: `${pendingSettlementsCount} pending payment${pendingSettlementsCount !== 1 ? 's' : ''} still to be confirmed`,
      });
    }
    // On-time repayments — show if we have settlement history
    if (onTimePercent !== null && totalSettlementsForWhy >= 2) {
      whyFacts.push({
        icon: onTimePercent >= 80 ? "check_circle" : "warning",
        sentiment: onTimePercent >= 80 ? "good" : "warning",
        text: `${onTimePercent}% of your payments were confirmed on time`,
      });
    }
    // Upfront contribution — show if >= 3 expenses
    if (personalExpenses.length >= 3) {
      whyFacts.push({
        icon: contributionRatio >= 30 ? "payments" : "account_balance_wallet",
        sentiment: contributionRatio >= 30 ? "good" : "neutral",
        text: `You paid upfront for ${contributionRatio}% of shared expenses`,
      });
    }
    // Rejections — only show if any exist
    if (rejectionsCountForWhy > 0) {
      whyFacts.push({
        icon: "cancel",
        sentiment: "warning",
        text: `${rejectionsCountForWhy} payment${rejectionsCountForWhy !== 1 ? 's' : ''} you claimed ${rejectionsCountForWhy !== 1 ? 'were' : 'was'} disputed by the receiver`,
      });
    }
    // Activity duration
    if (activeMonthsCountForWhy >= 1) {
      whyFacts.push({
        icon: "calendar_month",
        sentiment: "neutral",
        text: `Active in ${activeMonthsCountForWhy} month${activeMonthsCountForWhy !== 1 ? 's' : ''} of group expenses`,
      });
    }

    // --- Next Target ---
    // Target score: whichever is closer — +20 from current, or the next score-band boundary.
    // Score bands: <40 At Risk, 40-59 Needs Attention, 60-79 Good, 80-99 Excellent, 100 perfect.
    // "Next boundary" is the lowest band threshold strictly above the current score.
    const BAND_THRESHOLDS = [40, 60, 80, 100]; // the score you need to reach each next band
    const currentScoreForTarget = report.score;
    const nextBoundary = BAND_THRESHOLDS.find(t => t > currentScoreForTarget) ?? 100;
    const plusTwenty = Math.min(100, currentScoreForTarget + 20);
    // Pick whichever target is lower (closer / more achievable), but never below current
    const targetScore = Math.min(nextBoundary, plusTwenty);

    const nextTargetActions = [];
    if (currentScoreForTarget < 100) {
      // Action 1: clear pending payments (only if there are some)
      if (pendingSettlementsCount > 0) {
        nextTargetActions.push(`Pay back your ${pendingSettlementsCount} pending debt${pendingSettlementsCount !== 1 ? 's' : ''}`);
      }
      // Action 2: improve on-time rate (only if it's below 100%)
      if (onTimePercent !== null && onTimePercent < 100) {
        nextTargetActions.push("Keep your payments confirmed on time going forward");
      }
      // Action 3: front more group costs (only if contribution ratio is below 40%)
      if (personalExpenses.length >= 3 && contributionRatio < 40) {
        nextTargetActions.push("Pay upfront for a few more shared group costs");
      }
    }

    const nextTarget = nextTargetActions.length > 0 && currentScoreForTarget < 100
      ? { targetScore, actions: nextTargetActions.slice(0, 3) }
      : null; // hide entirely if no meaningful actions or already at 100

    const mentor = await getMentorCopy(
      report.score, report.scoreBand, report.signalBreakdown,
      observations, report.signals, report.primaryFocus,
      scoreTrend, whatIf
    );
    const data = {
      status: "ready",
      score: report.score,
      scoreBand: report.scoreBand,
      scoreBandSummary: report.scoreBandSummary,
      signalBreakdown: report.signalBreakdown,
      observations,
      ...mentor,
      scoreTrend,
      whatIf,
      whyFacts,
      nextTarget,
      settlementNote: settlements.length === 0 ? "Settlement-based insights will improve once you've completed a payment." : null,
      generatedAt: new Date().toISOString(),
      cached: false,
    };
    mentorCache.set(req.user.id, { data, expiresAt: Date.now() + MENTOR_CACHE_TTL_MS });
    return res.json(data);
  } catch (error) {
    console.error("Error generating financial mentor insight:", error);
    return res.status(500).json({ message: "Unable to generate your financial mentor report right now." });
  }
});

// ── Financial tips cache & fallback ──────────────────────────────────────────
const userTipsCache = new Map();

// Load verified fact bank
let rawFinanceFacts = [];
try {
  const factsPath = path.resolve(process.cwd(), "src/data/financeFacts.json");
  rawFinanceFacts = JSON.parse(fs.readFileSync(factsPath, "utf-8"));
} catch (e) {
  console.warn("Could not load financeFacts.json:", e.message);
}

// Facts indexed by topic where verified_on is non-empty
const verifiedFactsByTopic = {};
rawFinanceFacts.forEach((fact) => {
  if (fact.verified_on && fact.verified_on.trim() !== "") {
    if (!verifiedFactsByTopic[fact.topic]) verifiedFactsByTopic[fact.topic] = [];
    verifiedFactsByTopic[fact.topic].push(fact.text);
  }
});

const TIP_CATEGORIES = ["BUDGETING", "INVESTING", "DEBT", "INDIA_FINANCE", "GROUP_HABITS"];
const EXPENSE_CATEGORIES_ENUM = Expense.schema.path("category").enumValues;

const FALLBACK_FINANCIAL_TIPS = [
  {
    category: 'BUDGETING',
    emoji: '💡',
    headline: 'The 50 30 20 Rule',
    explanation: 'The 50 30 20 framework is a common rule of thumb allocating 50 for needs, 30 for wants, and 20 for savings out of every 100 in income.',
    isGeneric: true,
  },
  {
    category: 'INVESTING',
    emoji: '📈',
    headline: 'Systematic Investment Plan',
    explanation: 'A Systematic Investment Plan allows investing a fixed amount regularly into mutual funds to accumulate compounding returns over time.',
    isGeneric: true,
    disclaimer: 'Note: This is educational material, not financial advice.',
  },
  {
    category: 'DEBT',
    emoji: '💳',
    headline: 'Full Credit Card Payment',
    explanation: 'Paying credit card balances in full before the monthly deadline prevents interest charges from accumulating on your account.',
    isGeneric: true,
  },
  {
    category: 'INDIA_FINANCE',
    emoji: '🏦',
    headline: 'Public Provident Fund',
    explanation: 'Public Provident Fund is a long term government backed savings scheme that accumulates compound interest over a 15 year period.',
    isGeneric: true,
  },
  {
    category: 'GROUP_HABITS',
    emoji: '🤝',
    headline: 'Prompt Expense Logging',
    explanation: 'Adding shared bills immediately after they occur maintains accurate record keeping and prevents payment discrepancies.',
    isGeneric: true,
  },
  {
    category: 'BUDGETING',
    emoji: '💡',
    headline: 'Daily Expense Tracking',
    explanation: 'Tracking spending of ₹100 a day adds up to ₹36,500 in a 365-day year.',
    isGeneric: true,
  },
  {
    category: 'BUDGETING',
    emoji: '💡',
    headline: 'Emergency Savings Buffer',
    explanation: 'Maintaining 3 to 6 months of essential living expenses in liquid savings is commonly suggested as a buffer against unexpected expenses.',
    isGeneric: true,
  },
  {
    category: 'DEBT',
    emoji: '💳',
    headline: 'CIBIL Credit Score Range',
    explanation: 'CIBIL credit scores range from 300 to 900. Maintaining a high score indicates responsible credit management to lenders.',
    isGeneric: true,
  },
  {
    category: 'INDIA_FINANCE',
    emoji: '🏦',
    headline: 'Unified Payments Interface',
    explanation: 'Unified Payments Interface enables instant bank to bank money transfers using virtual payment addresses without sharing account details.',
    isGeneric: true,
  },
  {
    category: 'GROUP_HABITS',
    emoji: '🤝',
    headline: 'Equal Split Transparency',
    explanation: 'Dividing shared bills equally among participants establishes clear upfront agreement on personal repayment obligations.',
    isGeneric: true,
  },
];

function calculateJSInputFigures(totalSpending90Days, activeMonthsCount) {
  const monthlySipBase = 500;
  const sipYears = 5;
  const sipMonths = 60;
  const i = 0.01;
  const sipFutureValue5Yr = Math.round(monthlySipBase * (((Math.pow(1 + i, sipMonths) - 1) / i) * (1 + i)));
  const avgMonthlySpendingRupees = activeMonthsCount > 0 ? Math.round(totalSpending90Days / activeMonthsCount) : null;

  return {
    monthlySipBase,
    sipYears,
    sipMonths,
    sipFutureValue5Yr,
    assumedAnnualReturnPercent: 12,
    sipLabel: "illustration only, not a prediction",
    avgMonthlySpendingRupees,
  };
}

function extractNumbersFromString(text) {
  const matches = text.match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g) || [];
  return matches.map((m) => Math.round(Math.abs(Number(m.replace(/,/g, "")))));
}

const tipsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user.id,
  message: { message: "Too many financial tips requests. Please slow down." },
});

router.get("/tips", protect, requireVerified, tipsRateLimiter, async (req, res) => {
  try {
    const isDev = process.env.NODE_ENV === "development";
    const cacheKey = String(req.user.id);
    const cached = userTipsCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now() && (req.query.bypassCache !== "true" || !isDev)) {
      return res.json({ ...cached.data, cached: true });
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const groups = await Group.find({ "members.user": req.user.id }).select("_id").lean();
    const groupIds = groups.map((g) => g._id);

    const [expenses, settlements, trustScoreObj, summary] = await Promise.all([
      Expense.find({ group: { $in: groupIds }, createdAt: { $gte: ninetyDaysAgo }, "splits.user": req.user.id })
        .select("description amount category group splits splitType paidBy createdAt")
        .lean(),
      Settlement.find({ group: { $in: groupIds }, status: "pending", $or: [{ from: req.user.id }, { to: req.user.id }] })
        .select("_id")
        .lean(),
      getTrustScoreForUser(req.user.id),
      getUserFinancialSummary(req.user.id).catch(() => null),
    ]);

    const netBalance = summary && summary.totalGroups > 0 ? summary.netBalance : null;

    const categoryTotals = {};
    let totalSpending90Days = 0;
    const activeMonthsSet = new Set();

    expenses.forEach((exp) => {
      const mySplit = exp.splits?.find((s) => s.user?.toString() === req.user.id.toString());
      const amt = Number(mySplit?.amount || 0);
      if (amt > 0) {
        let cat = (exp.category || "other").toLowerCase();
        if (!EXPENSE_CATEGORIES_ENUM.includes(cat)) cat = "other";
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
        totalSpending90Days += amt;
        activeMonthsSet.add(exp.createdAt.toISOString().slice(0, 7));
      }
    });

    const monthsOfData = activeMonthsSet.size;

    if (expenses.length < 3 || monthsOfData < 2) {
      const payload = { tips: FALLBACK_FINANCIAL_TIPS, isGeneric: true, fallbackUsed: true };
      userTipsCache.set(cacheKey, { data: payload, expiresAt: Date.now() + 60 * 60 * 1000 });
      return res.json({ ...payload, cached: false });
    }

    const uniqueCategoryCount = Object.keys(categoryTotals).length;
    const topCatPair = uniqueCategoryCount > 1
      ? Object.entries(categoryTotals)
          .filter(([cat]) => cat !== "other" && EXPENSE_CATEGORIES_ENUM.includes(cat))
          .sort((a, b) => b[1] - a[1])[0]
      : null;
    const topCategoryName = topCatPair ? topCatPair[0] : null;

    const dataSnapshot = {};
    if (topCategoryName) {
      dataSnapshot.topCategoryName = topCategoryName;
      dataSnapshot.topCategorySharePercent = Math.round((topCatPair[1] / totalSpending90Days) * 100);
    }
    if (netBalance !== null) dataSnapshot.netBalanceRupees = netBalance;
    dataSnapshot.pendingSettlementsCount = settlements.length;
    dataSnapshot.monthsOfData = monthsOfData;
    if (trustScoreObj && typeof trustScoreObj.score === "number") {
      dataSnapshot.trustScore = trustScoreObj.score;
      dataSnapshot.trustScoreBand = trustScoreObj.scoreBand;
    }

    const calculatedInputs = calculateJSInputFigures(totalSpending90Days, monthsOfData);

    const allowedNumbers = new Set([
      50, 30, 20,
      ...Object.values(dataSnapshot).filter((v) => typeof v === "number").map((v) => Math.round(Math.abs(v))),
      ...Object.values(calculatedInputs).filter((v) => typeof v === "number").map((v) => Math.round(Math.abs(v))),
    ]);

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL_LITE || "gemini-3.1-flash-lite";

    const callGeminiWithGuard = async (isRetry = false) => {
      const isNegativeBalanceOrAtRisk = (dataSnapshot.netBalanceRupees !== undefined && dataSnapshot.netBalanceRupees < 0) || dataSnapshot.trustScoreBand === "At Risk";

      const prompt = `Data Snapshot (User's share of group spending):
${JSON.stringify(dataSnapshot, null, 2)}

Calculated Inputs:
${JSON.stringify(calculatedInputs, null, 2)}

INSTRUCTIONS:
Generate 10 concise tips for user group spending habits.
RULES:
1. Figures cover the user's share of group expenses only. Use "group spending" wording, never "your total spending".
2. At least 3 tips MUST reference at least one exact number from Data Snapshot or Calculated Inputs. The rest must be fact-based education with NO numbers.
3. DO NOT invent any numbers, statistics, percentages, or interest rates not listed above.
4. The SIP figure ₹${calculatedInputs.sipFutureValue5Yr} applies ONLY to a standalone monthly amount of ₹500 (monthlySipBase) over 5 years at an assumed 12% yearly return. Present it as a standalone example illustration. NEVER connect or link it to the user's own spending, net balance, or any other user figures.
5. DO NOT use superlatives or absolute guarantees (such as "best way", "always", "guaranteed", "will improve").
6. ${isNegativeBalanceOrAtRisk ? "Since the user has a negative net balance or an 'At Risk' trust score band, DO NOT generate any tips in the INVESTING category. Suggest settling group dues and managing debts first instead." : "Focus on balanced budgeting, habits, and prudent planning."}
7. DO NOT mention specific commercial apps or products.
8. Categories MUST be one of: BUDGETING, INVESTING, DEBT, INDIA_FINANCE, GROUP_HABITS.`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: isRetry ? 0.5 : 0.2,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                category: {
                  type: "STRING",
                  enum: TIP_CATEGORIES,
                },
                emoji: { type: "STRING" },
                headline: { type: "STRING" },
                explanation: { type: "STRING" },
              },
              required: ["category", "emoji", "headline", "explanation"],
            },
          },
        },
      };

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`Gemini API error (HTTP ${response.status}):`, errBody);
        const httpErr = new Error(`Gemini HTTP ${response.status}`);
        httpErr.isHttpError = true;
        throw httpErr;
      }

      const json = await response.json();
      const candidate = json?.candidates?.[0];

      if (!candidate || candidate.finishReason !== "STOP") {
        console.warn(`Gemini finished with non-STOP reason: ${candidate?.finishReason}`);
      }

      let rawText = candidate?.content?.parts?.[0]?.text ?? "";
      rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

      let rawTips;
      try {
        rawTips = JSON.parse(rawText);
      } catch (parseErr) {
        console.error("JSON parsing error on Gemini response:", parseErr.message, "Raw text:", rawText);
        return { tips: [], droppedLogs: [`JSON parse error: ${parseErr.message}`] };
      }

      if (!Array.isArray(rawTips)) {
        return { tips: [], droppedLogs: ["Returned JSON is not an array"] };
      }

      const survivingTips = [];
      const droppedLogs = [];
      const usedFactTextsPerResponse = new Set();
      const sipFV = calculatedInputs.sipFutureValue5Yr;

      for (let idx = 0; idx < rawTips.length; idx++) {
        const tip = rawTips[idx];

        if (!TIP_CATEGORIES.includes(tip.category)) {
          droppedLogs.push(`Tip ${idx + 1} dropped: Invalid category "${tip.category}"`);
          continue;
        }

        const textNumbers = extractNumbersFromString(`${tip.headline} ${tip.explanation}`);
        const unallowedNums = textNumbers.filter((num) => !allowedNumbers.has(num));

        if (unallowedNums.length > 0) {
          droppedLogs.push(
            `Tip ${idx + 1} (${tip.headline}) dropped: Contains unallowed number(s) [${unallowedNums.join(", ")}]. Text numbers: [${textNumbers.join(", ")}]. Allowed: [${Array.from(allowedNumbers).join(", ")}]`
          );
          continue;
        }

        if (textNumbers.includes(sipFV)) {
          const allowedSipNumbers = new Set([500, 5, 60, 12, sipFV]);
          const invalidSipNums = textNumbers.filter((num) => !allowedSipNumbers.has(num));
          if (invalidSipNums.length > 0) {
            droppedLogs.push(
              `Tip ${idx + 1} (${tip.headline}) dropped: SIP illustration connected to unallowed number(s) [${invalidSipNums.join(", ")}]. Allowed SIP numbers: [500, 5, 60, 12, ${sipFV}]`
            );
            continue;
          }
        }

        const topicFacts = verifiedFactsByTopic[tip.category] || [];
        let chosenFactText = null;

        for (const factStr of topicFacts) {
          if (!usedFactTextsPerResponse.has(factStr)) {
            chosenFactText = factStr;
            usedFactTextsPerResponse.add(factStr);
            break;
          }
        }

        survivingTips.push({
          category: tip.category,
          emoji: tip.emoji,
          headline: tip.headline,
          explanation: tip.explanation,
          factText: chosenFactText,
          isGeneric: false,
          disclaimer: tip.category === "INVESTING" ? "Note: This is educational material, not financial advice." : null,
          numbersUsed: textNumbers,
        });
      }

      return { tips: survivingTips, droppedLogs };
    };

    let result = null;
    let isHttpErrorOccurred = false;

    try {
      result = await callGeminiWithGuard(false);
    } catch (err) {
      console.error("First Gemini attempt error:", err.message);
      if (err.isHttpError) isHttpErrorOccurred = true;
    }

    if (!isHttpErrorOccurred && (!result || result.tips.length < 6)) {
      try {
        result = await callGeminiWithGuard(true);
      } catch (err) {
        console.error("Retry Gemini attempt error:", err.message);
      }
    }

    if (!result || result.tips.length < 6) {
      const payload = { tips: FALLBACK_FINANCIAL_TIPS, isGeneric: true, fallbackUsed: true };
      userTipsCache.set(cacheKey, { data: payload, expiresAt: Date.now() + 5 * 60 * 1000 });
      return res.json({ ...payload, cached: false, droppedLogs: result?.droppedLogs || [] });
    }

    const payload = { tips: result.tips.slice(0, 10), isGeneric: false, fallbackUsed: false, topCategoryName };
    userTipsCache.set(cacheKey, { data: payload, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
    return res.json({ ...payload, cached: false, droppedLogs: result.droppedLogs });

  } catch (err) {
    console.error("Error in /insights/tips route:", err);
    const payload = { tips: FALLBACK_FINANCIAL_TIPS, isGeneric: true, fallbackUsed: true };
    return res.json({ ...payload, cached: false });
  }
});

export default router;
