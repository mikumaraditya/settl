import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";
import dotenv from "dotenv";
dotenv.config();

import app from "../src/app.js";
import Group from "../src/models/Group.js";
import Message from "../src/models/Message.js";
import User from "../src/models/User.js";
import { getTestDbConfig } from "./testDbHelper.mjs";

describe("Group message routes", () => {
  let owner;
  let member;
  let outsider;
  let unverified;
  let rateLimitedUser;
  let ownerToken;
  let memberToken;
  let outsiderToken;
  let unverifiedToken;
  let rateLimitedToken;
  const groupIds = [];
  const userIds = [];

  const makeGroup = async () => {
    const group = await Group.create({
      name: `Message route test ${Date.now()} ${groupIds.length}`,
      createdBy: owner._id,
      members: [
        { user: owner._id, role: "admin" },
        { user: member._id, role: "member" },
      ],
    });
    groupIds.push(group._id);
    return group;
  };

  before(async () => {
    const { testUri } = getTestDbConfig();
    await mongoose.connect(testUri);
    process.env.JWT_SECRET ||= "settl-message-routes-test-secret";

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    [owner, member, outsider, unverified] = await User.create([
      {
        name: "Message Owner",
        email: `message-owner-${suffix}@example.com`,
        password: "test-password-hash",
        isEmailVerified: true,
      },
      {
        name: "Message Member",
        email: `message-member-${suffix}@example.com`,
        password: "test-password-hash",
        isEmailVerified: true,
      },
      {
        name: "Message Outsider",
        email: `message-outsider-${suffix}@example.com`,
        password: "test-password-hash",
        isEmailVerified: true,
      },
      {
        name: "Unverified Message User",
        email: `message-unverified-${suffix}@example.com`,
        password: "test-password-hash",
        isEmailVerified: false,
      },
    ]);
    userIds.push(owner._id, member._id, outsider._id, unverified._id);
    rateLimitedUser = await User.create({
      name: "Rate Limited Message User",
      email: "message-rate-limited-" + suffix + "@example.com",
      password: "test-password-hash",
      isEmailVerified: true,
    });
    userIds.push(rateLimitedUser._id);

    const secret = process.env.JWT_SECRET;
    ownerToken = jwt.sign({ id: owner._id.toString() }, secret, { expiresIn: "1h" });
    memberToken = jwt.sign({ id: member._id.toString() }, secret, { expiresIn: "1h" });
    outsiderToken = jwt.sign({ id: outsider._id.toString() }, secret, { expiresIn: "1h" });
    unverifiedToken = jwt.sign({ id: unverified._id.toString() }, secret, { expiresIn: "1h" });
    rateLimitedToken = jwt.sign({ id: rateLimitedUser._id.toString() }, secret, { expiresIn: "1h" });
  });

  after(async () => {
    if (groupIds.length) {
      await Promise.all([
        Message.deleteMany({ group: { $in: groupIds } }),
        Group.deleteMany({ _id: { $in: groupIds } }),
      ]);
    }
    if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
    await mongoose.disconnect();
  });

  it("requires an authenticated, verified account", async () => {
    const group = await makeGroup();

    const anonymous = await requestMessageList(group._id);
    assert.equal(anonymous.status, 401);

    const unverifiedResponse = await requestMessageList(group._id, unverifiedToken);
    assert.equal(unverifiedResponse.status, 403);
  });

  it("denies non-members and handles missing or malformed group IDs", async () => {
    const group = await makeGroup();

    const deniedList = await requestMessageList(group._id, outsiderToken);
    assert.equal(deniedList.status, 403);

    const deniedSend = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ groupId: group._id.toString(), content: "Not a member" });
    assert.equal(deniedSend.status, 403);

    const missingGroup = await requestMessageList(new mongoose.Types.ObjectId().toString(), ownerToken);
    assert.equal(missingGroup.status, 404);

    const malformedGroup = await requestMessageList("not-an-object-id", ownerToken);
    assert.equal(malformedGroup.status, 400);
  });

  it("returns the newest limited messages in chronological display order", async () => {
    const group = await makeGroup();
    const baseTime = Date.now() - 10_000;

    await Message.create([
      { group: group._id, sender: owner._id, content: "First", createdAt: new Date(baseTime) },
      { group: group._id, sender: member._id, content: "Second", createdAt: new Date(baseTime + 1000) },
      { group: group._id, sender: owner._id, content: "Third", createdAt: new Date(baseTime + 2000) },
    ]);

    const response = await requestMessageList(group._id, memberToken, 2);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.map(message => message.content), ["Second", "Third"]);
    assert.equal(response.body[0].sender.name, member.name);
    assert.equal(response.body[1].sender.name, owner.name);
  });

  it("trims and persists valid messages with the authenticated sender", async () => {
    const group = await makeGroup();

    const response = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ groupId: group._id.toString(), content: "  Dinner is at 8  " });

    assert.equal(response.status, 201);
    assert.equal(response.body.content, "Dinner is at 8");
    assert.equal(response.body.sender._id, member._id.toString());
    assert.equal(await Message.countDocuments({ group: group._id }), 1);
  });


  it("rejects empty and overlong messages without writing to the database", async () => {
    const group = await makeGroup();

    const empty = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ groupId: group._id.toString(), content: "   " });
    assert.equal(empty.status, 400);

    const tooLong = await request(app)
      .post("/api/messages")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ groupId: group._id.toString(), content: "x".repeat(1001) });
    assert.equal(tooLong.status, 400);
    assert.equal(await Message.countDocuments({ group: group._id }), 0);
  });

  it("limits message creation per authenticated user", async () => {
    const group = await Group.create({
      name: "Rate limit message route test",
      createdBy: owner._id,
      members: [
        { user: owner._id, role: "admin" },
        { user: rateLimitedUser._id, role: "member" },
      ],
    });
    groupIds.push(group._id);
    const responses = [];

    for (let index = 0; index < 31; index += 1) {
      const response = await request(app)
        .post("/api/messages")
        .set("Authorization", `Bearer ${rateLimitedToken}`)
        .send({ groupId: group._id.toString(), content: `Rate limited message ${index}` });
      responses.push(response);
    }

    assert.equal(responses.filter(response => response.status === 201).length, 30);
    const limited = responses.find(response => response.status === 429);
    assert.ok(limited);
    assert.equal(
      limited.body.message,
      "You're sending messages too quickly. Please wait a minute and try again.",
    );
    assert.equal(await Message.countDocuments({ group: group._id }), 30);
  });

});

async function requestMessageList(groupId, token, limit) {
  const call = request(app).get(`/api/messages/group/${groupId}`);
  if (token) call.set("Authorization", `Bearer ${token}`);
  if (limit !== undefined) call.query({ limit });
  return call;
}
