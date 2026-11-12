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

describe("Mentor conversation request coordination", () => {
  let user;

  before(async () => {
    const { testUri } = getTestDbConfig();
    await mongoose.connect(testUri);
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

  it("allows only one active request per user and atomically stores a completed turn", async () => {
    const lease = await acquireMentorConversation(user._id.toString());
    assert.deepEqual(lease.conversation.messages, []);

    await assert.rejects(
      () => acquireMentorConversation(user._id.toString()),
      (error) => error.status === 409 && error.code === "MENTOR_REQUEST_IN_PROGRESS"
    );

    await appendMentorTurn(
      user._id.toString(),
      lease.requestId,
      "How much should I save?",
      "Start with a realistic monthly target.",
      []
    );

    const stored = await MentorConversation.findOne({ user: user._id }).lean();
    assert.equal(stored.messages.length, 2);
    assert.equal(stored.messages[0].role, "user");
    assert.equal(stored.messages[1].role, "assistant");
    assert.equal(stored.messages[0].content, "How much should I save?");

    const nextLease = await acquireMentorConversation(user._id.toString());
    await releaseMentorConversation(user._id.toString(), nextLease.requestId);
  });
});
