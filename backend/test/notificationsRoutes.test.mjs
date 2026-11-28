import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import request from "supertest";
dotenv.config();

import app from "../src/app.js";
import Group from "../src/models/Group.js";
import Notification from "../src/models/Notification.js";
import User from "../src/models/User.js";
import { getTestDbConfig } from "./testDbHelper.mjs";

describe("Persistent notification routes", () => {
  let owner;
  let otherUser;
  let unverified;
  let ownerToken;
  let unverifiedToken;
  let group;
  let sequence = 0;
  const userIds = [];

  const makeNotification = async (user, overrides = {}) => {
    sequence += 1;
    return Notification.create({
      user: user._id,
      type: "settlement_schedule_reminder",
      title: overrides.title || `Payment reminder ${sequence}`,
      body: overrides.body || "A scheduled payment is due soon.",
      group: group._id,
      schedule: new mongoose.Types.ObjectId(),
      reminderStage: overrides.reminderStage || "day_before",
      dedupeKey: `${user._id.toString()}-notification-test-${sequence}`,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    });
  };

  const asUser = (token) => request(app)
    .get("/api/notifications")
    .set("Authorization", `Bearer ${token}`);

  before(async () => {
    const { testUri } = getTestDbConfig();
    await mongoose.connect(testUri);
    process.env.JWT_SECRET ||= "settl-notification-routes-test-secret";

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    [owner, otherUser, unverified] = await User.create([
      {
        name: "Notification Owner",
        email: `notification-owner-${suffix}@example.com`,
        password: "test-password-hash",
        isEmailVerified: true,
      },
      {
        name: "Other Notification User",
        email: `notification-other-${suffix}@example.com`,
        password: "test-password-hash",
        isEmailVerified: true,
      },
      {
        name: "Unverified Notification User",
        email: `notification-unverified-${suffix}@example.com`,
        password: "test-password-hash",
        isEmailVerified: false,
      },
    ]);
    userIds.push(owner._id, otherUser._id, unverified._id);

    const secret = process.env.JWT_SECRET;
    ownerToken = jwt.sign({ id: owner._id.toString() }, secret, { expiresIn: "1h" });
    unverifiedToken = jwt.sign({ id: unverified._id.toString() }, secret, { expiresIn: "1h" });

    group = await Group.create({
      name: `Notification route test ${suffix}`,
      createdBy: owner._id,
      members: [{ user: owner._id, role: "admin" }],
    });
  });

  after(async () => {
    if (userIds.length) {
      await Notification.deleteMany({ user: { $in: userIds } });
      await User.deleteMany({ _id: { $in: userIds } });
    }
    if (group?._id) await Group.deleteOne({ _id: group._id });
    await mongoose.disconnect();
  });

  it("requires an authenticated, verified account", async () => {
    const anonymous = await request(app).get("/api/notifications");
    assert.equal(anonymous.status, 401);

    const unverifiedResponse = await asUser(unverifiedToken);
    assert.equal(unverifiedResponse.status, 403);
  });

  it("returns only the current user's newest 30 active notifications", async () => {
    const baseTime = Date.now() - 60_000;
    for (let index = 0; index < 32; index += 1) {
      await makeNotification(owner, {
        title: `Own ${index}`,
        createdAt: new Date(baseTime + index * 1000),
      });
    }
    await makeNotification(otherUser, { title: "Private to another user" });
    const deleted = await makeNotification(owner, { title: "Deleted notification" });
    await Notification.updateOne(
      { _id: deleted._id },
      { $set: { deletedAt: new Date(), readAt: new Date() } },
    );

    const response = await asUser(ownerToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.notifications.length, 30);
    assert.ok(response.body.notifications.every(item => item.title.startsWith("Own ")));
    assert.equal(response.body.notifications[0].title, "Own 31");
    assert.equal(response.body.notifications[29].title, "Own 2");
    assert.equal(response.body.notifications[0].persistent, true);
    assert.equal(response.body.notifications[0].read, false);
    assert.equal(response.body.unreadCount, 32, "unread count includes older active notifications and excludes other users/deleted records");
  });

  it("marks only an owned active notification as read", async () => {
    const own = await makeNotification(owner);
    const foreign = await makeNotification(otherUser);
    const deleted = await makeNotification(owner);
    await Notification.updateOne({ _id: deleted._id }, { $set: { deletedAt: new Date() } });

    const invalid = await request(app)
      .patch("/api/notifications/not-an-object-id/read")
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(invalid.status, 400);

    const denied = await request(app)
      .patch(`/api/notifications/${foreign._id}/read`)
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(denied.status, 404);

    const missingDeleted = await request(app)
      .patch(`/api/notifications/${deleted._id}/read`)
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(missingDeleted.status, 404);

    const marked = await request(app)
      .patch(`/api/notifications/${own._id}/read`)
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(marked.status, 200);
    assert.equal(marked.body.success, true);
    assert.ok((await Notification.findById(own._id)).readAt);
    assert.equal((await Notification.findById(foreign._id)).readAt, null);
  });

  it("marks only the current user's active unread notifications as read", async () => {
    const ownUnread = await makeNotification(owner);
    const ownRead = await makeNotification(owner);
    const ownDeleted = await makeNotification(owner);
    const foreignUnread = await makeNotification(otherUser);

    await Notification.updateOne({ _id: ownRead._id }, { $set: { readAt: new Date() } });
    await Notification.updateOne({ _id: ownDeleted._id }, { $set: { deletedAt: new Date() } });

    const response = await request(app)
      .patch("/api/notifications/read-all")
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    assert.ok((await Notification.findById(ownUnread._id)).readAt);
    assert.ok((await Notification.findById(ownRead._id)).readAt);
    assert.equal((await Notification.findById(ownDeleted._id)).readAt, null);
    assert.equal((await Notification.findById(foreignUnread._id)).readAt, null);
  });

  it("clears only the current user's notifications using soft deletion", async () => {
    const ownActive = await makeNotification(owner);
    const ownAlreadyRead = await makeNotification(owner);
    const foreignActive = await makeNotification(otherUser);
    await Notification.updateOne(
      { _id: ownAlreadyRead._id },
      { $set: { readAt: new Date() } },
    );

    const response = await request(app)
      .delete("/api/notifications")
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const [active, alreadyRead, foreign] = await Promise.all([
      Notification.findById(ownActive._id),
      Notification.findById(ownAlreadyRead._id),
      Notification.findById(foreignActive._id),
    ]);
    assert.ok(active.deletedAt);
    assert.ok(active.readAt);
    assert.ok(alreadyRead.deletedAt);
    assert.ok(alreadyRead.readAt);
    assert.equal(foreign.deletedAt, null);

    const list = await asUser(ownerToken);
    assert.equal(list.status, 200);
    assert.equal(list.body.notifications.some(item => item.id === ownActive._id.toString()), false);
  });
});
