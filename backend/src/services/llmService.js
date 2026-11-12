import { MENTOR_NAME } from "../constants/mentor.js";

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_GEMINI_REQUEST_TIMEOUT_MS = 12000;

export function getGeminiRequestTimeoutMs(timeoutMs = null) {
  const configuredTimeout = timeoutMs ?? process.env.GEMINI_REQUEST_TIMEOUT_MS;
  const parsedTimeout = Number(configuredTimeout);

  return Number.isFinite(parsedTimeout) && parsedTimeout > 0
    ? Math.floor(parsedTimeout)
    : DEFAULT_GEMINI_REQUEST_TIMEOUT_MS;
}

export const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL || DEFAULT_MODEL,
  "gemini-2.5-flash",
  "gemini-flash-latest",
];

export function buildGenerationConfig(activeModel, options = {}) {
  const isModel31OrThinking = activeModel.includes("3.1") || activeModel.includes("preview");
  const config = {
    temperature: Math.min(0.3, Math.max(0.1, options.temperature ?? 0.2)),
    maxOutputTokens: 2048,
  };

  const effectiveThinkingLevel = options.thinkingLevel || process.env.GEMINI_THINKING_LEVEL || null;
  const effectiveThinkingBudget = options.thinkingBudget !== undefined && options.thinkingBudget !== null
    ? options.thinkingBudget
    : (process.env.GEMINI_THINKING_BUDGET !== undefined ? Number(process.env.GEMINI_THINKING_BUDGET) : null);

  if (isModel31OrThinking && effectiveThinkingLevel) {
    config.thinkingConfig = { thinkingLevel: effectiveThinkingLevel };
  } else if (effectiveThinkingBudget !== null && Number.isFinite(effectiveThinkingBudget)) {
    config.thinkingConfig = { thinkingBudget: effectiveThinkingBudget };
  }

  return config;
}

/**
 * Helper to delay execution for retry backoff
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send chat request to Gemini REST API with native tool calling support
 */
