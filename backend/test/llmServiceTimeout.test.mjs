import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chat, getGeminiRequestTimeoutMs } from "../src/services/llmService.js";

const originalFetch = globalThis.fetch;
const originalEnv = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GEMINI_REQUEST_TIMEOUT_MS: process.env.GEMINI_REQUEST_TIMEOUT_MS,
  GEMINI_THINKING_LEVEL: process.env.GEMINI_THINKING_LEVEL,
};

function successResponse(text = "fallback reply") {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 },
    }),
  };
}

function waitForAbort(signal) {
  return new Promise((resolve, reject) => {
    const rejectAborted = () => {
      const error = signal.reason instanceof Error
        ? signal.reason
        : new Error("The request was aborted.");
      error.name ||= "AbortError";
      reject(error);
    };

    if (signal.aborted) {
      rejectAborted();
      return;
    }
    signal.addEventListener("abort", rejectAborted, { once: true });
  });
}

describe("Gemini request timeout and model fallback", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-3.1-flash-lite";
    process.env.GEMINI_THINKING_LEVEL = "minimal";
    delete process.env.GEMINI_REQUEST_TIMEOUT_MS;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("uses the configured timeout and falls back after a slow primary model", async () => {
    const requestedModels = [];
    globalThis.fetch = async (url, options) => {
      requestedModels.push(url);
      if (url.includes("gemini-3.1-flash-lite")) {
        return waitForAbort(options.signal);
      }
      return successResponse();
    };

    const result = await chat({
      messages: [{ role: "user", content: "Hello" }],
      requestTimeoutMs: 15,
    });

    assert.equal(result.content, "fallback reply");
    assert.equal(result.modelUsed, "gemini-2.5-flash");
    assert.equal(requestedModels.length, 2);
    assert.match(requestedModels[1], /gemini-2\.5-flash/);
  });

  it("does not fall back when the caller explicitly cancels the request", async () => {
    let requestCount = 0;
    globalThis.fetch = async (_url, options) => {
      requestCount += 1;
      return waitForAbort(options.signal);
    };

    const controller = new AbortController();
    controller.abort(new Error("Stopped by user"));

    await assert.rejects(
      chat({
        messages: [{ role: "user", content: "Hello" }],
        signal: controller.signal,
        requestTimeoutMs: 100,
      }),
      /Stopped by user/,
    );
    assert.equal(requestCount, 1);
  });

  it("returns a service-busy error when all candidate models time out", async () => {
    let requestCount = 0;
    globalThis.fetch = async (_url, options) => {
      requestCount += 1;
      return waitForAbort(options.signal);
    };

    await assert.rejects(
      chat({
        messages: [{ role: "user", content: "Hello" }],
        requestTimeoutMs: 10,
      }),
      (error) => error.code === "MENTOR_BUSY" && error.status === 503,
    );
    assert.equal(requestCount, 3);
  });

  it("uses a safe default when the timeout setting is missing or invalid", () => {
    assert.equal(getGeminiRequestTimeoutMs(), 12000);
    assert.equal(getGeminiRequestTimeoutMs("invalid"), 12000);
    assert.equal(getGeminiRequestTimeoutMs(2500), 2500);
  });
});
