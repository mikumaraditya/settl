import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import ReactMarkdown from 'react-markdown';
import { sendMentorMessage, fetchMentorHistory, clearMentorHistory, getMentorProfile } from '../api/mentor';
import { MENTOR_NAME } from '../constants/mentor';
import MentorOnboardingModal from './MentorOnboardingModal';

const QUICK_PROMPTS = [
  { label: '📊 Financial Summary', query: "What is my current financial situation on Settl?" },
  { label: '💸 Who Owes Me?', query: "Who owes me money and what are my pending balances?" },
  { label: '🛡️ Trust Score', query: "Why is my Trust Score at its current level and how can I improve it?" },
  { label: '📈 What is an SIP?', query: "Explain what an SIP is and how I should start investing in simple language." },
  { label: '🏷️ Spending Habits', query: "Analyze my spending breakdown across categories." },
  { label: '💰 Emergency Fund', query: "How much should I keep as an emergency fund and where should I store it?" },
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
};

const MentorChat = forwardRef(function MentorChat({ isMobileSheet: _isMobileSheet = false, onClosePanel: _onClosePanel }, ref) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(true);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);

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

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  useImperativeHandle(ref, () => ({
    handleClearHistory,
    openOnboarding: () => setShowOnboarding(true),
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
            content: `👋 Hi! I'm **${MENTOR_NAME}**, your personal Financial Mentor on Settl.\n\nI can help you understand your **group expenses, debts, balances, and Trust Score**, as well as teach you personal finance principles like **SIPs, emergency funds, budgeting, and investments**.\n\nHow can I help you today?`,
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
    setStatusMessage(`${MENTOR_NAME} is thinking...`);

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
    <div className="flex flex-col h-full bg-white dark:bg-[#0f172a] overflow-hidden text-slate-800 dark:text-slate-100">
      {/* Messages List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {fetchingHistory ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 dark:text-slate-400">
            <span className="material-symbols-outlined text-[28px] text-indigo-500 animate-spin">sync</span>
            <span className="text-xs font-semibold">Loading conversation...</span>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={index}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1.5`}
                >
                  <div className="flex items-start gap-2.5 max-w-[90%] md:max-w-[88%]">
                    {!isUser && (
                      <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 flex-shrink-0 flex items-center justify-center text-white text-[11px] font-black shadow-xs mt-0.5">
                        F
                      </div>
                    )}
                    <div
                      className={`px-3.5 py-3 rounded-2xl text-[15px] leading-[1.6] shadow-xs ${
                        isUser
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-br-xs'
                          : msg.isError
                          ? 'bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 rounded-tl-xs'
                          : 'bg-slate-100 dark:bg-[#1e293b] border border-slate-200/80 dark:border-white/10 text-slate-800 dark:text-slate-100 rounded-tl-xs'
                      }`}
                    >
                      {/* ReactMarkdown Renderer with clean WCAG AA typography */}
                      {isUser ? (
                        <p className="whitespace-pre-wrap text-[15px] leading-[1.6] font-normal break-words overflow-wrap-anywhere">{msg.content}</p>
                      ) : (
                        <div className="text-[15px] leading-[1.6] font-normal max-w-none break-words overflow-wrap-anywhere tabular-nums">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => (
                                <p className="mb-[10px] last:mb-0 text-[15px] leading-[1.6] font-normal text-slate-800 dark:text-slate-100 break-words overflow-wrap-anywhere">
                                  {children}
                                </p>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>
                              ),
                              ul: ({ children }) => (
                                <ul className="my-[10px] pl-5 list-disc space-y-[6px] text-[15px] leading-[1.6] text-slate-800 dark:text-slate-100">
                                  {children}
                                </ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="my-[10px] pl-5 list-decimal space-y-[6px] text-[15px] leading-[1.6] text-slate-800 dark:text-slate-100">
                                  {children}
                                </ol>
                              ),
                              li: ({ children }) => (
                                <li className="text-[15px] leading-[1.6] font-normal break-words overflow-wrap-anywhere">{children}</li>
                              ),
                              h1: ({ children }) => (
                                <h1 className="text-[16px] font-semibold text-slate-900 dark:text-white mt-3 mb-1.5">{children}</h1>
                              ),
                              h2: ({ children }) => (
                                <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mt-3 mb-1.5">{children}</h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white mt-2.5 mb-1">{children}</h3>
                              ),
                              hr: () => <div className="h-[10px]" />,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}

                      {/* Tool Data Used Chips */}
                      {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200/40 dark:border-white/10 flex flex-wrap gap-1.5 items-center">
                          <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[10px]">database</span> Data used:
                          </span>
                          {msg.toolsUsed.map((tool, tIdx) => (
                            <span
                              key={tIdx}
                              className="text-[9px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20"
                            >
                              {TOOL_PLAIN_NAMES[tool.name] || tool.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium px-1">
                    {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}

            {/* Loading Thinking State */}
            {loading && (
              <div className="flex items-start gap-2.5 max-w-[85%]">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 flex-shrink-0 flex items-center justify-center text-white text-[11px] font-black shadow-xs mt-0.5">
                  F
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-xs bg-slate-100 dark:bg-[#1e293b] border border-slate-200/80 dark:border-white/10 text-[13px] text-slate-500 flex items-center gap-2">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.4s]"></span>
                  </span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    {statusMessage || `${MENTOR_NAME} is analyzing...`}
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Suggested Quick Prompts */}
      {!loading && messages.length <= 3 && (
        <div className="px-4 py-2 border-t border-slate-200/60 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
            Suggested questions
          </p>
          <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1">
            {QUICK_PROMPTS.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(item.query)}
                className="text-[10px] font-semibold whitespace-nowrap bg-white dark:bg-[#1e293b] hover:bg-indigo-500/10 hover:border-indigo-500/30 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer shadow-xs"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error notification banner */}
      {error && (
        <div className="px-4 py-1.5 bg-rose-500/10 text-rose-500 text-[11px] font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="hover:underline font-bold ml-2">Dismiss</button>
        </div>
      )}

      {/* Input Form with Scoped Focus Reset, Soft Indigo Glow & Clean Pill Container */}
      <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-end gap-2.5 bg-slate-100/90 dark:bg-[#1e293b]/90 border border-slate-200 dark:border-white/10 rounded-[20px] p-2.5 sm:p-3 focus-within:border-indigo-500/80 dark:focus-within:border-indigo-400/80 focus-within:ring-[3px] focus-within:ring-indigo-500/20 dark:focus-within:ring-indigo-400/20 transition-all duration-200 shadow-xs"
        >
          <div className="flex-1 flex flex-col min-w-0 py-0.5">
            <textarea
              ref={textareaRef}
              rows={1}
              maxLength={500}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDownTextarea}
              placeholder={`Ask ${MENTOR_NAME} about your money...`}
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              autoComplete="off"
              className="finn-chat-textarea w-full bg-transparent border-0 outline-none ring-0 focus:outline-none focus:ring-0 text-[15px] leading-[1.6] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 py-0 px-1 resize-none max-h-[120px] overflow-y-auto custom-scrollbar font-normal"
              readOnly={loading}

            />
            {input.length > 400 && (
              <div className="flex justify-end pt-1 pr-1">
                <span
                  className={`text-[11px] font-mono font-medium transition-colors ${
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
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 self-end ${
              !input.trim() || loading
                ? 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 cursor-pointer'
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
        <p className="text-[11px] text-center text-slate-400 dark:text-slate-400 font-medium mt-2.5 mb-0.5 flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined text-[13px] text-amber-500 flex-shrink-0">info</span>
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
