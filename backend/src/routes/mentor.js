import express from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import protect from "../middleware/auth.js";
import requireVerified from "../middleware/requireVerified.js";
import MentorConversation from "../models/MentorConversation.js";
import UserFinancialProfile from "../models/UserFinancialProfile.js";
import { runMentorAgent } from "../services/mentorAgent.js";
import { sanitizePromptText } from "../utils/sanitizeInput.js";
import { acquireMentorConversation, appendMentorTurn, releaseMentorConversation } from "../services/mentorConversation.js";
import { createRateLimitStore } from "../config/rateLimitStore.js";

const router = express.Router();

// Rate limiter for chat interactions (60 per 15 min window)
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user.id,
  store: createRateLimitStore("mentor-chat"),
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
          consentToUseForMentor: consentToUseForMentor === true,
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


router.get("/conversations", async (req, res) => {
  try {
    const conversations = await MentorConversation.find({ user: req.user.id })
      .select("+activeRequestExpiresAt")
      .sort({ archivedAt: 1, lastActiveAt: -1, updatedAt: -1 })
      .lean();
    const now = Date.now();

    return res.json({
      conversations: conversations.map((conversation) => ({
        id: conversation._id.toString(),
        title: conversation.title || "New conversation",
        archivedAt: conversation.archivedAt || null,
        lastActiveAt: conversation.lastActiveAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages?.length || 0,
        isBusy: Boolean(conversation.activeRequestExpiresAt
          && new Date(conversation.activeRequestExpiresAt).getTime() > now),
      })),
    });
  } catch (err) {
    console.error("Error listing mentor conversations:", err);
    return res.status(500).json({ message: "Unable to load conversations." });
  }
});

router.post("/conversations", async (req, res) => {
  try {
    const requestedTitle = req.body?.title;
    if (requestedTitle !== undefined && typeof requestedTitle !== "string") {
      return res.status(400).json({ message: "Conversation title must be text." });
    }
    const title = requestedTitle?.trim()
      ? sanitizePromptText(requestedTitle.trim(), 100)
      : "New conversation";
    if (!title) return res.status(400).json({ message: "Conversation title is required." });

    const conversation = await MentorConversation.create({
      user: req.user.id,
      title,
      messages: [],
    });
    return res.status(201).json({
      conversation: {
        id: conversation._id.toString(),
        title: conversation.title,
        archivedAt: null,
        lastActiveAt: conversation.lastActiveAt,
        updatedAt: conversation.updatedAt,
        messageCount: 0,
        isBusy: false,
      },
    });
  } catch (err) {
    console.error("Error creating mentor conversation:", err);
    return res.status(500).json({ message: "Unable to create conversation." });
  }
});

router.patch("/conversations/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const requestedTitle = req.body?.title;
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id." });
    }
    if (typeof requestedTitle !== "string" || !requestedTitle.trim()) {
      return res.status(400).json({ message: "Conversation title is required." });
    }

    const title = sanitizePromptText(requestedTitle.trim(), 100);
    if (!title) return res.status(400).json({ message: "Conversation title is required." });

    const now = new Date();
    const conversation = await MentorConversation.findOneAndUpdate(
      {
        _id: conversationId,
        user: req.user.id,
        $or: [
          { activeRequestExpiresAt: { $exists: false } },
          { activeRequestExpiresAt: { $lte: now } },
        ],
      },
      { $set: { title } },
      { new: true },
    );

    if (!conversation) {
      const owned = await MentorConversation.findOne({ _id: conversationId, user: req.user.id });
      if (!owned) return res.status(404).json({ message: "Conversation not found." });
      return res.status(409).json({ message: "Wait for Finn to finish before renaming this conversation." });
    }

    return res.json({ conversation: { id: conversation._id.toString(), title: conversation.title } });
  } catch (err) {
    console.error("Error renaming mentor conversation:", err);
    return res.status(500).json({ message: "Unable to rename conversation." });
  }
});

