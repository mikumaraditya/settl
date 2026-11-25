import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";
import {
  closeRateLimitRedis,
  connectRateLimitRedis,
  createRateLimitStore,
  isRedisRateLimitEnabled,
} from "../src/config/rateLimitStore.js";

describe("Shared Redis rate-limit store", { skip: !isRedisRateLimitEnabled() }, () => {
  before(async () => {
    await connectRateLimitRedis();
  });

  after(async () => {
    await closeRateLimitRedis();
  });

  it("shares one client's limit across independent application instances", async () => {
    const namespace = `integration-${process.pid}-${randomUUID()}`;
    const createAppInstance = () => {
      const app = express();
      app.set("trust proxy", 1);
      app.use(rateLimit({
        windowMs: 60_000,
        limit: 1,
        standardHeaders: false,
        legacyHeaders: false,
        store: createRateLimitStore(namespace),
      }));
      app.get("/limited", (_req, res) => res.status(200).json({ ok: true }));
      return app;
    };

    const instanceA = createAppInstance();
    const instanceB = createAppInstance();
    const clientIp = "198.51.100.42";

    const first = await request(instanceA)
      .get("/limited")
      .set("X-Forwarded-For", clientIp);
    const second = await request(instanceB)
      .get("/limited")
      .set("X-Forwarded-For", clientIp);

    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
  });
});
