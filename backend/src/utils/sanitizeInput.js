/**
 * Sanitize untrusted user text before passing it to LLM prompts
 * Removes prompt injection attempts and truncates length.
 */
export function sanitizePromptText(text, maxLength = 100) {
  if (typeof text !== "string") return "";

  let cleaned = text.trim();

  // Strip common prompt injection pattern phrases
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous\s+)?instructions/gi,
    /ignore\s+(all\s+)?rules/gi,
    /say\s+go\s+for\s+it/gi,
    /you\s+are\s+now/gi,
    /system\s*:\s*/gi,
    /override\s+system/gi,
    /disregard\s+above/gi,
    /act\s+as\s+if/gi,
    /new\s+instruction/gi,
  ];

  for (const pattern of injectionPatterns) {
    cleaned = cleaned.replace(pattern, "[redacted]");
  }

  // Remove potential block tags or delimiters
  cleaned = cleaned.replace(/<[^>]*>/g, "");
  cleaned = cleaned.replace(/```/g, "");

  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength) + "...";
  }

  return cleaned;
}
