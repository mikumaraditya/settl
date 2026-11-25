import { createClient } from "@redis/client";
import { RedisStore } from "rate-limit-redis";

const redisUrl = process.env.REDIS_URL?.trim();
const useMemoryStore = process.env.RATE_LIMIT_STORE === "memory";
const redisEnabled = Boolean(redisUrl) && !useMemoryStore;

let redisClient;
let connectionPromise;

/**
 * Use one Redis connection for all rate-limit stores in this process.
 * Every middleware gets its own RedisStore instance and namespace, while
 * instances of the application share the same namespace through REDIS_URL.
 */
function getRedisClient() {
  if (!redisEnabled) return null;

  if (!redisClient) {
    redisClient = createClient({ url: redisUrl });
    redisClient.on("error", (error) => {
      console.error("Redis rate-limit connection error:", error.message);
    });
  }

  return redisClient;
}

/**
 * Connect before accepting requests so a configured Redis outage fails
 * startup instead of silently falling back to per-process rate limits.
 */
export async function connectRateLimitRedis() {
  if (!redisEnabled) return false;

  const client = getRedisClient();
  if (client.isReady) return true;

  if (!client.isOpen && !connectionPromise) {
    connectionPromise = client.connect().catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  if (connectionPromise) await connectionPromise;

  if (!client.isReady) {
    throw new Error("Redis rate-limit store did not become ready.");
  }

  return true;
}

/**
 * Create a distinct namespace for one limiter.
 * When REDIS_URL is not configured (or RATE_LIMIT_STORE=memory is explicit),
 * express-rate-limit uses its built-in in-memory store.
 */
export function createRateLimitStore(namespace) {
  if (!redisEnabled) return undefined;

  const cleanNamespace = String(namespace || "").trim();
  if (!cleanNamespace) {
    throw new TypeError("A rate-limit Redis namespace is required.");
  }

  return new RedisStore({
    prefix: `settl:rate-limit:${cleanNamespace}:`,
    sendCommand: async (...args) => {
      const client = getRedisClient();
      if (!client.isOpen) await connectRateLimitRedis();
      return client.sendCommand(args);
    },
  });
}

export function isRedisRateLimitEnabled() {
  return redisEnabled;
}

/** Close the shared connection in integration tests and graceful shutdown. */
export async function closeRateLimitRedis() {
  if (!redisClient) return;

  const client = redisClient;
  redisClient = undefined;
  connectionPromise = undefined;

  if (client.isOpen) {
    try {
      await client.quit();
    } catch (error) {
      console.error("Could not close Redis rate-limit connection:", error.message);
      client.destroy();
    }
  }
}
