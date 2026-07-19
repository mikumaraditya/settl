import { useState, useEffect, useRef } from 'react';
import axios from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function FinancialMentorWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [mentor, setMentor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasFetched, setHasFetched] = useState(false);
  const [unseen, setUnseen] = useState(() => {
    try {
      return !sessionStorage.getItem('settl_mentor_seen');
    } catch {
      return false;
    }
  });

  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Escape key listener
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const toggleOpen = () => {
    if (!isOpen) {
      setIsOpen(true);
      setUnseen(false);
      sessionStorage.setItem('settl_mentor_seen', 'true');
      
      // Fetch data only if not fetched yet
      if (!hasFetched) {
        fetchMentor();
      }
    } else {
      setIsOpen(false);
    }
  };

  const fetchMentor = async (force = false) => {
    if (!force && user) {
      const cachedStr = localStorage.getItem(`mentor_cache_${user._id}`);
      if (cachedStr) {
        try {
          const parsed = JSON.parse(cachedStr);
          setMentor(parsed);
          setHasFetched(true);
          return;
        } catch (e) {
          console.error('Failed to parse mentor cache', e);
        }
      }
    }

    setLoading(true);
    setError('');
    try {
      const url = force ? '/insights/mentor?bypassCache=true' : '/insights/mentor';
      const { data } = await axios.get(url);
      
      if (user && data && data.status !== 'not_enough_data') {
        localStorage.setItem(`mentor_cache_${user._id}`, JSON.stringify(data));
      }
      
      setMentor(data);
      setHasFetched(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Your mentor report is unavailable right now.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className="fixed bottom-20 md:bottom-8 right-4 md:right-8 w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.5)] hover:shadow-[0_0_45px_rgba(168,85,247,0.8)] hover:scale-110 active:scale-95 transition-all duration-300 cursor-pointer z-50 focus:outline-none ring-4 ring-purple-500/20 hover:ring-purple-500/40 group"
        aria-label="AI Financial Mentor"
      >
        {isOpen ? (
          <span className="material-symbols-outlined text-[24px] md:text-[28px]">close</span>
        ) : (
          <span className="material-symbols-outlined text-[24px] md:text-[28px] group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300">auto_awesome</span>
        )}

        {/* Pulse Dot */}
        {unseen && (
          <span className="absolute top-0.5 right-0.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500 border border-white dark:border-[#0a0f1d]"></span>
          </span>
        )}
      </button>

      {/* Floating Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed bottom-36 md:bottom-24 left-4 right-4 md:left-auto md:right-8 md:w-[380px] max-h-[60vh] md:max-h-[70vh] bg-white dark:bg-[#182237] rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl shadow-slate-350/20 dark:shadow-black/60 overflow-hidden flex flex-col z-50 animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/[0.01]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-purple-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                <span className="material-symbols-outlined text-[18px] text-purple-500 dark:text-purple-400 font-bold">auto_awesome</span>
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-pink-500">AI Financial Mentor</h2>
                <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider mt-0.5">Personalized Insights</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchMentor(true)}
                disabled={loading}
                className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                title="Generate new insights"
              >
                <span className={`material-symbols-outlined text-[14px] ${loading ? 'animate-spin' : ''}`}>sync</span>
                Rethink
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-on-surface-variant hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <span className="material-symbols-outlined text-[32px] text-indigo-400 animate-spin">sync</span>
                <p className="text-xs text-on-surface-variant font-semibold">Analyzing your cross-group activity...</p>
              </div>
            ) : error ? (
              <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl px-4 py-3 text-xs font-semibold">
                <span className="material-symbols-outlined text-[16px] flex-shrink-0 mt-0.5">error</span>
                <span className="leading-relaxed">{error}</span>
              </div>
            ) : mentor?.status === 'not_enough_data' ? (
              <div className="flex flex-col items-center text-center py-4 px-2 gap-3 bg-slate-50 dark:bg-white/[0.01] rounded-2xl border border-slate-200 dark:border-white/5">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 dark:text-amber-400">
                  <span className="material-symbols-outlined text-[24px]">analytics</span>
                </div>
                <h3 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">Not Enough Activity Yet</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">{mentor.reason}</p>
                {mentor.activity && (
                  <div className="grid grid-cols-2 gap-3 mt-3 text-[9px] font-bold text-on-surface-variant uppercase tracking-wider w-full">
                    <div className="bg-slate-100 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-2.5 rounded-xl flex flex-col items-center justify-center">
                      <span className="text-[9px] text-on-surface-variant">Expenses</span>
                      <span className="text-slate-850 dark:text-white text-xs font-black mt-1">{mentor.activity.expenses} / 3</span>
                    </div>
                    <div className="bg-slate-100 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-2.5 rounded-xl flex flex-col items-center justify-center">
                      <span className="text-[9px] text-on-surface-variant">Months Active</span>
                      <span className="text-slate-850 dark:text-white text-xs font-black mt-1">{mentor.activity.activeMonths} / 2</span>
                    </div>
                    <div className="bg-slate-100 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-2.5 rounded-xl flex flex-col items-center justify-center col-span-2">
                      <span className="text-[9px] text-on-surface-variant">Completed Settlements</span>
                      <span className="text-slate-850 dark:text-white text-xs font-black mt-1">{mentor.activity.settlements} / 2</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Score Section */}
                {/* Score & Summary Section */}
                <div className="flex flex-col gap-4 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5 dark:from-indigo-500/10 dark:via-purple-500/10 dark:to-pink-500/5 border border-purple-500/20 p-5 rounded-3xl shadow-[inset_0_1px_1px_rgba(168,85,247,0.15)] relative">
                  {/* Subtle background glow */}
                  <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl" />
                  </div>
                  
                  <div className="flex items-center gap-4 relative z-20">
                    {/* Circular Score */}
                    <div className="relative flex-shrink-0 flex items-center justify-center w-16 h-16 rounded-full bg-white dark:bg-slate-900 shadow-inner border border-purple-500/20">
                      <svg className="absolute inset-0 -rotate-90 w-full h-full p-0.5 drop-shadow-md" viewBox="0 0 36 36">
                        <path
                          className="text-slate-100 dark:text-slate-800"
                          strokeWidth="3"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="text-purple-500 transition-all duration-1000 ease-out"
                          strokeDasharray={`${mentor?.score || 0}, 100`}
                          strokeWidth="3"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">{mentor?.score}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="flex items-center gap-1">
                          <h3 className="text-xs font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">Trust Score</h3>
                          <div className="relative group inline-block">
                            <span
                              className="material-symbols-outlined text-[11px] text-on-surface-variant/60 cursor-help select-none hover:text-purple-500 transition-colors focus:outline-none"
                              tabIndex="0"
                              aria-label="Trust Score Information"
                            >
                              info
                            </span>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-3 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md border border-slate-700/50 dark:border-white/10 rounded-xl text-[10px] text-slate-200 font-medium leading-normal shadow-xl pointer-events-none transition-all duration-200 ease-out origin-top scale-95 opacity-0 invisible group-hover:visible group-hover:opacity-100 group-hover:scale-100 z-50">
                              Trust Score reflects how reliably you handle shared money — how consistently you pay back what you owe, how often you front costs for the group, and how steady your spending is over time. It's reduced if any payment you claimed to make was disputed. The score updates automatically as you're more active.
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-900/95 dark:border-b-slate-950/95"></div>
                            </div>
                          </div>
                        </div>
                        {mentor?.scoreBand && (
                          <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border shadow-sm ${
                            mentor.scoreBand === 'Excellent' || mentor.scoreBand === 'Good'
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                              : mentor.scoreBand === 'New'
                              ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                              : mentor.scoreBand === 'Needs Attention'
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                              : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                          }`}>
                            {mentor.scoreBand}
                          </span>
                        )}
                      </div>
                      
                      {/* Score Trend Badge */}
                      {mentor?.scoreTrend && mentor.scoreTrend.delta !== 0 && (
                        <div className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-lg border mt-1.5 ${
                          mentor.scoreTrend.delta > 0
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-500 dark:text-rose-400'
                        }`}>
                          <span className="material-symbols-outlined text-[11px]">
                            {mentor.scoreTrend.delta > 0 ? 'trending_up' : 'trending_down'}
                          </span>
                          {mentor.scoreTrend.delta > 0 ? '↑' : '↓'} {Math.abs(mentor.scoreTrend.delta)} pts
                          {mentor.scoreTrend.daysAgo > 0 && (
                            <span className="opacity-60 font-normal"> · {mentor.scoreTrend.daysAgo}d ago</span>
                          )}
                        </div>
                      )}

                      {mentor?.settlementNote && (
                        <div className="inline-flex items-center gap-1.5 text-[8px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg mt-2">
                          <span className="material-symbols-outlined text-[11px]">info</span>
                          {mentor.settlementNote}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AI Explanation Box */}
                  <div className="relative mt-2 pt-5 border-t border-purple-500/20 z-10">
                    <span className="absolute -top-3 left-2 bg-slate-50 dark:bg-[#182237] px-2 text-[9px] font-black tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px] text-purple-500">auto_awesome</span> AI Insight
                    </span>
                    <p className="text-[11.5px] text-slate-700 dark:text-slate-300 font-medium leading-relaxed italic">
                      "{mentor?.explanation}"
                    </p>
                  </div>
                </div>



                {/* Behavioral Observations */}
                {mentor?.observations && mentor.observations.length > 0 && (
                  <div className="flex flex-col gap-3 mt-1">
                    <h4 className="text-[10px] font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-blue-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px] text-indigo-500">visibility</span> Behavioral Observations
                    </h4>
                    <div className="flex flex-col gap-2.5">
                      {mentor.observations.map((obs, idx) => (
                        <div key={idx} className="group flex gap-3 bg-gradient-to-br from-slate-50 to-white dark:from-white/[0.03] dark:to-white/[0.01] border border-slate-200 dark:border-white/10 p-3.5 rounded-2xl items-start shadow-sm hover:shadow-md hover:border-indigo-500/30 transition-all duration-300">
                          <div className="w-7 h-7 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-transform duration-300 border border-indigo-500/20">
                            <span className="material-symbols-outlined text-[14px] text-indigo-500 dark:text-indigo-400">analytics</span>
                          </div>
                          <p className="text-[11.5px] text-slate-700 dark:text-slate-300 font-medium leading-relaxed mt-0.5">{obs}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actionable Suggestions */}
                {mentor?.suggestions && mentor.suggestions.length > 0 && (
                  <div className="flex flex-col gap-3 mt-1">
                    <h4 className="text-[10px] font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px] text-emerald-500">lightbulb</span> Actionable Suggestions
                    </h4>
                    <div className="flex flex-col gap-2.5">
                      {mentor.suggestions.map((sug, idx) => (
                        <div key={idx} className="group flex gap-3 bg-gradient-to-br from-emerald-50/50 to-emerald-50/10 dark:from-emerald-500/10 dark:to-emerald-500/[0.02] border border-emerald-500/30 p-3.5 rounded-2xl items-start shadow-sm hover:shadow-md hover:border-emerald-500/50 hover:shadow-emerald-500/20 transition-all duration-300">
                          <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:bg-emerald-500/30 transition-transform duration-300 border border-emerald-500/20">
                            <span className="material-symbols-outlined text-[14px] text-emerald-600 dark:text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]">lightbulb</span>
                          </div>
                          <p className="text-[11.5px] text-emerald-900 dark:text-emerald-100 font-medium leading-relaxed mt-0.5">{sug}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="flex justify-between items-center text-[8px] text-on-surface-variant/70 font-bold uppercase tracking-wider border-t border-slate-200 dark:border-white/5 pt-3 mt-1">
                  <span>Cross-Group Analysis</span>
                  <span>Generated {mentor?.generatedAt ? new Date(mentor.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} {mentor?.generatedAt ? new Date(mentor.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
