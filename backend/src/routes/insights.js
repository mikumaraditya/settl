import express from "express";
import Expense from "../models/Expense.js";
import Group from "../models/Group.js";
import Settlement from "../models/Settlement.js";
import protect from "../middleware/auth.js";
import requireVerified from "../middleware/requireVerified.js";
import { computeMentorReport } from "../utils/financialMentor.js";
import ActivityLog from "../models/ActivityLog.js";
import mongoose from "mongoose";

const router = express.Router();
const MENTOR_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const mentorCache = new Map();

const round = (value) => Math.round(value * 100) / 100;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const fallbackMentorCopy = (score, scoreBand, signalBreakdown) => {
  const weakest = signalBreakdown.filter(s => s.isWeakest).map(s => s.label).join(" and ");
  const explanation = `Your Trust Score is ${score}/100, placing you in the '${scoreBand}' category. Your lowest-performing metric is ${weakest}, which currently offers the biggest opportunity for improvement.`;

  const suggestions = [];
  const followThroughSig = signalBreakdown.find(s => s.key === "followThrough");
  const settlementInitiativeSig = signalBreakdown.find(s => s.key === "settlementInitiative");
  const consistencySig = signalBreakdown.find(s => s.key === "consistency");

  if (followThroughSig && followThroughSig.value < 80) {
    suggestions.push("Settle outstanding balances promptly so that your group accounts remain transparent and accurate, helping everyone plan their budgets better.");
  } else if (settlementInitiativeSig && settlementInitiativeSig.value < 80) {
    suggestions.push("Proactively request settlements closer to when expenses are incurred, ensuring you don't let debts linger.");
  } else {
    suggestions.push("Keep taking the initiative to clear outstanding balances quickly to maintain a high level of trust.");
  }

  if (consistencySig && consistencySig.value < 60) {
    suggestions.push("Establish a regular baseline for monthly shared costs to eliminate wild budget swings and make future group activities easier to fund.");
  } else {
    suggestions.push("Continue using your stable spending baseline when estimating and planning upcoming group activities.");
  }

  return {
    explanation,
    suggestions: suggestions.slice(0, 2)
  };
};

const getMentorCopy = async (score, scoreBand, signalBreakdown, observations, signals) => {
  const fallback = fallbackMentorCopy(score, scoreBand, signalBreakdown);
  if (!process.env.GEMINI_API_KEY) return fallback;

  const prompt = `You are Settl's Financial Mentor. Explain only the supplied data; do not calculate, infer, or invent figures. 
Return valid JSON only with this exact shape: {"explanation":"short plain-language explanation","suggestions":["specific action with benefit 1","specific action with benefit 2"]}. 
Give one or two suggestions.

In your response:
1. Explain what the score and the score band mean in plain terms (e.g. why a score of ${score} puts them in the '${scoreBand}' band).
2. Look deeply into the user's Buying Power, Promptness, and Reliability based on the Real Observations provided. Emphasize these behavioral traits. Stop giving generic category-based advice.
3. Every suggestion MUST state a concrete benefit (payoff) for the user, and should be highly specific to their actual group behavior (e.g., advising them to keep fronting money if they have high buying power, or to settle faster if their promptness is low).

Trust Score: ${score}/100
Score Band: ${scoreBand}
Signals: ${JSON.stringify(signals)}
Signal Breakdown: ${JSON.stringify(signalBreakdown)}
Real observations: ${JSON.stringify(observations)}`;

  const callGemini = async (model) => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: "application/json" },
        }),
      },
    );
    if (!response.ok) throw new Error(`Gemini request failed with ${response.status}`);

    const payload = await response.json();
    const raw = payload?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    const parsed = JSON.parse(raw);
    if (!parsed?.explanation || !Array.isArray(parsed?.suggestions)) throw new Error("Invalid Gemini response");
    return parsed;
  };

  try {
    let result;
    try {
      result = await callGemini("gemini-3.5-flash");
    } catch (err) {
      console.warn("gemini-3.5-flash failed, trying gemini-2.5-flash fallback:", err.message);
      result = await callGemini("gemini-2.5-flash");
    }

    return {
      explanation: String(result.explanation),
      suggestions: result.suggestions.slice(0, 2).map(String),
    };
  } catch (error) {
    console.error("Financial mentor Gemini request failed:", error.message);
    return fallback;
  }
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
      $or: [ { "splits.user": userId }, { paidBy: userId } ]
    })
      .select("description amount category group splits splitType paidBy createdAt")
      .lean(),
    Settlement.find({ group: { $in: groupIds }, from: userId })
      .select("status amount group createdAt updatedAt")
      .lean(),
    ActivityLog.find({ type: 'settlement_rejected', 'meta.fromId': new mongoose.Types.ObjectId(userId), group: { $in: groupIds } })
      .select("createdAt")
      .lean(),
  ]);

  const groupNames = new Map(groups.map((group) => [group._id.toString(), group.name]));
  const personalExpenses = expenses.map((expense) => {
    const share = expense.splits.find((split) => split.user.toString() === userId);
    return {
      ...expense,
      personalShare: Number(share?.amount || 0),
      isPaidByUser: expense.paidBy ? expense.paidBy.toString() === userId : false,
      groupName: groupNames.get(expense.group.toString()) || "a group"
    };
  }).filter((expense) => expense.personalShare > 0 || expense.isPaidByUser);

  const activeMonths = new Set(personalExpenses.map((expense) => expense.createdAt.toISOString().slice(0, 7)));
  if (personalExpenses.length < 3 || activeMonths.size < 2) {
    return {
      status: "new",
      score: 100,
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

router.get("/trust-score/:userId", protect, requireVerified, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    if (targetUserId !== req.user.id) {
      const sharedGroup = await Group.findOne({
        "members.user": { $all: [req.user.id, targetUserId] }
      });
      if (!sharedGroup) {
        return res.status(403).json({ message: "You do not share any groups with this user." });
      }
    }

    const result = await getTrustScoreForUser(targetUserId);
    return res.json(result);
  } catch (error) {
    console.error("Error fetching user trust score:", error);
    return res.status(500).json({ message: "Unable to load trust score." });
  }
});


router.get("/mentor", protect, requireVerified, async (req, res) => {
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
        score: 100,
        scoreBand: "New",
        scoreBandSummary: "You're starting at a perfect trust score. It'll update automatically as you add expenses and settle up.",
        explanation: "You're starting at a perfect trust score. It'll update automatically as you add expenses and settle up.",
        suggestions: [],
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
        observations.push(`Excellent promptness: On average, you clear or initiate settlements within ${avgHours} hours of an expense being added.`);
      } else {
        const days = Math.round(avgHours / 24);
        observations.push(`On average, it takes you about ${days} days to initiate settlements after shared spending happens.`);
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

    const mentor = await getMentorCopy(report.score, report.scoreBand, report.signalBreakdown, observations, report.signals);
    const data = {
      status: "ready",
      score: report.score,
      scoreBand: report.scoreBand,
      scoreBandSummary: report.scoreBandSummary,
      signalBreakdown: report.signalBreakdown,
      observations,
      ...mentor,
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

export default router;
