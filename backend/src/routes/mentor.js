import express from "express";
import rateLimit from "express-rate-limit";
import protect from "../middleware/auth.js";
import requireVerified from "../middleware/requireVerified.js";
import MentorConversation from "../models/MentorConversation.js";
import UserFinancialProfile from "../models/UserFinancialProfile.js";
import { runMentorAgent } from "../services/mentorAgent.js";
import { sanitizePromptText } from "../utils/sanitizeInput.js";

const router = express.Router();

// Rate limiter for chat interactions (60 per 15 min window)
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user.id,
  message: { message: "Too many mentor requests. Please pause for a moment." },
});

/**
 * GET /api/mentor/health
 * Check if Gemini AI mentor provider is configured and ready
 */
router.get("/health", async (req, res) => {
  try {
    const isConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "");
    const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

    return res.json({
      status: isConfigured ? "online" : "unconfigured",
      configured: isConfigured,
      model,
      provider: "Gemini",
    });
  } catch {
    return res.status(500).json({ status: "error", message: "Unable to verify AI Mentor status." });
  }
});

// Protect subsequent mentor routes
router.use(protect, requireVerified);

/**
 * GET /api/mentor/profile
 * Fetch financial profile for authenticated user
 */
router.get("/profile", async (req, res) => {
  try {
    const profile = await UserFinancialProfile.findOne({ user: req.user.id }).lean();
    if (!profile) {
      return res.json({
        consentToUseForMentor: false,
        status: "other",
        monthlyIncome: null,
        monthlySavingsTarget: null,
        goals: [],
        riskComfort: "medium",
        language: "en",
      });
    }
    return res.json(profile);
  } catch (err) {
    console.error("Error fetching mentor profile:", err);
    return res.status(500).json({ message: "Unable to load financial profile." });
  }
});

/**
 * PUT /api/mentor/profile
 * Create or update financial profile for authenticated user (Form driven ONLY)
 */
