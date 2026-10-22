import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const factsPath = path.resolve(__dirname, "../data/financeFacts.json");

let cachedFacts = [];

function loadFacts() {
  if (cachedFacts.length > 0) return cachedFacts;
  try {
    const raw = fs.readFileSync(factsPath, "utf-8");
    cachedFacts = JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to load financeFacts.json in knowledgeService:", err.message);
    cachedFacts = [];
  }
  return cachedFacts;
}

const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "as", "at",
  "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can", "could",
  "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from", "further", "had", "has",
  "have", "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how", "i", "if",
  "in", "into", "is", "it", "its", "itself", "just", "me", "more", "most", "my", "myself", "no", "nor",
  "not", "now", "of", "off", "on", "once", "only", "or", "other", "our", "ours", "ourselves", "out",
  "over", "own", "same", "she", "should", "so", "some", "such", "than", "that", "the", "their", "theirs",
  "them", "themselves", "then", "there", "these", "they", "this", "those", "through", "to", "too", "under",
  "until", "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom",
  "why", "with", "would", "you", "your", "yours", "yourself", "yourselves"
]);

function tokenize(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Retrieve verified financial knowledge passages relevant to user question
 * @param {string} query
 * @param {Object} [options]
 * @param {number} [options.maxResults=3]
 * @param {number} [options.threshold=0.20]
 * @returns {Array<Object>}
 */
export function retrieveKnowledge(query, options = {}) {
  const { maxResults = 3, threshold = 0.20 } = options;
  const facts = loadFacts();
  if (!query || typeof query !== "string" || facts.length === 0) return [];

  const queryClean = query.toLowerCase().trim();
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) return [];

  const scored = facts.map((fact) => {
    let score = 0;
    const titleClean = (fact.title || "").toLowerCase();
    const textClean = (fact.text || "").toLowerCase();
    const tags = (fact.tags || []).map((t) => t.toLowerCase());

    // 1. Exact phrase boost
    if (queryClean.length >= 4 && (textClean.includes(queryClean) || titleClean.includes(queryClean))) {
      score += 3.0;
    }

    // 2. Token matching with field weights
    const titleTokens = new Set(tokenize(fact.title));
    const textTokens = new Set(tokenize(fact.text));

    for (const token of queryTokens) {
      if (titleTokens.has(token)) {
        score += 1.5;
      }
      if (textTokens.has(token)) {
        score += 0.8;
      }
      for (const tag of tags) {
        if (tag === token || tag.includes(token)) {
          score += 1.2;
          break;
        }
      }
    }

    // Normalized score by query token count
    const normalizedScore = score / Math.max(1, Math.sqrt(queryTokens.length));

    return {
      fact,
      score: normalizedScore,
    };
  });

  const filtered = scored
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return filtered.map((item) => ({
    id: item.fact.id,
    topic: item.fact.topic,
    title: item.fact.title,
    text: item.fact.text,
    sourceName: item.fact.source_name,
    sourceUrl: item.fact.source_url,
    verifiedOn: item.fact.verified_on,
    score: Math.round(item.score * 100) / 100,
  }));
}

/**
 * Format retrieved passages into a structured markdown block for system prompt injection
 * @param {Array<Object>} passages
 * @returns {string}
 */
export function formatKnowledgeContext(passages = []) {
  if (!passages || passages.length === 0) return "";

  const lines = [
    "---",
    "VERIFIED FINANCIAL KNOWLEDGE (AUTHORITATIVE REGULATORY & EDUCATIONAL GROUNDING):",
    "Use the following verified passages to ground your explanation. Cite the source name and URL as markdown links in your response where relevant.",
  ];

  passages.forEach((p, idx) => {
    lines.push(
      `\n[PASSAGE ${idx + 1}] "${p.title}"` +
      `\nSource: [${p.sourceName}](${p.sourceUrl}) (Verified on ${p.verifiedOn})` +
      `\nContent: ${p.text}`
    );
  });

  lines.push("---");
  return lines.join("\n");
}

export default {
  retrieveKnowledge,
  formatKnowledgeContext,
  loadFacts,
};
