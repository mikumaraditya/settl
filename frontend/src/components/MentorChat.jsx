import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendMentorMessage, fetchMentorHistory, clearMentorHistory, getMentorProfile } from '../api/mentor';
import { MENTOR_NAME } from '../constants/mentor';
import MentorOnboardingModal from './MentorOnboardingModal';

const QUICK_PROMPTS = [
  { label: '📊 Understand my spending', query: "Where did most of my money go and what is my spending breakdown?" },
  { label: '🎯 Build a savings plan', query: "How can I build a realistic monthly savings plan to reach my goals?" },
  { label: '💡 Teach me a concept', query: "Explain compound interest and the time value of money with an example." },
  { label: '💳 Loans & EMI', query: "How is loan EMI calculated, and what is the difference between principal and interest?" },
  { label: '🛡️ Improve financial habits', query: "How do credit scores work, and what habits keep my CIBIL score high?" },
  { label: '🚨 Recognize financial scams', query: "How do I spot Ponzi schemes, fake guaranteed-return offers, and digital payment scams?" },
];

const TOOL_PLAIN_NAMES = {
  getUserFinancialSummary: "Financial summary",
  getGroupBalances: "Group balances",
  getPendingSettlements: "Pending settlements",
  getExpenseBreakdown: "Expense breakdown",
  getSpendingTrend: "Spending trend",
  getTrustScoreDetails: "Trust score details",
  getTrustScoreHistory: "Trust score history",
  getSettlementHistory: "Settlement history",
  getUserProfile: "Financial profile",
  getGoalProgress: "Goal progress",
  calculateSavingsTimeline: "Savings timeline",
  calculateSIP: "SIP calculator",
  calculateBudgetSplit: "Budget split",
  calculateEmergencyFund: "Emergency fund calculator",
  calculateLoanEMI: "Loan EMI calculator",
  calculateCompoundInterest: "Compound interest calculator",
};

// Safe external URL verification
function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  );
}

