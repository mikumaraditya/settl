import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

import app from "../src/app.js";
import User from "../src/models/User.js";
import { getTestDbConfig } from "./testDbHelper.mjs";

describe("Authentication session restoration", () => {
  let verifiedUser;
  let unverifiedUser;
  let verifiedToken;
  let unverifiedToken;
  let missingUserToken;

  before(async () => {
    const { testUri } = getTestDbConfig();
    await mongoose.connect(testUri);

    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = "auth-test-secret";
    }

    verifiedUser = await User.create({
      name: "Verified Session User",
      email: `verified-session-${Date.now()}@example.com`,
      password: "test-password-hash",
      upiId: "verified@oksbi",
      isEmailVerified: true,
    });

    unverifiedUser = await User.create({
      name: "Unverified Session User",
      email: `unverified-session-${Date.now()}@example.com`,
      password: "test-password-hash",
      upiId: "",
      isEmailVerified: false,
    });

    const jwtSecret = process.env.JWT_SECRET;
    verifiedToken = jwt.sign({ id: verifiedUser._id.toString() }, jwtSecret, { expiresIn: "1h" });
    unverifiedToken = jwt.sign({ id: unverifiedUser._id.toString() }, jwtSecret, { expiresIn: "1h" });
    missingUserToken = jwt.sign({ id: new mongoose.Types.ObjectId().toString() }, jwtSecret, { expiresIn: "1h" });
  });

  after(async () => {
    const ids = [verifiedUser?._id, unverifiedUser?._id].filter(Boolean);
    if (ids.length) await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  });

  it("returns 401 when no session token is provided", async () => {
    const response = await request(app).get("/api/auth/me");
    assert.equal(response.status, 401);
  });

  it("restores a session from the HTTP-only token cookie without exposing private fields", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `token=${verifiedToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body._id, verifiedUser._id.toString());
    assert.equal(response.body.email, verifiedUser.email);
    assert.equal(response.body.isEmailVerified, true);
    assert.equal(response.body.upiId, "verified@oksbi");
    assert.equal(response.body.password, undefined);
    assert.equal(response.body.emailVerificationToken, undefined);
    assert.equal(response.headers["cache-control"], "no-store");
  });

  it("restores an authenticated but unverified account so the UI can show verification guidance", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${unverifiedToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body._id, unverifiedUser._id.toString());
    assert.equal(response.body.isEmailVerified, false);
  });

  it("rejects a valid JWT when its user no longer exists", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${missingUserToken}`);

    assert.equal(response.status, 401);
    assert.equal(response.body.message, "Session is no longer valid");
  });

  it("limits Google sign-in attempts per client IP", async () => {
    const responses = [];

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request(app)
        .post("/api/auth/google")
        .send({});
      responses.push(response);
    }

    assert.equal(responses.slice(0, 10).filter(response => response.status === 400).length, 10);
    assert.equal(responses[10].status, 429);
    assert.equal(
      responses[10].body.message,
      "Too many Google sign-in attempts. Please try again in 15 minutes.",
    );
  });
});
