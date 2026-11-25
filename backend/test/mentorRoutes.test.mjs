import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

import app from "../src/app.js";
import User from "../src/models/User.js";
import UserFinancialProfile from "../src/models/UserFinancialProfile.js";
import MentorConversation from "../src/models/MentorConversation.js";
import llmService from "../src/services/llmService.js";
import { MENTOR_NAME } from "../src/constants/mentor.js";

// Mock Gemini call to ensure tests run fast without using API quota
llmService.chat = async () => ({
  content: `Hello! I am ${MENTOR_NAME}, your AI Financial Mentor on Settl.`,
  toolCalls: [],
  rawParts: [{ text: `Hello! I am ${MENTOR_NAME}, your AI Financial Mentor on Settl.` }],
  usageTokens: { totalTokens: 15 },
  callDurationMs: 2,
});

import { getTestDbConfig } from "./testDbHelper.mjs";

describe("Mentor Routes Supertest Suite", () => {
  let testUser;
  let authToken;

  before(async () => {
    const { testUri } = getTestDbConfig();
    await mongoose.connect(testUri);
    await MentorConversation.syncIndexes();

    testUser = await User.create({
      name: "Route Test User",
      email: `user1_${Date.now()}@example.com`,
      password: "password123",
      isEmailVerified: true,
    });

    const jwtSecret = process.env.JWT_SECRET || "fallback_secret_for_testing";
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = jwtSecret;

    authToken = jwt.sign({ id: testUser._id.toString(), email: testUser.email }, jwtSecret, { expiresIn: "1h" });
  });

  after(async () => {
    if (testUser) {
      await UserFinancialProfile.deleteMany({ user: testUser._id });
      await MentorConversation.deleteMany({ user: testUser._id });
      await User.deleteMany({ _id: testUser._id });
    }
    await mongoose.disconnect();
  });

  it("GET /api/mentor/health - returns 200 with status and provider info", async () => {
    const res = await request(app).get("/api/mentor/health");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.status);
    assert.strictEqual(typeof res.body.configured, "boolean");
    assert.strictEqual(res.body.provider, "Gemini");
  });

  it("POST /api/mentor/chat 401 when unauthenticated", async () => {
    const res = await request(app)
      .post("/api/mentor/chat")
      .send({ message: "Hello mentor" });
    assert.strictEqual(res.status, 401);
  });

  it("POST /api/mentor/chat - 400 when message is empty", async () => {
    const res = await request(app)
      .post("/api/mentor/chat")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ message: "   " });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes("empty"));
  });

  it("POST /api/mentor/chat - 400 when message exceeds 500 characters", async () => {
    const longMessage = "a".repeat(501);
    const res = await request(app)
      .post("/api/mentor/chat")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ message: longMessage });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes("500 characters"));
  });

  it("POST /api/mentor/chat - rejects non-string message values", async () => {
    for (const message of [123, { text: "hello" }, ["hello"]]) {
      const res = await request(app)
        .post("/api/mentor/chat")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ message });
      assert.strictEqual(res.status, 400);
    }
  });

  it("POST /api/mentor/chat 200 with a valid message returns a reply", async () => {
    const res = await request(app)
      .post("/api/mentor/chat")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ message: "Should I start saving for an emergency fund?" });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.reply);
    assert.ok(Array.isArray(res.body.toolsUsed));
    assert.strictEqual(typeof res.body.reply, "string");
  });

  it("GET /api/mentor/profile 401", async () => {
    const res = await request(app).get("/api/mentor/profile");
    assert.strictEqual(res.status, 401);
  });

  it("GET /api/mentor/profile - 200 returns default profile when not existing", async () => {
    const res = await request(app)
      .get("/api/mentor/profile")
      .set("Authorization", `Bearer ${authToken}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.consentToUseForMentor, false);
  });

  it("PUT /api/mentor/profile - 200 updates profile data", async () => {
    const deadline = new Date();
    deadline.setMonth(deadline.getMonth() + 6);

    const profileData = {
      status: "job",
      monthlyIncome: 45000,
      monthlySavingsTarget: 9000,
      riskComfort: "medium",
      language: "en",
      consentToUseForMentor: true,
      goals: [
        {
          name: "Laptop Goal",
          targetAmount: 35000,
          deadline: deadline.toISOString(),
          savedSoFar: 5000,
        },
      ],
    };

    const res = await request(app)
      .put("/api/mentor/profile")
      .set("Authorization", `Bearer ${authToken}`)
      .send(profileData);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.monthlyIncome, 45000);
    assert.strictEqual(res.body.monthlySavingsTarget, 9000);
    assert.strictEqual(res.body.consentToUseForMentor, true);
  });

  it("PUT /api/mentor/profile - only boolean true enables data consent", async () => {
    const res = await request(app)
      .put("/api/mentor/profile")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ consentToUseForMentor: "false" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.consentToUseForMentor, false);
  });

  it("DELETE /api/mentor/profile - 200 deletes profile data", async () => {
    const res = await request(app)
      .delete("/api/mentor/profile")
      .set("Authorization", `Bearer ${authToken}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.message.includes("deleted"));

    const checkRes = await request(app)
      .get("/api/mentor/profile")
      .set("Authorization", `Bearer ${authToken}`);
    assert.strictEqual(checkRes.body.consentToUseForMentor, false);
  });


  it("creates, lists, renames, archives and restores only owned conversations", async () => {
    const createdA = await request(app)
      .post("/api/mentor/conversations")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ title: "Trip planning" });
    const createdB = await request(app)
      .post("/api/mentor/conversations")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ title: "Monthly budget" });

    assert.equal(createdA.status, 201);
    assert.equal(createdB.status, 201);
    const idA = createdA.body.conversation.id;
    const idB = createdB.body.conversation.id;
    assert.notEqual(idA, idB);

    const listed = await request(app)
      .get("/api/mentor/conversations")
      .set("Authorization", `Bearer ${authToken}`);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.conversations.some((item) => item.id === idA));
    assert.ok(listed.body.conversations.some((item) => item.id === idB));

    const otherUser = await User.create({
      name: "Other Mentor User",
      email: `other-mentor-${Date.now()}@example.com`,
      password: "password123",
      isEmailVerified: true,
    });
    const otherToken = jwt.sign(
      { id: otherUser._id.toString(), email: otherUser.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const privateHistory = await request(app)
      .get("/api/mentor/history")
      .set("Authorization", `Bearer ${otherToken}`)
      .query({ conversationId: idA });
    assert.equal(privateHistory.status, 404);
    await MentorConversation.deleteMany({ user: otherUser._id });
    await User.deleteOne({ _id: otherUser._id });

    const renamed = await request(app)
      .patch(`/api/mentor/conversations/${idA}`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ title: "Goa trip plan" });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.conversation.title, "Goa trip plan");

    const missingOwner = await request(app)
      .get("/api/mentor/history")
      .set("Authorization", `Bearer ${authToken}`)
      .query({ conversationId: new mongoose.Types.ObjectId().toString() });
    assert.equal(missingOwner.status, 404);

    const archived = await request(app)
      .post(`/api/mentor/conversations/${idA}/archive`)
      .set("Authorization", `Bearer ${authToken}`);
    assert.equal(archived.status, 200);
    assert.ok(archived.body.conversation.archivedAt);

    const blockedChat = await request(app)
      .post("/api/mentor/chat")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ message: "Continue my trip plan", conversationId: idA });
    assert.equal(blockedChat.status, 409);

    const restored = await request(app)
      .post(`/api/mentor/conversations/${idA}/unarchive`)
      .set("Authorization", `Bearer ${authToken}`);
    assert.equal(restored.status, 200);
    assert.equal(restored.body.conversation.archivedAt, null);

    const cleared = await request(app)
      .delete("/api/mentor/history")
      .set("Authorization", `Bearer ${authToken}`)
      .query({ conversationId: idA });
    assert.equal(cleared.status, 200);
    const historyA = await request(app)
      .get("/api/mentor/history")
      .set("Authorization", `Bearer ${authToken}`)
      .query({ conversationId: idA });
    const historyB = await request(app)
      .get("/api/mentor/history")
      .set("Authorization", `Bearer ${authToken}`)
      .query({ conversationId: idB });
    assert.equal(historyA.status, 200);
    assert.equal(historyB.status, 200);
    assert.equal(historyA.body.messages.length, 0);
    assert.equal(historyB.body.messages.length, 0);
    assert.equal(historyA.body.conversationId, idA);
    assert.equal(historyB.body.conversationId, idB);
  });

  it("saves a streamed or JSON chat turn only in the selected conversation", async () => {
    const created = await request(app)
      .post("/api/mentor/conversations")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ title: "Selected thread test" });
    assert.equal(created.status, 201);
    const conversationId = created.body.conversation.id;

    const chat = await request(app)
      .post("/api/mentor/chat")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ message: "Explain emergency funds briefly.", conversationId });
    assert.equal(chat.status, 200);
    assert.equal(chat.body.conversationId, conversationId);

    const history = await request(app)
      .get("/api/mentor/history")
      .set("Authorization", `Bearer ${authToken}`)
      .query({ conversationId });
    assert.equal(history.status, 200);
    assert.equal(history.body.messages.length, 2);
    assert.equal(history.body.messages[0].content, "Explain emergency funds briefly.");
  });

});