const setConversationArchived = async (req, res, archived) => {
  try {
    const { conversationId } = req.params;
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id." });
    }

    const now = new Date();
    const stateFilter = archived
      ? { $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }] }
      : { archivedAt: { $ne: null } };
    const conversation = await MentorConversation.findOneAndUpdate(
      {
        _id: conversationId,
        user: req.user.id,
        ...stateFilter,
        $and: [{
          $or: [
            { activeRequestExpiresAt: { $exists: false } },
            { activeRequestExpiresAt: { $lte: now } },
          ],
        }],
      },
      { $set: { archivedAt: archived ? now : null } },
      { new: true },
    );

    if (!conversation) {
      const owned = await MentorConversation.findOne({ _id: conversationId, user: req.user.id });
      if (!owned) return res.status(404).json({ message: "Conversation not found." });
      const alreadyInState = archived ? Boolean(owned.archivedAt) : !owned.archivedAt;
      if (alreadyInState) {
        return res.json({
          conversation: {
            id: owned._id.toString(),
            title: owned.title,
            archivedAt: owned.archivedAt || null,
          },
        });
      }
      return res.status(409).json({ message: "Wait for Finn to finish before changing this conversation." });
    }

    return res.json({
      conversation: {
        id: conversation._id.toString(),
        title: conversation.title,
        archivedAt: conversation.archivedAt || null,
      },
    });
  } catch (err) {
    console.error("Error changing mentor conversation archive state:", err);
    return res.status(500).json({ message: "Unable to update conversation." });
  }
};

router.post("/conversations/:conversationId/archive", (req, res) =>
  setConversationArchived(req, res, true));
router.post("/conversations/:conversationId/unarchive", (req, res) =>
  setConversationArchived(req, res, false));

/**
 * GET /api/mentor/history
 * Fetch conversation history for the authenticated user
 */
