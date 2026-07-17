import express from "express";
import Expense from "../models/Expense.js";
import Group from "../models/Group.js";
import Settlement from "../models/Settlement.js";
import protect from "../middleware/auth.js";
import requireVerified from "../middleware/requireVerified.js";

const router = express.Router();
const MENTOR_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const mentorCache = new Map();

const round = (value) => Math.round(value * 100) / 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const fallbackMentorCopy = (score, signals) => ({
  explanation: `Your score is ${score}/100 based on your confirmed settlement follow-through, how quickly your payments are confirmed, and how steady your shared spending is month to month.`,
  suggestions: [
    signals.followThrough < 80
      ? "Clear any pending settlements soon so your shared balances stay accurate."
      : "Keep confirming settlements promptly to maintain clear group balances.",
    signals.consistency < 60
      ? "Review your higher-spend months before adding another large shared expense."
      : "Use your spending pattern as a baseline when planning your next group activity.",
  ],
});

const getMentorCopy = async (score, observations, signals) => {
  const fallback = fallbackMentorCopy(score, signals);
  if (!process.env.GEMINI_API_KEY) return fallback;

  const prompt = `You are Settl's Financial Mentor. Explain only the supplied data; do not calculate, infer, or invent figures. Return valid JSON only with this exact shape: {"explanation":"short plain-language explanation","suggestions":["specific action 1","specific action 2"]}. Give one or two suggestions.\n\nFinancial Health Score: ${score}/100\nSignals: ${JSON.stringify(signals)}\nReal observations: ${JSON.stringify(observations)}`;

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

router.get("/mentor", protect, requireVerified, async (req, res) => {
  try {
    const cached = mentorCache.get(req.user.id);
    if (cached && cached.expiresAt > Date.now()) return res.json({ ...cached.data, cached: true });

    // Membership is resolved first, then every query is constrained to those group IDs.
    // This keeps the report cross-group while preventing data from non-member groups leaking in.
    const groups = await Group.find({ "members.user": req.user.id }).select("name").lean();
    const groupIds = groups.map((group) => group._id);
    if (groupIds.length === 0) {
      const data = { status: "not_enough_data", reason: "Join a group and add a few shared expenses to unlock your mentor report." };
      mentorCache.set(req.user.id, { data, expiresAt: Date.now() + MENTOR_CACHE_TTL_MS });
      return res.json(data);
    }

    const [expenses, settlements] = await Promise.all([
      Expense.find({ group: { $in: groupIds }, "splits.user": req.user.id })
        .select("description amount category group splits createdAt")
        .lean(),
      Settlement.find({ group: { $in: groupIds }, from: req.user.id })
        .select("status amount group createdAt updatedAt")
        .lean(),
    ]);

    const groupNames = new Map(groups.map((group) => [group._id.toString(), group.name]));
    const personalExpenses = expenses.map((expense) => {
      const share = expense.splits.find((split) => split.user.toString() === req.user.id);
      return { ...expense, personalShare: Number(share?.amount || 0), groupName: groupNames.get(expense.group.toString()) || "a group" };
    }).filter((expense) => expense.personalShare > 0);

    const activeMonths = new Set(personalExpenses.map((expense) => expense.createdAt.toISOString().slice(0, 7)));
    // Primary gate: A score is shown only with enough expense history (at least 3 expenses over 2 months)
    if (personalExpenses.length < 3 || activeMonths.size < 2) {
      const data = {
        status: "not_enough_data",
        reason: "Add at least three shared expenses over two active months to unlock your mentor report.",
        activity: { expenses: personalExpenses.length, activeMonths: activeMonths.size, settlements: settlements.length, groups: groups.length },
      };
      mentorCache.set(req.user.id, { data, expiresAt: Date.now() + MENTOR_CACHE_TTL_MS });
      return res.json(data);
    }

    const hasSettlements = settlements.length >= 1;
    let followThrough = 0;
    let promptness = 0;
    let averageConfirmationHours = 14 * 24;

    if (hasSettlements) {
      const confirmed = settlements.filter((settlement) => !settlement.status || settlement.status === "confirmed");
      const confirmationHours = confirmed.map((settlement) => Math.max(0, (new Date(settlement.updatedAt) - new Date(settlement.createdAt)) / 36e5));
      averageConfirmationHours = confirmationHours.length
        ? confirmationHours.reduce((sum, hours) => sum + hours, 0) / confirmationHours.length
        : 14 * 24;
      followThrough = (confirmed.length / settlements.length) * 100;
      promptness = clamp(100 - (averageConfirmationHours / (14 * 24)) * 100, 0, 100);
    }

    const monthlyTotals = {};
    personalExpenses.forEach((expense) => {
      const month = expense.createdAt.toISOString().slice(0, 7);
      monthlyTotals[month] = (monthlyTotals[month] || 0) + expense.personalShare;
    });
    const monthlyValues = Object.values(monthlyTotals);
    const monthlyMean = monthlyValues.reduce((sum, value) => sum + value, 0) / monthlyValues.length;
    const coefficientOfVariation = monthlyMean
      ? Math.sqrt(monthlyValues.reduce((sum, value) => sum + (value - monthlyMean) ** 2, 0) / monthlyValues.length) / monthlyMean
      : 1;
    const consistency = clamp(100 * (1 - coefficientOfVariation), 0, 100);

    // If the user has completed at least 1 settlement, use the full explainable formula.
    // Otherwise, score is calculated based entirely on their spending consistency.
    const score = hasSettlements
      ? Math.round(0.35 * followThrough + 0.30 * promptness + 0.35 * consistency)
      : Math.round(consistency);

    const categoryTotals = {};
    const categoryGroups = {};
    personalExpenses.forEach((expense) => {
      categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + expense.personalShare;
      categoryGroups[expense.category] ||= {};
      categoryGroups[expense.category][expense.groupName] = (categoryGroups[expense.category][expense.groupName] || 0) + expense.personalShare;
    });
    const totalSharedSpend = personalExpenses.reduce((sum, expense) => sum + expense.personalShare, 0);
    const [topCategory, topCategoryAmount] = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    const observations = [`${topCategory[0].toUpperCase() + topCategory.slice(1)} is your largest shared-spend category at ₹${round(topCategoryAmount).toLocaleString("en-IN")} (${Math.round((topCategoryAmount / totalSharedSpend) * 100)}% of your tracked share).`];

    const groupComparison = Object.entries(categoryGroups[topCategory]).sort((a, b) => b[1] - a[1]);
    if (groupComparison.length >= 2 && groupComparison[1][1] > 0) {
      const [high, low] = groupComparison;
      observations.push(`In ${topCategory}, your share in ${high[0]} (₹${round(high[1]).toLocaleString("en-IN")}) is ${round(high[1] / low[1])}× your share in ${low[0]} (₹${round(low[1]).toLocaleString("en-IN")}).`);
    } else {
      observations.push(`${groupComparison[0][0]} accounts for ₹${round(groupComparison[0][1]).toLocaleString("en-IN")} of your ${topCategory} share.`);
    }

    const recentExpenses = personalExpenses.filter((expense) => Date.now() - new Date(expense.createdAt) <= 90 * 24 * 60 * 60 * 1000);
    const largestRecent = [...recentExpenses].sort((a, b) => b.personalShare - a.personalShare)[0];
    const typicalShare = median(personalExpenses.map((expense) => expense.personalShare));
    if (largestRecent && largestRecent.personalShare >= typicalShare * 1.75) {
      observations.push(`"${largestRecent.description}" in ${largestRecent.groupName} was an unusually large recent share at ₹${round(largestRecent.personalShare).toLocaleString("en-IN")}, versus your typical ₹${round(typicalShare).toLocaleString("en-IN")} expense share.`);
    }

    const signals = {
      followThrough: Math.round(followThrough),
      averageConfirmationHours: round(averageConfirmationHours),
      promptness: Math.round(promptness),
      consistency: Math.round(consistency),
      confirmedSettlements: hasSettlements ? settlements.filter((s) => !s.status || s.status === "confirmed").length : 0,
      totalSettlements: settlements.length,
    };
    const mentor = await getMentorCopy(score, observations, signals);
    const data = {
      status: "ready",
      score,
      observations,
      ...mentor,
      settlementNote: !hasSettlements ? "Settlement-based insights will improve once you've completed a payment." : null,
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
