import { MENTOR_NAME } from "../constants/mentor.js";

const DEFAULT_MODEL = "gemini-3.1-flash-lite";

/**
 * Helper to delay execution for retry backoff
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send chat request to Gemini REST API with native tool calling support
 */
export async function chat({ messages = [], tools = [], temperature = 0.2, thinkingLevel = null, thinkingBudget = null }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

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

  // 3. Prepare Gemini request body
  const generationConfig = {
    temperature: Math.min(0.3, Math.max(0.1, temperature)),
    maxOutputTokens: 2048,
  };

  const effectiveThinkingLevel = thinkingLevel || process.env.GEMINI_THINKING_LEVEL || null;
  const effectiveThinkingBudget = thinkingBudget !== null ? thinkingBudget : (process.env.GEMINI_THINKING_BUDGET !== undefined ? Number(process.env.GEMINI_THINKING_BUDGET) : null);

  if (effectiveThinkingLevel) {
    generationConfig.thinkingConfig = { thinkingLevel: effectiveThinkingLevel };
  } else if (effectiveThinkingBudget !== null) {
    generationConfig.thinkingConfig = { thinkingBudget: effectiveThinkingBudget };
  }

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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // 4. Retry loop for 429 / 503 / RESOURCE_EXHAUSTED / UNAVAILABLE
  const MAX_RETRIES = 2;
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    attempt++;
    const callStartTime = Date.now();
    console.log(`[Gemini Request] Model: ${model} | Attempt ${attempt}/${MAX_RETRIES}...`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      const callDurationMs = Date.now() - callStartTime;

      if (!response.ok) {
        const errBody = await response.text();
        const isRetryable = response.status === 429 || response.status === 503 || errBody.includes("RESOURCE_EXHAUSTED") || errBody.includes("UNAVAILABLE");
        const isKeyError = response.status === 401 || response.status === 403 || errBody.includes("API_KEY_INVALID");

        console.error(`Gemini API Error (HTTP ${response.status} | Latency: ${callDurationMs}ms):`, errBody);

        if (isRetryable && attempt <= MAX_RETRIES) {
          const backoffMs = attempt * 1500;
          console.warn(`Gemini temporary error (HTTP ${response.status}). Retrying in ${backoffMs}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
          await delay(backoffMs);
          continue;
        }

        if (isRetryable) {
          const retryErr = new Error(`${MENTOR_NAME} is busy right now, please try again in a minute.`);
          retryErr.status = 503;
          retryErr.code = "MENTOR_BUSY";
          throw retryErr;
        }

        if (isKeyError) {
          const keyErr = new Error("Invalid or unauthenticated Gemini API key.");
          keyErr.status = 503;
          keyErr.code = "MENTOR_KEY_INVALID";
          throw keyErr;
        }

        throw new Error(`Gemini LLM request failed (HTTP ${response.status}): ${errBody.slice(0, 300)}`);
      }

      const json = await response.json();
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

      console.log(`[Gemini Response] Model: ${model} | HTTP 200 | Time: ${callDurationMs}ms | Tokens: (Prompt: ${usageTokens.promptTokens}, Output: ${usageTokens.outputTokens}, Thoughts: ${usageTokens.thoughtsTokens}, Total: ${usageTokens.totalTokens})`);

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
      };
    } catch (err) {
      if (attempt > MAX_RETRIES || err.code === "MENTOR_BUSY" || err.status === 503) {
        throw err;
      }
    }
  }

  const busyErr = new Error(`${MENTOR_NAME} is busy right now, please try again in a minute.`);
  busyErr.status = 503;
  busyErr.code = "MENTOR_BUSY";
  throw busyErr;
}

export default {
  chat,
};