router.get("/history", async (req, res) => {
  try {
    const { conversationId } = req.query;
    let conversation;
    if (conversationId !== undefined) {
      if (!mongoose.isValidObjectId(conversationId)) {
        return res.status(400).json({ message: "Invalid conversation id." });
      }
      conversation = await MentorConversation.findOne({ _id: conversationId, user: req.user.id }).lean();
    } else {
      conversation = await MentorConversation.findOne({ user: req.user.id, archivedAt: null })
        .sort({ lastActiveAt: -1, updatedAt: -1 }).lean();
    }

    if (!conversation) {
      if (conversationId !== undefined) return res.status(404).json({ message: "Conversation not found." });
      return res.json({ messages: [], conversationId: null, title: null, archivedAt: null });
    }

    return res.json({
      messages: conversation.messages || [],
      conversationId: conversation._id.toString(),
      title: conversation.title || "New conversation",
      archivedAt: conversation.archivedAt || null,
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
    const { conversationId } = req.query;
    let target;
    if (conversationId !== undefined) {
      if (!mongoose.isValidObjectId(conversationId)) {
        return res.status(400).json({ message: "Invalid conversation id." });
      }
      target = { _id: conversationId, user: req.user.id };
    } else {
      const latest = await MentorConversation.findOne({ user: req.user.id, archivedAt: null })
        .sort({ lastActiveAt: -1, updatedAt: -1 }).select("_id").lean();
      if (!latest) return res.json({ message: "Conversation history is already empty." });
      target = { _id: latest._id, user: req.user.id };
    }

    const now = new Date();
    const conversation = await MentorConversation.findOneAndUpdate(
      {
        ...target,
        $or: [
          { activeRequestExpiresAt: { $exists: false } },
          { activeRequestExpiresAt: { $lte: now } },
        ],
      },
      { $set: { messages: [], lastActiveAt: now } },
      { new: true },
    );
    if (!conversation) {
      const owned = await MentorConversation.findOne(target);
      if (!owned) return res.status(404).json({ message: "Conversation not found." });
      return res.status(409).json({ message: "Wait for Finn to finish before clearing this conversation." });
    }
    return res.json({
      message: "Conversation history cleared successfully.",
      conversationId: conversation._id.toString(),
    });
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
  const { message, conversationId } = req.body || {};

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ message: "Message content must be a non-empty string." });
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

  let lease;
  try {
    lease = await acquireMentorConversation(req.user.id, conversationId);
    const { conversation } = lease;
    const { reply, toolsUsed } = await runMentorAgent(
      req.user.id,
      message.trim(),
      conversation.messages
    );

    await appendMentorTurn(req.user.id, lease.conversation._id, lease.requestId, message.trim(), reply, toolsUsed || []);
    const suggestedTitle = sanitizePromptText(message.trim().replace(/\s+/g, " "), 80);
    if (lease.conversation.title === "New conversation" && suggestedTitle) {
      await MentorConversation.updateOne(
        { _id: lease.conversation._id, user: req.user.id, title: "New conversation" },
        { $set: { title: suggestedTitle } },
      );
    }

    return res.json({
      reply,
      toolsUsed: toolsUsed || [],
      timestamp: new Date().toISOString(),
      conversationId: lease.conversationId,
    });
  } catch (err) {
    console.error("AI Mentor chat error:", err.message);

    if (err.status === 503 || err.message?.includes("configured")) {
      return res.status(503).json({
        message: err.message || "AI Mentor service is currently unavailable.",
        configured: false,
      });
    }

    return res.status(err.status || 500).json({
      message: err.message || "Failed to process mentor message.",
    });
  } finally {
    if (lease?.requestId) {
      await releaseMentorConversation(req.user.id, lease.conversation._id, lease.requestId).catch((releaseError) => {
        console.error("Unable to release mentor conversation lease:", releaseError.message);
      });
    }
  }
});

/**
 * POST /api/mentor/chat/stream
 * Server-Sent Events (SSE) streaming endpoint for live responses
 */
router.post("/chat/stream", chatLimiter, async (req, res) => {
  const { message, conversationId } = req.body || {};

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ message: "Message content must be a non-empty string." });
  }

  if (message.trim().length > 500) {
    return res.status(400).json({ message: "Message exceeds maximum limit of 500 characters." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const controller = new AbortController();
  let clientDisconnected = false;

  // Stop paid model work when the browser closes or aborts the stream.
  res.on("close", () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      controller.abort();
    }
  });

  const sendEvent = (event, data) => {
    if (clientDisconnected || res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let lease;
  try {
    lease = await acquireMentorConversation(req.user.id, conversationId);
    const { conversation } = lease;
    sendEvent("status", { message: "Analyzing..." });

    const { reply, toolsUsed } = await runMentorAgent(
      req.user.id,
      message.trim(),
      conversation.messages,
      {
        onStatus: (statusText) => sendEvent("status", { message: statusText }),
        signal: controller.signal,
      }
    );

    if (controller.signal.aborted || clientDisconnected) return;

    await appendMentorTurn(req.user.id, lease.conversation._id, lease.requestId, message.trim(), reply, toolsUsed || []);
    const suggestedTitle = sanitizePromptText(message.trim().replace(/\s+/g, " "), 80);
    if (lease.conversation.title === "New conversation" && suggestedTitle) {
      await MentorConversation.updateOne(
        { _id: lease.conversation._id, user: req.user.id, title: "New conversation" },
        { $set: { title: suggestedTitle } },
      );
    }

    sendEvent("done", {
      reply,
      toolsUsed: toolsUsed || [],
      timestamp: new Date().toISOString(),
      conversationId: lease.conversationId,
    });
    res.end();
  } catch (err) {
    if (controller.signal.aborted || clientDisconnected || err?.name === "AbortError") {
      return;
    }

    console.error("Stream mentor error:", err.message);
    sendEvent("error", {
      message: err.message || "Something went wrong.",
      status: err.status || 500,
    });
    if (!res.writableEnded && !res.destroyed) res.end();
  } finally {
    if (lease?.requestId) {
      await releaseMentorConversation(req.user.id, lease.conversation._id, lease.requestId).catch((releaseError) => {
        console.error("Unable to release mentor conversation lease:", releaseError.message);
      });
    }
  }
});

export default router;
