import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import MentorConversation from "../models/MentorConversation.js";

const REQUEST_LEASE_MS = 5 * 60 * 1000;
const MAX_STORED_MESSAGES = 60;

function createBusyError() {
  const error = new Error("Finn is already processing a message in this conversation. Please wait for that reply before sending another.");
  error.status = 409;
  error.code = "MENTOR_REQUEST_IN_PROGRESS";
  return error;
}

function createNotFoundError() {
  const error = new Error("Conversation not found.");
  error.status = 404;
  error.code = "MENTOR_CONVERSATION_NOT_FOUND";
  return error;
}

function createArchivedError() {
  const error = new Error("This conversation is archived. Restore it before sending a message.");
  error.status = 409;
  error.code = "MENTOR_CONVERSATION_ARCHIVED";
  return error;
}

/**
 * Acquire a short lease for one conversation. Different conversations owned
 * by the same user can run independently; only one request can mutate a
 * particular thread at a time.
 *
 * Omitting conversationId retains compatibility with older clients by using
 * the user's most recently active conversation, or creating one when needed.
 */
export async function acquireMentorConversation(userId, conversationId = null) {
  let target;

  if (conversationId) {
    if (!mongoose.isValidObjectId(conversationId)) throw createNotFoundError();
    target = await MentorConversation.findOne({ _id: conversationId, user: userId })
      .select("+activeRequestId +activeRequestExpiresAt");
    if (!target) throw createNotFoundError();
    if (target.archivedAt) throw createArchivedError();
  } else {
    target = await MentorConversation.findOne({ user: userId, archivedAt: null })
      .sort({ lastActiveAt: -1, updatedAt: -1 })
      .select("+activeRequestId +activeRequestExpiresAt");

    if (!target) {
      target = await MentorConversation.create({
        user: userId,
        title: "New conversation",
        messages: [],
      });
    }
  }

  const requestId = randomUUID();
  const now = new Date();
  const conversation = await MentorConversation.findOneAndUpdate(
    {
      _id: target._id,
      user: userId,
      archivedAt: null,
      $or: [
        { activeRequestExpiresAt: { $exists: false } },
        { activeRequestExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        activeRequestId: requestId,
        activeRequestExpiresAt: new Date(now.getTime() + REQUEST_LEASE_MS),
      },
    },
    { new: true },
  );

  if (!conversation) {
    const current = await MentorConversation.findOne({ _id: target._id, user: userId })
      .select("+activeRequestExpiresAt");
    if (!current) throw createNotFoundError();
    if (current.archivedAt) throw createArchivedError();
    throw createBusyError();
  }

  return { conversation, conversationId: conversation._id.toString(), requestId };
}

/**
 * Append a completed turn to the selected thread and release only its lease.
 */
export async function appendMentorTurn(
  userId,
  conversationId,
  requestId,
  message,
  reply,
  toolsUsed = [],
) {
  const now = new Date();
  const result = await MentorConversation.updateOne(
    { _id: conversationId, user: userId, activeRequestId: requestId, archivedAt: null },
    {
      $push: {
        messages: {
          $each: [
            { role: "user", content: message, timestamp: now },
            { role: "assistant", content: reply, toolsUsed, timestamp: now },
          ],
          $slice: -MAX_STORED_MESSAGES,
        },
      },
      $set: { lastActiveAt: now },
      $unset: {
        activeRequestId: 1,
        activeRequestExpiresAt: 1,
      },
    }
  );

  if (result.matchedCount !== 1) {
    const error = new Error("This Finn conversation changed before the reply could be saved. Please send your message again.");
    error.status = 409;
    error.code = "MENTOR_CONVERSATION_CHANGED";
    throw error;
  }
}

/** Release one thread's lease after failure, cancellation, or provider error. */
export async function releaseMentorConversation(userId, conversationId, requestId) {
  if (!userId || !conversationId || !requestId) return;
  await MentorConversation.updateOne(
    { _id: conversationId, user: userId, activeRequestId: requestId },
    {
      $unset: {
        activeRequestId: 1,
        activeRequestExpiresAt: 1,
      },
    }
  );
}
