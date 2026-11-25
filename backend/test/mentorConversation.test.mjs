import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import MentorConversation from "../src/models/MentorConversation.js";
import {
  acquireMentorConversation,
  appendMentorTurn,
  releaseMentorConversation,
} from "../src/services/mentorConversation.js";
import { getTestDbConfig } from "./testDbHelper.mjs";

describe("Multi-session mentor conversation coordination", () => {
  let user;

  before(async () => {
    const { testUri } = getTestDbConfig();
    await mongoose.connect(testUri);
    // Drop the legacy unique user index and create the current multi-session indexes.
    await MentorConversation.syncIndexes();
    user = await User.create({
      name: "Mentor Lease Test",
      email: "mentor-lease-" + Date.now() + "@example.com",
      password: "password123",
      isEmailVerified: true,
    });
  });

  after(async () => {
    if (user) {
      await MentorConversation.deleteMany({ user: user._id });
      await User.deleteMany({ _id: user._id });
    }
    await mongoose.disconnect();
  });

  it("allows independent requests in separate sessions but serializes each individual session", async () => {
    const [first, second] = await MentorConversation.create([
      { user: user._id, title: "First chat", messages: [] },
      { user: user._id, title: "Second chat", messages: [] },
    ]);

    const firstLease = await acquireMentorConversation(user._id.toString(), first._id.toString());
    const secondLease = await acquireMentorConversation(user._id.toString(), second._id.toString());

    assert.equal(firstLease.conversationId, first._id.toString());
    assert.equal(secondLease.conversationId, second._id.toString());
    assert.notEqual(firstLease.requestId, secondLease.requestId);

    await assert.rejects(
      () => acquireMentorConversation(user._id.toString(), first._id.toString()),
      (error) => error.status === 409 && error.code === "MENTOR_REQUEST_IN_PROGRESS",
    );

    await appendMentorTurn(
      user._id.toString(),
      first._id.toString(),
      firstLease.requestId,
      "How much should I save?",
      "Start with a realistic monthly target.",
      [],
    );

    const [storedFirst, storedSecond] = await Promise.all([
      MentorConversation.findById(first._id).lean(),
      MentorConversation.findById(second._id).lean(),
    ]);
    assert.equal(storedFirst.messages.length, 2);
    assert.equal(storedFirst.messages[0].role, "user");
    assert.equal(storedFirst.messages[1].role, "assistant");
    assert.equal(storedFirst.messages[0].content, "How much should I save?");
    assert.equal(storedSecond.messages.length, 0, "a turn must not leak into another session");

    await releaseMentorConversation(user._id.toString(), second._id.toString(), secondLease.requestId);
    const nextLease = await acquireMentorConversation(user._id.toString(), first._id.toString());
    await releaseMentorConversation(user._id.toString(), first._id.toString(), nextLease.requestId);
  });

  it("creates a default session for legacy clients and rejects archived sessions", async () => {
    const lease = await acquireMentorConversation(user._id.toString());
    assert.ok(lease.conversationId);
    await releaseMentorConversation(user._id.toString(), lease.conversation._id.toString(), lease.requestId);

    await MentorConversation.updateOne(
      { _id: lease.conversation._id, user: user._id },
      { $set: { archivedAt: new Date() } },
    );
    await assert.rejects(
      () => acquireMentorConversation(user._id.toString(), lease.conversation._id.toString()),
      (error) => error.status === 409 && error.code === "MENTOR_CONVERSATION_ARCHIVED",
    );
  });
});
