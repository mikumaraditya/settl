import llmService from "./llmService.js";
import {
  MENTOR_TOOLS_SCHEMA,
  executeMentorTool,
} from "./mentorTools.js";
import User from "../models/User.js";
import UserFinancialProfile from "../models/UserFinancialProfile.js";
import { MENTOR_NAME } from "../constants/mentor.js";
import { retrieveKnowledge, formatKnowledgeContext } from "./knowledgeService.js";

const SYSTEM_PROMPT = `You are "${MENTOR_NAME}", a knowledgeable, patient personal AI Financial Mentor built directly into Settl.
You teach users about money, help them understand their spending, and provide practical, evidence-grounded financial guidance with Indian-context awareness.

NOTE ON IDENTITY:
Your name is ${MENTOR_NAME}. Earlier messages in the conversation history may refer to Aarav or another name; your name is ${MENTOR_NAME}. If asked who you are, state clearly that you are ${MENTOR_NAME}, Settl's AI Financial Mentor.

EDUCATIONAL SCOPE & PROFESSIONAL ADVICE:
${MENTOR_NAME} provides financial education and guidance, NOT licensed individualized investment or tax advice.
- When users ask about complex individual tax filing, legal liability, or specific investment product suitability, answer educationally and advise consulting a qualified professional (e.g., a Chartered Accountant or SEBI-Registered Investment Advisor).
- NEVER recommend specific stock picks or guarantee speculative returns.

ANSWER STRUCTURE (Follow for educational and explanatory answers when appropriate):
1. Direct answer: Respond to the question immediately in clear, plain language.
2. Simple explanation: Explain the core financial concept simply.
3. Example: Provide a concrete numerical example when useful, using verified calculations.
4. Personal application: Apply the concept to Settl data only when relevant AND authorized by user consent.
5. Actionable next step: Suggest 1 or 2 practical, sensible steps the user can take.
6. Sources: Include clickable markdown links to authoritative sources (RBI, SEBI, AMFI, Income Tax Dept, NPCI) when verified knowledge is available.

KNOWLEDGE GROUNDING & CITATIONS:
- When "VERIFIED FINANCIAL KNOWLEDGE" passages are provided in your prompt, use them as factual evidence.
- Sourced facts vs Estimates: Always distinguish sourced regulatory facts from illustrative assumptions and rules of thumb (e.g., "The 50-30-20 rule is a popular rule of thumb", "An assumed illustrative return of 12%").
- Cite sources as markdown links: e.g., [RBI Financial Education](https://rbi.org.in/) or [SEBI Investor Education](https://investor.sebi.gov.in/).
- If authoritative evidence is unavailable for a specific up-to-date question (such as real-time scheme changes or unverified interest rates), disclose that limitation honestly rather than fabricating citations or rates.

FINANCIAL SAFETY, SCAMS & FRAUD PROTECTION:
- If a user asks about high guaranteed returns (e.g., "Where can I get 25% guaranteed returns in 6 months?"), give an unequivocal warning: any scheme promising guaranteed high returns is a classic hallmark of a Ponzi scheme or illegal deposit scheme.
- Cite the Banning of Unregulated Deposit Schemes (BUDS) Act, 2019 and SEBI/RBI investor alerts: legitimate investments cannot guarantee high returns without risk.
- Digital payment safety: Never share your UPI PIN with anyone; UPI PIN is used ONLY to send/deduct money, never to receive money.

DETERMINISTIC CALCULATORS:
- Use your tools to perform calculations deterministically in JavaScript rather than estimating in text:
  * calculateLoanEMI: for home/car/personal loan EMIs, total interest, and zero-interest loans.
  * calculateCompoundInterest: for lump-sum deposits, future value, and Rule of 72 doubling time.
  * calculateSIP: for monthly mutual fund SIP future value illustrations.
  * calculateSavingsTimeline: for determining how many months are needed to reach a savings target.
  * calculateBudgetSplit: for 50/30/20 budget allocations.
  * calculateEmergencyFund: for 3 to 6 months emergency reserve calculations.
- If required parameters are missing for a calculator, ask the user for the specific missing numbers.

PERSONAL DATA & CONSENT RULES:
- When a user asks about their own Settl finances (spending breakdown, group balances, debts, settlements, trust score):
  * Use the appropriate Settl data tool (getUserFinancialSummary, getGroupBalances, getExpenseBreakdown, getSpendingTrend, getPendingSettlements, getTrustScoreDetails).
  * If a tool returns requiresConsent: true (or consentGranted: false), politely explain that accessing their Settl financial data requires enabling 'Profile & Data Mentoring Consent' in their Financial Mentor settings. Do NOT invent personal expenses, debt amounts, or group figures!
  * Never state or guess personal financial figures without tool verification.
  * General financial education questions (e.g., "What is compound interest?", "What is an index fund?") do NOT require Settl data or consent. Answer them directly without querying private tools.

DECISION QUERIES & DEBT PRIORITIZATION:
- If the user asks whether they can afford a large purchase or start an investment commitment, and they have authorized Settl data access, inspect their Settl net balance and pending settlements:
  * If they owe significant outstanding group balances or their Trust Score is "At Risk", advise settling group dues and clearing high-interest debt first.
  * Remind the user that Settl only sees group spending and cannot see their external bank accounts or total liquid savings. Never give blanket "yes, go for it" approvals.

PRIVACY & MULTI-USER ISOLATION:
- You ONLY have access to the authenticated user's own data.
- If a user asks to view or inspect another user's personal financial details, private spending, or credit score, refuse firmly and explain that Settl strictly protects user privacy.

DATA LIMITATIONS & ACCURACY:
- Settl only tracks shared group spending, NOT total personal bank expenses outside Settl. Explicitly state this limitation whenever relevant.
- Only reference percentage figures if a tool explicitly returned them in its result with explicit unit metadata. Format with a '%' sign in user-facing prose.
- When calculateSIP returns assumedReturnRate: true, explicitly state that the calculation is "an illustration at an assumed rate".

COMMUNICATION STYLE:
- Patient, knowledgeable, objective, and encouraging.
- Avoid repetitive disclaimers on every line, avoid exaggerated flattery ("fantastic", "superb").
- Format with clear paragraphs, bullet points, and bolding on key numbers.
- Use the Indian Rupee symbol (₹) and Indian number formatting (e.g., ₹5,00,000).`;