router.put("/profile", async (req, res) => {
  try {
    const {
      status,
      monthlyIncome,
      monthlySavingsTarget,
      goals,
      riskComfort,
      language,
      consentToUseForMentor,
    } = req.body;

    const validStatus = ["student", "intern", "job", "freelancer", "other"];
    const validRisk = ["low", "medium", "high"];
    const validLang = ["en", "hinglish"];

    const cleanStatus = validStatus.includes(status) ? status : "other";
    const cleanRisk = validRisk.includes(riskComfort) ? riskComfort : "medium";
    const cleanLang = validLang.includes(language) ? language : "en";

    let cleanIncome = null;
    if (monthlyIncome !== undefined && monthlyIncome !== null && monthlyIncome !== "") {
      const num = Number(monthlyIncome);
      if (!Number.isFinite(num) || num < 0 || num > 100000000) {
        return res.status(400).json({ message: "Monthly income must be between 0 and 10 Crore." });
      }
      cleanIncome = Math.round(num);
    }

    let cleanSavingsTarget = null;
    if (monthlySavingsTarget !== undefined && monthlySavingsTarget !== null && monthlySavingsTarget !== "") {
      const num = Number(monthlySavingsTarget);
      if (!Number.isFinite(num) || num < 0 || num > 100000000) {
        return res.status(400).json({ message: "Monthly savings target must be between 0 and 10 Crore." });
      }
      cleanSavingsTarget = Math.round(num);
    }

    let cleanGoals = [];
    if (Array.isArray(goals)) {
      if (goals.length > 5) {
        return res.status(400).json({ message: "Maximum of 5 financial goals allowed." });
      }

      for (const g of goals) {
        if (!g.name || typeof g.name !== "string" || !g.name.trim()) {
          return res.status(400).json({ message: "Goal name is required." });
        }
        const targetAmt = Number(g.targetAmount);
        if (!Number.isFinite(targetAmt) || targetAmt < 1 || targetAmt > 100000000) {
          return res.status(400).json({ message: "Goal target amount must be between ₹1 and 10 Crore." });
        }
        if (!g.deadline || isNaN(new Date(g.deadline).getTime())) {
          return res.status(400).json({ message: "Valid goal deadline date is required." });
        }
        const saved = g.savedSoFar !== undefined ? Number(g.savedSoFar) : 0;
        if (!Number.isFinite(saved) || saved < 0 || saved > 100000000) {
          return res.status(400).json({ message: "Saved so far amount must be between 0 and 10 Crore." });
        }

        cleanGoals.push({
          name: sanitizePromptText(g.name.trim(), 100),
          targetAmount: Math.round(targetAmt),
          deadline: new Date(g.deadline),
          savedSoFar: Math.round(saved),
        });
      }
    }

    const updated = await UserFinancialProfile.findOneAndUpdate(
      { user: req.user.id },
      {
        $set: {
          user: req.user.id,
          status: cleanStatus,
          monthlyIncome: cleanIncome,
          monthlySavingsTarget: cleanSavingsTarget,
          goals: cleanGoals,
          riskComfort: cleanRisk,
          language: cleanLang,
          consentToUseForMentor: Boolean(consentToUseForMentor),
        },
      },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    return res.json(updated);
  } catch (err) {
    console.error("Error updating mentor profile:", err);
    return res.status(500).json({ message: "Unable to save financial profile." });
  }
});

/**
 * DELETE /api/mentor/profile
 * Delete stored financial profile data for authenticated user
 */
router.delete("/profile", async (req, res) => {
  try {
    await UserFinancialProfile.findOneAndDelete({ user: req.user.id });
    return res.json({ message: "Financial profile and goals deleted successfully." });
  } catch (err) {
    console.error("Error deleting mentor profile:", err);
    return res.status(500).json({ message: "Unable to delete financial profile." });
  }
});

/**
 * GET /api/mentor/history
 * Fetch conversation history for the authenticated user
 */
router.get("/history", async (req, res) => {
  try {
    const conversation = await MentorConversation.findOne({ user: req.user.id }).lean();
    if (!conversation) {
      return res.json({ messages: [], conversationId: null });
    }
    return res.json({
      messages: conversation.messages || [],
      conversationId: conversation._id,
      lastActiveAt: conversation.lastActiveAt,
    });
  } catch (err) {
    console.error("Error fetching mentor history:", err);
    return res.status(500).json({ message: "Unable to load conversation history." });
  }
});

/**
 * DELETE /api/mentor/history
 * Clear conversation history for the authenticated user
 */
router.delete("/history", async (req, res) => {
  try {
    await MentorConversation.findOneAndDelete({ user: req.user.id });
    return res.json({ message: "Conversation history cleared successfully." });
  } catch (err) {
    console.error("Error clearing mentor history:", err);
    return res.status(500).json({ message: "Unable to clear conversation history." });
  }
});

/**
 * POST /api/mentor/chat
 * Standard JSON endpoint for conversing with the mentor agent
 */
router.post("/chat", chatLimiter, async (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ message: "Message content cannot be empty." });
  }

  if (message.trim().length > 500) {
    return res.status(400).json({ message: "Message exceeds maximum limit of 500 characters." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      message: "AI Mentor is currently unavailable. GEMINI_API_KEY is not configured.",
      configured: false,
    });
  }

  try {
    let conversation = await MentorConversation.findOne({ user: req.user.id });
    if (!conversation) {
      conversation = new MentorConversation({
        user: req.user.id,
        messages: [],
      });
    }

    const { reply, toolsUsed } = await runMentorAgent(
      req.user.id,
      message.trim(),
      conversation.messages
    );

    conversation.messages.push({
      role: "user",
      content: message.trim(),
      timestamp: new Date(),
    });

    conversation.messages.push({
      role: "assistant",
      content: reply,
      toolsUsed: toolsUsed || [],
      timestamp: new Date(),
    });

    conversation.lastActiveAt = new Date();
    await conversation.save();

    return res.json({
      reply,
      toolsUsed: toolsUsed || [],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("AI Mentor chat error:", err.message);

    if (err.status === 503 || err.message?.includes("configured")) {
      return res.status(503).json({
        message: err.message || "AI Mentor service is currently unavailable.",
        configured: false,
      });
    }

    return res.status(500).json({
      message: err.message || "Failed to process mentor message.",
    });
  }
});

/**
 * POST /api/mentor/chat/stream
 * Server-Sent Events (SSE) streaming endpoint for live responses
 */
router.post("/chat/stream", chatLimiter, async (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ message: "Message cannot be empty" });
  }

  if (message.trim().length > 500) {
    return res.status(400).json({ message: "Message exceeds maximum limit of 500 characters." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let conversation = await MentorConversation.findOne({ user: req.user.id });
    if (!conversation) {
      conversation = new MentorConversation({
        user: req.user.id,
        messages: [],
      });
    }

    sendEvent("status", { message: "Analyzing..." });

    const { reply, toolsUsed } = await runMentorAgent(
      req.user.id,
      message.trim(),
      conversation.messages,
      {
        onStatus: (statusText) => sendEvent("status", { message: statusText }),
      }
    );

    conversation.messages.push({
      role: "user",
      content: message.trim(),
      timestamp: new Date(),
    });

    conversation.messages.push({
      role: "assistant",
      content: reply,
      toolsUsed: toolsUsed || [],
      timestamp: new Date(),
    });

    conversation.lastActiveAt = new Date();
    await conversation.save();

    sendEvent("done", {
      reply,
      toolsUsed: toolsUsed || [],
      timestamp: new Date().toISOString(),
    });
    res.end();
  } catch (err) {
    console.error("Stream mentor error:", err.message);
    sendEvent("error", {
      message: err.message || "Something went wrong.",
    });
    res.end();
  }
});

export default router;
