import { randomUUID } from "node:crypto";
import MentorConversation from "../models/MentorConversation.js";

const REQUEST_LEASE_MS = 5 * 60 * 1000;
const MAX_STORED_MESSAGES = 60;

function createBusyError() {
  const error = new Error("Finn is already processing a message for this account. Please wait for that reply before sending another.");
  error.status = 409;
  error.code = "MENTOR_REQUEST_IN_PROGRESS";
  return error;
}

/**
 * Acquire a short per-user lease so two requests cannot build from the same
 * conversation history and overwrite or interleave each other's turns.
 * The lease expires after five minutes to recover from a crashed worker.
 */
export async function acquireMentorConversation(userId) {
  const requestId = randomUUID();
  const now = new Date();
  const filter = {
    user: userId,
    $or: [
      { activeRequestExpiresAt: { $exists: false } },
      { activeRequestExpiresAt: { $lte: now } },
    ],
  };
  const update = {
    $set: {
      activeRequestId: requestId,
      activeRequestExpiresAt: new Date(now.getTime() + REQUEST_LEASE_MS),
    },
    $setOnInsert: {
      user: userId,
      messages: [],
    },
  };

  let conversation;
  try {
    conversation = await MentorConversation.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });
  } catch (error) {
    // Two first-time requests can race to create the unique user conversation.
    // The loser retries as an ordinary lock acquisition and receives 409.
    if (error?.code !== 11000) throw error;
    conversation = await MentorConversation.findOneAndUpdate(filter, {
      $set: {
        activeRequestId: requestId,
        activeRequestExpiresAt: new Date(Date.now() + REQUEST_LEASE_MS),
      },
    }, { new: true });
  }

  if (!conversation) throw createBusyError();
  return { conversation, requestId };
}

/**
 * Append a completed turn atomically and release its lease. $push avoids
 * replacing a stale in-memory document, while $slice bounds stored history.
 */
export async function appendMentorTurn(userId, requestId, message, reply, toolsUsed = []) {
  const now = new Date();
  const result = await MentorConversation.updateOne(
    { user: userId, activeRequestId: requestId },
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

/** Release a lease after failure, cancellation, or a provider error. */
export async function releaseMentorConversation(userId, requestId) {
  if (!userId || !requestId) return;
  await MentorConversation.updateOne(
    { user: userId, activeRequestId: requestId },
    {
      $unset: {
        activeRequestId: 1,
        activeRequestExpiresAt: 1,
      },
    }
  );
}