/**
 * Helper to replace mentor name patterns only for assistant identity references
 */
function replaceMentorNamePatterns(text) {
  if (typeof text !== "string") return text;
  return text.replace(/(I'm|I am|This is)\s+Aarav/gi, `$1 ${MENTOR_NAME}`);
}

/**
 * Format conversation history into standard message objects
 */
function buildMessageList(systemPrompt, conversationHistory, newContent) {
  const messages = [{ role: "system", content: systemPrompt }];

  const historySlice = (conversationHistory || []).slice(-10);
  for (const msg of historySlice) {
    if (msg.role === "user" || msg.role === "assistant") {
      // Apply name pattern replacement ONLY to assistant-role messages and ONLY for identity patterns
      let cleanContent = msg.content;
      if (msg.role === "assistant") {
        cleanContent = replaceMentorNamePatterns(msg.content);
      }

      messages.push({
        role: msg.role,
        content: cleanContent,
      });
    }
  }

  messages.push({
    role: "user",
    content: newContent,
  });

  return messages;
}

/**
 * Run the agent loop for a user message using Gemini LLM service
 * @param {string} userId
 * @param {string} userMessage
 * @param {Array} conversationHistory
 * @param {Object} [options]
 * @param {Function} [options.onStatus] - status callback
 * @returns {Promise<{ reply: string, toolsUsed: Array }>}
 */
export async function runMentorAgent(userId, userMessage, conversationHistory = [], options = {}) {
  const { onStatus } = options;
  const user = await User.findById(userId).select("name").lean();
  const rawName = user?.name ? user.name.trim() : "Friend";
  const firstName = rawName.split(/\s+/)[0];

  const profile = await UserFinancialProfile.findOne({ user: userId }).lean();
  let langNote = "";
  if (profile && profile.consentToUseForMentor && profile.language === "hinglish") {
    langNote = "\nThe user's language preference is Hinglish. Respond in warm, natural Hinglish (mix of Latin-script Hindi and English financial terms).";
  }

  // Retrieve relevant regulatory/financial educational facts (RAG)
  const relevantKnowledge = retrieveKnowledge(userMessage, { maxResults: 3, threshold: 0.20 });
  const knowledgeContext = formatKnowledgeContext(relevantKnowledge);

  const personalizedSystemPrompt = `${SYSTEM_PROMPT}\n\nThe user's name is ${firstName}.${langNote}${knowledgeContext ? `\n\n${knowledgeContext}` : ""}`;
  const messages = buildMessageList(personalizedSystemPrompt, conversationHistory, userMessage);

  const toolsUsed = [];
  const executedToolSignatures = new Set();
  const cachedToolResults = new Map();
  const MAX_ITERATIONS = 4;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await llmService.chat({
      messages,
      tools: MENTOR_TOOLS_SCHEMA,
      temperature: 0.2,
    });

    const { content, toolCalls } = response;

    // Check if the model requested function tool calls
    if (toolCalls && toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: content || "",
        toolCalls,
        rawParts: response.rawParts,
      });

      let executedAny = false;

      for (const call of toolCalls) {
        const fnName = call.name;
        const fnArgs = call.args || {};
        const signature = `${fnName}:${JSON.stringify(fnArgs)}`;

        // Skip execution for duplicate tool calls but still push tool response using cached result
        if (executedToolSignatures.has(signature)) {
          console.warn(`Reusing cached result for duplicate tool call: ${signature}`);
          const cachedRes = cachedToolResults.get(signature);
          messages.push({
            role: "tool",
            name: fnName,
            content: JSON.stringify(cachedRes || { note: "Result already retrieved in previous step." }),
          });
          continue;
        }

        executedToolSignatures.add(signature);
        executedAny = true;

        if (onStatus) {
          onStatus(`Checking ${fnName.replace(/^get/, '').replace(/([A-Z])/g, ' $1').toLowerCase()}...`);
        }

        try {
          const result = await executeMentorTool(fnName, fnArgs, userId);
          cachedToolResults.set(signature, result);
          const jsonString = JSON.stringify(result);

          toolsUsed.push({
            name: fnName,
            args: fnArgs,
            summary: `Executed ${fnName}`,
            resultSize: jsonString.length,
          });

          messages.push({
            role: "tool",
            name: fnName,
            content: jsonString,
          });
        } catch (toolErr) {
          console.error(`Tool execution error for ${fnName}:`, toolErr.message);
          messages.push({
            role: "tool",
            name: fnName,
            content: JSON.stringify({ error: toolErr.message }),
          });
        }
      }

      if (executedAny) {
        continue;
      }
    }

    // Sanitize output text: never return raw JSON or function call strings to user
    let cleanReply = (content || "").trim();

    if (cleanReply.startsWith("{") && cleanReply.includes("tool") && cleanReply.endsWith("}")) {
      cleanReply = "I have fetched your financial data. Let me break it down for you.";
    }

    if (!cleanReply && toolsUsed.length > 0) {
      cleanReply = "I have analyzed your requested financial information.";
    }

    return {
      reply: cleanReply,
      toolsUsed,
    };
  }

  // Final completion step if iteration limit was reached
  messages.push({
    role: "user",
    content: "Please provide your final answer and summary based on the retrieved information.",
  });

  const finalResponse = await llmService.chat({
    messages,
    tools: [], // No tools on final summary call
    temperature: 0.2,
  });

  return {
    reply: (finalResponse.content || "I have analyzed your financial data.").trim(),
    toolsUsed,
  };
}

export default {
  runMentorAgent,
};
