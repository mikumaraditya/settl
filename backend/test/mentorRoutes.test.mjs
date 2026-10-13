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

describe("Mentor Routes Supertest Suite", () => {
  let testUser;
  let authToken;

  before(async () => {
    const testUri = process.env.MONGO_URI_TEST || "mongodb+srv://settl-admin:settl1234@cluster0.yzuy5hv.mongodb.net/settl_test?retryWrites=true&w=majority";
    await mongoose.connect(testUri);

    testUser = await User.create({
      name: "Route Test User",
      email: `route_test_${Date.now()}@test.com`,
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
});