const MentorChat = forwardRef(function MentorChat({ isMobileSheet: _isMobileSheet = false, onClosePanel: _onClosePanel }, ref) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(true);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    scrollToBottom(fetchingHistory ? 'auto' : 'smooth');
  }, [messages, loading, statusMessage, fetchingHistory]);

  // Auto-resize textarea smoothly up to 130px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 130)}px`;
    }
  }, [input]);

  useImperativeHandle(ref, () => ({
    handleClearHistory,
    openOnboarding: () => setShowOnboarding(true),
    sendMessage: (text) => handleSend(text),
  }));

  const loadInitialData = async () => {
    setFetchingHistory(true);
    setError('');
    try {
      const [historyData, profileData] = await Promise.all([
        fetchMentorHistory().catch(() => ({ messages: [] })),
        getMentorProfile().catch(() => null),
      ]);

      if (Array.isArray(historyData?.messages) && historyData.messages.length > 0) {
        const cleanHistory = historyData.messages.map((m) => ({
          ...m,
          content: m.role === 'assistant' && typeof m.content === 'string'
            ? m.content.replace(/(I'm|I am|This is)\s+Aarav/gi, `$1 ${MENTOR_NAME}`)
            : m.content,
        }));
        setMessages(cleanHistory);
      } else {
        setMessages([
          {
            role: 'assistant',
            content: `👋 Hi! I'm **${MENTOR_NAME}**, your AI Personal Financial Mentor on Settl.\n\nI'm here to help you master your money—from understanding your **group spending and balances** to learning about **investing, budgeting, loans, and financial safety**.\n\nAsk me any financial question or pick a suggested topic below!`,
            toolsUsed: [],
            timestamp: new Date().toISOString(),
          },
        ]);
      }

      const isDismissed = localStorage.getItem("settl_mentor_onboarding_dismissed");
      if (!isDismissed && (!profileData || profileData.consentToUseForMentor !== true)) {
        setShowOnboarding(true);
      }
    } catch (err) {
      console.error('Failed to load mentor data:', err);
      setError(`Unable to connect to ${MENTOR_NAME}. Please try again later.`);
    } finally {
      setFetchingHistory(false);
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  };

  const handleCopy = async (text, index) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex((prev) => (prev === index ? null : prev));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const handleSend = async (customText = null) => {
    const textToSend = (customText || input).trim();
    if (!textToSend || loading) return;

    if (textToSend.length > 500) {
      setError("Message exceeds maximum limit of 500 characters.");
      return;
    }

    setError('');
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMsg = {
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setStatusMessage(`${MENTOR_NAME} is analyzing...`);

    try {
      const res = await sendMentorMessage(textToSend);
      const cleanReply = typeof res.reply === 'string'
        ? res.reply.replace(/(I'm|I am|This is)\s+Aarav/gi, `$1 ${MENTOR_NAME}`)
        : res.reply;
      const assistantMsg = {
        role: 'assistant',
        content: cleanReply,
        toolsUsed: res.toolsUsed || [],
        timestamp: res.timestamp || new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Send message error:', err);
      const isBusy = err.response?.data?.message?.includes('busy') || err.status === 503;
      const errorMsg =
        err.response?.data?.message ||
        (isBusy
          ? `${MENTOR_NAME} is currently busy. Please try again in a moment.`
          : `Failed to get a response from ${MENTOR_NAME}. Please try again.`);

      setError(errorMsg);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ *${errorMsg}*`,
          toolsUsed: [],
          isError: true,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      setStatusMessage('');
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const handleClearHistory = async () => {
    if (window.confirm(`Are you sure you want to clear your conversation history with ${MENTOR_NAME}?`)) {
      try {
        await clearMentorHistory();
        setMessages([
          {
            role: 'assistant',
            content: `Conversation history cleared! Ask me anything about your Settl finances or general financial questions.`,
            toolsUsed: [],
            timestamp: new Date().toISOString(),
          },
        ]);
      } catch (err) {
        console.error('Failed to clear history:', err);
      }
    }
  };

  const handleKeyDownTextarea = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] dark:bg-[#0a0f1d] overflow-hidden text-slate-800 dark:text-slate-100">
      {/* Messages List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 sm:p-4 space-y-4">
        {fetchingHistory ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 dark:text-slate-400">
            <span className="material-symbols-outlined text-[28px] text-indigo-500 animate-spin">sync</span>
            <span className="text-xs font-semibold">Loading conversation...</span>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isCopied = copiedIndex === index;

              return (
                <div
                  key={index}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`}
                >
                  {isUser ? (
                    /* User Message Bubble */
                    <div className="max-w-[85%] sm:max-w-[80%] flex flex-col items-end">
                      <div className="px-4 py-2.5 rounded-2xl rounded-br-xs bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 text-white shadow-sm text-[14.5px] leading-[1.6] font-normal break-words overflow-wrap-anywhere">
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium px-1 mt-1">
                        {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ) : (
                    /* Finn Assistant Message Container */
                    <div className="w-full max-w-full sm:max-w-[94%] md:max-w-[92%] flex flex-col items-start">
                      <div
                        className={`w-full rounded-2xl rounded-tl-xs p-3.5 sm:p-4 shadow-xs transition-all ${
                          msg.isError
                            ? 'bg-rose-500/10 border border-rose-500/25 text-rose-500 dark:text-rose-400'
                            : 'bg-white dark:bg-[#131c31] border border-slate-200/90 dark:border-white/10 text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {/* Assistant Header Row: Avatar, Name, Badge, Timestamp, Copy Button */}
                        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200/60 dark:border-white/5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 flex-shrink-0 flex items-center justify-center text-white text-[11px] font-black shadow-xs">
                              F
                            </div>
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {MENTOR_NAME}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                              AI Mentor
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                              {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {!msg.isError && (
                              <button
                                onClick={() => handleCopy(msg.content, index)}
                                className="p-1 rounded-md text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                                title="Copy response to clipboard"
                                aria-label="Copy response to clipboard"
                              >
                                {isCopied ? (
                                  <>
                                    <span className="material-symbols-outlined text-[13px] text-emerald-500">check</span>
                                    <span className="text-[10px] font-semibold text-emerald-500">Copied</span>
                                  </>
                                ) : (
                                  <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Rich Markdown Renderer */}
                        <div className="text-[14.5px] leading-[1.65] font-normal text-slate-700 dark:text-slate-200 break-words overflow-wrap-anywhere tabular-nums">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h1: ({ children }) => (
                                <h1 className="text-[16.5px] font-bold text-slate-900 dark:text-white mt-3.5 mb-2 pb-1 border-b border-slate-200/60 dark:border-white/10 tracking-tight">
                                  {children}
                                </h1>
                              ),
                              h2: ({ children }) => (
                                <h2 className="text-[15.5px] font-bold text-slate-900 dark:text-white mt-3 mb-1.5 tracking-tight">
                                  {children}
                                </h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="text-[14.5px] font-bold text-indigo-600 dark:text-indigo-400 mt-2.5 mb-1 tracking-tight">
                                  {children}
                                </h3>
                              ),
                              p: ({ children }) => (
                                <p className="mb-2.5 last:mb-0 text-[14.5px] leading-[1.65] font-normal text-slate-700 dark:text-slate-200 break-words overflow-wrap-anywhere">
                                  {children}
                                </p>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-bold text-slate-950 dark:text-white tracking-wide">
                                  {children}
                                </strong>
                              ),
                              em: ({ children }) => (
                                <em className="italic text-slate-600 dark:text-slate-300">
                                  {children}
                                </em>
                              ),
                              ul: ({ children }) => (
                                <ul className="my-2 pl-5 list-disc space-y-1 text-[14.5px] leading-[1.65] text-slate-700 dark:text-slate-200 marker:text-indigo-500 marker:font-semibold">
                                  {children}
                                </ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="my-2 pl-5 list-decimal space-y-1 text-[14.5px] leading-[1.65] text-slate-700 dark:text-slate-200 marker:text-indigo-500 marker:font-bold">
                                  {children}
                                </ol>
                              ),
                              li: ({ children }) => (
                                <li className="text-[14.5px] leading-[1.65] font-normal pl-0.5 break-words overflow-wrap-anywhere">
                                  {children}
                                </li>
                              ),
                              blockquote: ({ children }) => (
                                <blockquote className="my-3 border-l-4 border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/25 px-3.5 py-2.5 rounded-r-xl text-slate-800 dark:text-slate-200 text-[14px] leading-relaxed font-normal shadow-xs">
                                  {children}
                                </blockquote>
                              ),
                              hr: () => (
                                <hr className="my-3 border-t border-slate-200 dark:border-white/10" />
                              ),
                              code: ({ inline, className, children, ...props }) => {
                                if (inline) {
                                  return (
                                    <code
                                      className="px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800/80 border border-slate-300/40 dark:border-white/10 font-mono text-[12.5px] font-medium text-indigo-600 dark:text-indigo-300 break-words"
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  );
                                }
                                return (
                                  <code className="font-mono text-[12.5px] text-slate-200" {...props}>
                                    {children}
                                  </code>
                                );
                              },
                              pre: ({ children }) => (
                                <pre className="my-3 p-3 rounded-xl bg-slate-900/95 dark:bg-slate-950 border border-slate-800 dark:border-white/10 font-mono text-xs overflow-x-auto custom-scrollbar shadow-inner text-slate-200">
                                  {children}
                                </pre>
                              ),
                              table: ({ children }) => (
                                <div className="my-3 w-full overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/40 shadow-xs custom-scrollbar">
                                  <table className="w-full min-w-[340px] text-left text-xs border-collapse">
                                    {children}
                                  </table>
                                </div>
                              ),
                              thead: ({ children }) => (
                                <thead className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-bold">
                                  {children}
                                </thead>
                              ),
                              tbody: ({ children }) => (
                                <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
                                  {children}
                                </tbody>
                              ),
                              tr: ({ children }) => (
                                <tr className="hover:bg-indigo-500/5 transition-colors">
                                  {children}
                                </tr>
                              ),
                              th: ({ children }) => (
                                <th className="px-3 py-2 text-[11.5px] font-bold text-slate-900 dark:text-slate-100 tracking-wider">
                                  {children}
                                </th>
                              ),
                              td: ({ children }) => (
                                <td className="px-3 py-2 text-[12px] text-slate-700 dark:text-slate-300 leading-normal">
                                  {children}
                                </td>
                              ),
                              a: ({ href, children }) => {
                                const safe = isSafeUrl(href);
                                if (!safe) {
                                  return <span className="text-slate-500 dark:text-slate-400 underline">{children}</span>;
                                }
                                return (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-600 dark:text-indigo-400 font-semibold underline underline-offset-2 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors inline-flex items-center gap-0.5"
                                  >
                                    <span>{children}</span>
                                    <span className="material-symbols-outlined text-[13px] inline opacity-80">open_in_new</span>
                                  </a>
                                );
                              },
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>

                        {/* Tool Data Used Chips */}
                        {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-white/10 flex flex-wrap gap-1.5 items-center">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                              <span className="material-symbols-outlined text-[11px]">database</span> Data used:
                            </span>
                            {msg.toolsUsed.map((tool, tIdx) => (
                              <span
                                key={tIdx}
                                className="text-[9.5px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-500/20"
                              >
                                {TOOL_PLAIN_NAMES[tool.name] || tool.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading / Thinking State */}
            {loading && (
              <div className="w-full max-w-[85%] sm:max-w-[75%] flex flex-col items-start animate-in fade-in duration-200">
                <div className="px-4 py-3 rounded-2xl rounded-tl-xs bg-white dark:bg-[#131c31] border border-slate-200/80 dark:border-white/10 text-[13px] shadow-xs flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 flex-shrink-0 flex items-center justify-center text-white text-[11px] font-black shadow-xs">
                    F
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.4s]"></span>
                    </span>
                    <span className="font-semibold text-xs text-indigo-600 dark:text-indigo-400">
                      {statusMessage || `${MENTOR_NAME} is analyzing...`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Suggested Quick Prompts */}
      {!loading && messages.length <= 4 && (
        <div className="px-4 py-2 border-t border-slate-200/60 dark:border-white/5 bg-slate-50/70 dark:bg-white/[0.01]">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px] text-indigo-500">lightbulb</span>
            Suggested questions
          </p>
          <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1">
            {QUICK_PROMPTS.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(item.query)}
                className="text-[11px] font-medium whitespace-nowrap bg-white dark:bg-[#1e293b] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-500/40 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-3 py-1.5 rounded-full transition-all cursor-pointer shadow-xs active:scale-95"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error notification banner */}
      {error && (
        <div className="px-4 py-2 bg-rose-500/10 border-t border-rose-500/20 text-rose-500 text-[11.5px] font-semibold flex items-center justify-between">
          <span className="leading-snug">{error}</span>
          <button onClick={() => setError('')} className="hover:underline font-bold ml-2 cursor-pointer flex-shrink-0">Dismiss</button>
        </div>
      )}

      {/* Composer & Controls */}
      <div className="p-3 sm:p-3.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a0f1d]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2 bg-slate-100/90 dark:bg-[#131c31]/90 border border-slate-200 dark:border-white/10 rounded-2xl p-2 sm:p-2.5 focus-within:border-indigo-500/80 dark:focus-within:border-indigo-400/80 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:focus-within:ring-indigo-400/20 transition-all duration-200 shadow-xs"
        >
          <div className="flex-1 flex flex-col min-w-0 py-0.5">
            <textarea
              ref={textareaRef}
              rows={1}
              maxLength={500}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDownTextarea}
              placeholder={`Ask ${MENTOR_NAME} about budgeting, loans, savings, or spending...`}
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              autoComplete="off"
              className="finn-chat-textarea w-full bg-transparent border-0 outline-none ring-0 focus:outline-none focus:ring-0 text-[14.5px] leading-[1.6] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 py-0 px-1 resize-none max-h-[130px] overflow-y-auto custom-scrollbar font-normal"
              readOnly={loading}
              aria-label={`Ask ${MENTOR_NAME} a financial question`}
            />
            {input.length > 400 && (
              <div className="flex justify-end pt-1 pr-1">
                <span
                  className={`text-[10.5px] font-mono font-medium transition-colors ${
                    input.length >= 500
                      ? 'text-rose-500 dark:text-rose-400 font-bold'
                      : input.length >= 480
                      ? 'text-amber-500 dark:text-amber-400 font-semibold'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {input.length}/500
                </span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-disabled={!input.trim() || loading}
            aria-label="Send message"
            title="Send message"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 self-end ${
              !input.trim() || loading
                ? 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 cursor-pointer'
            }`}
          >
            {loading ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">send</span>
            )}
          </button>
        </form>

        <p className="text-[10.5px] text-center text-slate-400 dark:text-slate-500 font-medium mt-2 mb-0.5 flex items-center justify-center gap-1">
          <span className="material-symbols-outlined text-[12px] text-amber-500 flex-shrink-0">info</span>
          Educational guidance only · Not a licensed financial adviser
        </p>
      </div>

      <MentorOnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </div>
  );
});

export default MentorChat;