export async function chat({ messages = [], tools = [], temperature = 0.2, thinkingLevel = null, thinkingBudget = null, signal = null, requestTimeoutMs = null }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const effectiveRequestTimeoutMs = getGeminiRequestTimeoutMs(requestTimeoutMs);

  if (!apiKey) {
    console.warn("⚠️ Startup Warning: GEMINI_API_KEY is missing or invalid in backend environment variables.");
    const err = new Error("Gemini API key is not configured.");
    err.status = 503;
    err.code = "MENTOR_UNCONFIGURED";
    throw err;
  }

  // 1. Extract system prompt if present
  let systemPrompt = "";
  const filteredMessages = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt += (systemPrompt ? "\n\n" : "") + (msg.content || "");
    } else {
      filteredMessages.push(msg);
    }
  }

  // 2. Convert standard messages to Gemini contents format
  const contents = [];

  for (const msg of filteredMessages) {
    if (msg.role === "user") {
      contents.push({
        role: "user",
        parts: [{ text: msg.content || "" }],
      });
    } else if (msg.role === "assistant" || msg.role === "model") {
      if (msg.rawParts && msg.rawParts.length > 0) {
        contents.push({
          role: "model",
          parts: msg.rawParts,
        });
      } else {
        const parts = [];
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          msg.toolCalls.forEach((tc) => {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.args || {},
              },
            });
          });
        }
        if (msg.content && msg.content.trim() !== "") {
          parts.push({ text: msg.content });
        }
        if (parts.length === 0) {
          parts.push({ text: "" });
        }
        contents.push({
          role: "model",
          parts,
        });
      }
    } else if (msg.role === "tool") {
      let parsedOutput = msg.content;
      if (typeof msg.content === "string") {
        try {
          parsedOutput = JSON.parse(msg.content);
        } catch {
          parsedOutput = { result: msg.content };
        }
      }
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: msg.name,
              response: typeof parsedOutput === "object" && parsedOutput !== null ? parsedOutput : { output: parsedOutput },
            },
          },
        ],
      });
    }
  }

  // 3. Candidate models to try in case of temporary 503 / 429 overload
  const primaryModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const candidateModels = Array.from(new Set([primaryModel, "gemini-2.5-flash", "gemini-flash-latest"]));

  const effectiveThinkingLevel = thinkingLevel || process.env.GEMINI_THINKING_LEVEL || null;
  const effectiveThinkingBudget = thinkingBudget !== null
    ? thinkingBudget
    : (process.env.GEMINI_THINKING_BUDGET !== undefined ? Number(process.env.GEMINI_THINKING_BUDGET) : null);

  let lastError = null;

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const activeModel = candidateModels[mIdx];
    const isModel31OrThinking = activeModel.includes("3.1") || activeModel.includes("preview");

    const generationConfig = buildGenerationConfig(activeModel, {
      temperature,
      thinkingLevel: effectiveThinkingLevel,
      thinkingBudget: effectiveThinkingBudget,
    });

    const requestBody = {
      contents,
      generationConfig,
    };

    if (systemPrompt.trim() !== "") {
      requestBody.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    if (tools && tools.length > 0) {
      requestBody.tools = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters || { type: "object", properties: {} },
          })),
        },
      ];
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent`;
    const MAX_RETRIES = 2;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      attempt++;
      const callStartTime = Date.now();
      const requestController = new AbortController();
      let didTimeout = false;
      const abortForCaller = () => requestController.abort(signal?.reason);
      if (signal?.aborted) {
        abortForCaller();
      } else {
        signal?.addEventListener("abort", abortForCaller, { once: true });
      }
      const timeoutTimer = setTimeout(() => {
        didTimeout = true;
        requestController.abort(new Error(`Gemini request timed out after ${effectiveRequestTimeoutMs}ms.`));
      }, effectiveRequestTimeoutMs);
      const cleanupRequestTimeout = () => {
        clearTimeout(timeoutTimer);
        signal?.removeEventListener("abort", abortForCaller);
      };

      console.log(`[Gemini Request] Model: ${activeModel} | Attempt ${attempt}/${MAX_RETRIES} | Timeout: ${effectiveRequestTimeoutMs}ms`);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: requestController.signal,
        });

        if (!response.ok) {
          const errBody = await response.text();
          const callDurationMs = Date.now() - callStartTime;
          const isRetryable = response.status === 429 || response.status === 503 || errBody.includes("RESOURCE_EXHAUSTED") || errBody.includes("UNAVAILABLE");
          const isKeyError = response.status === 401 || response.status === 403 || errBody.includes("API_KEY_INVALID");

          console.error(`Gemini API Error (HTTP ${response.status} | Model: ${activeModel} | Latency: ${callDurationMs}ms):`, errBody);

          if (isKeyError) {
            const keyErr = new Error("Invalid or unauthenticated Gemini API key.");
            keyErr.status = 503;
            keyErr.code = "MENTOR_KEY_INVALID";
            throw keyErr;
          }

          if (isRetryable && attempt <= MAX_RETRIES) {
            const backoffMs = attempt * 1200 + Math.floor(Math.random() * 400);
            console.warn(`Gemini temporary error (HTTP ${response.status}). Retrying in ${backoffMs}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
            cleanupRequestTimeout();
            await delay(backoffMs);
            continue;
          }

          if (isRetryable && mIdx < candidateModels.length - 1) {
            console.warn(`Model ${activeModel} unavailable after retries. Falling back to ${candidateModels[mIdx + 1]}...`);
            break; // Try next candidate model
          }

          if (isRetryable) {
            const retryErr = new Error(`${MENTOR_NAME} is busy right now, please try again in a minute.`);
            retryErr.status = 503;
            retryErr.code = "MENTOR_BUSY";
            throw retryErr;
          }

          const requestError = new Error(`Gemini request failed (HTTP ${response.status}). Check the configured model and tool schema.`);
          requestError.status = response.status;
          requestError.code = "GEMINI_REQUEST_FAILED";
          requestError.isRetryable = isRetryable;
          throw requestError;
        }

        const json = await response.json();
        const callDurationMs = Date.now() - callStartTime;
        const candidate = json?.candidates?.[0];

        if (!candidate) {
          throw new Error("Empty candidate response from Gemini API.");
        }

        const usage = json.usageMetadata || {};
        const usageTokens = {
          promptTokens: usage.promptTokenCount || 0,
          outputTokens: usage.candidatesTokenCount || usage.outputTokenCount || 0,
          thoughtsTokens: usage.candidatesTokensDetails?.find?.((d) => d.modality === "THINKING")?.tokenCount || usage.thoughtsTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0,
        };

        console.log(`[Gemini Response] Model: ${activeModel} | HTTP 200 | Time: ${callDurationMs}ms | Tokens: (Prompt: ${usageTokens.promptTokens}, Output: ${usageTokens.outputTokens}, Thoughts: ${usageTokens.thoughtsTokens}, Total: ${usageTokens.totalTokens})`);

        const parts = candidate?.content?.parts || [];
        let textContent = "";
        const toolCalls = [];

        for (const part of parts) {
          if (part.text) {
            textContent += part.text;
          }
          if (part.functionCall) {
            toolCalls.push({
              name: part.functionCall.name,
              args: part.functionCall.args || {},
            });
          }
        }

        return {
          content: textContent.trim(),
          toolCalls,
          rawParts: parts,
          usageTokens,
          callDurationMs,
          modelUsed: activeModel,
        };
      } catch (err) {
        lastError = err;

        // An explicit user cancellation always wins over the internal timeout.
        if (signal?.aborted || (!didTimeout && err?.name === "AbortError")) throw err;
        if (err.code === "MENTOR_KEY_INVALID") throw err;
        if (err.status && err.isRetryable === false) throw err;

        if (didTimeout) {
          const timeoutError = new Error(`Gemini request timed out after ${effectiveRequestTimeoutMs}ms for model ${activeModel}.`);
          timeoutError.status = 503;
          timeoutError.code = "GEMINI_REQUEST_TIMEOUT";
          timeoutError.isRetryable = true;
          lastError = timeoutError;

          if (mIdx < candidateModels.length - 1) {
            console.warn(`[Gemini Timeout] Model: ${activeModel} | Timeout: ${effectiveRequestTimeoutMs}ms | Falling back to ${candidateModels[mIdx + 1]}.`);
            break;
          }

          const busyError = new Error(`${MENTOR_NAME} is taking longer than expected. Please try again shortly.`);
          busyError.status = 503;
          busyError.code = "MENTOR_BUSY";
          throw busyError;
        }

        if (attempt > MAX_RETRIES) {
          if (mIdx < candidateModels.length - 1) {
            console.warn(`Attempt failed for ${activeModel}. Falling back to next model...`);
            break;
          }
          throw err;
        }
      } finally {
        cleanupRequestTimeout();
      }
    }
  }

  throw lastError || new Error(`${MENTOR_NAME} is busy right now, please try again in a minute.`);
}

export default {
  chat,
  CANDIDATE_MODELS,
  buildGenerationConfig,
};
