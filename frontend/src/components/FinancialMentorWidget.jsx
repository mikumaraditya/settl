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
  const [unseen, setUnseen] = useState(false);

  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  // Check sessionStorage for 'settl_mentor_seen'
  useEffect(() => {
    if (user) {
      const seen = sessionStorage.getItem('settl_mentor_seen');
      if (!seen) {
        setUnseen(true);
      }
    }
  }, [user]);

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

  const fetchMentor = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get('/insights/mentor');
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
        className="fixed bottom-20 md:bottom-8 right-4 md:right-8 w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer z-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        aria-label="AI Financial Mentor"
      >
        {isOpen ? (
          <span className="material-symbols-outlined text-[20px] md:text-[24px]">close</span>
        ) : (
          <span className="material-symbols-outlined text-[20px] md:text-[24px]">psychology</span>
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
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-[16px] text-indigo-500 dark:text-indigo-400">psychology</span>
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-slate-800 dark:text-white">AI Financial Mentor</h2>
                <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider mt-0.5">Personalized Insights</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-on-surface-variant hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
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
                <div className="flex items-center gap-4 bg-gradient-to-br from-indigo-500/5 to-blue-500/5 dark:from-indigo-500/15 dark:to-blue-500/5 border border-indigo-500/10 dark:border-indigo-500/20 p-4 rounded-2xl">
                  {/* Circular Score */}
                  <div className="relative flex-shrink-0 flex items-center justify-center w-16 h-16 rounded-full bg-slate-50 dark:bg-white/[0.02] border-[3px] border-indigo-500/20">
                    <svg className="absolute inset-0 -rotate-90 w-full h-full p-0.5" viewBox="0 0 36 36">
                      <path
                        className="text-slate-100 dark:text-white/[0.02]"
                        strokeWidth="2.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-indigo-500 dark:text-indigo-400 transition-all duration-1000 ease-out"
                        strokeDasharray={`${mentor?.score || 0}, 100`}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="flex flex-col items-center">
                      <span className="text-lg font-black text-slate-800 dark:text-white">{mentor?.score}</span>
                      <span className="text-[7px] font-bold text-on-surface-variant uppercase tracking-wider">Score</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="text-xs font-extrabold text-slate-800 dark:text-white">Financial Health Score</h3>
                      {mentor?.scoreBand && (
                        <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${
                          mentor.scoreBand === 'Excellent' || mentor.scoreBand === 'Good'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : mentor.scoreBand === 'Needs Attention'
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                        }`}>
                          {mentor.scoreBand}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed mt-1">{mentor?.explanation}</p>
                    {mentor?.settlementNote && (
                      <div className="inline-flex items-center gap-1.5 text-[8px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg mt-2">
                        <span className="material-symbols-outlined text-[11px]">info</span>
                        {mentor.settlementNote}
                      </div>
                    )}
                  </div>
                </div>

                {/* What's Behind Your Score */}
                {mentor?.signalBreakdown && mentor.signalBreakdown.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">What's Behind Your Score</h4>
                    <div className="flex flex-col gap-2">
                      {mentor.signalBreakdown.map((sig) => (
                        <div
                          key={sig.key}
                          className={`border rounded-xl p-3 flex flex-col gap-1.5 transition-all ${
                            sig.isWeakest
                              ? 'bg-amber-500/[0.03] border-amber-500/20 shadow-[inset_0_1px_1px_rgba(245,158,11,0.05)]'
                              : 'bg-slate-50 dark:bg-white/[0.01] border-slate-200 dark:border-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-800 dark:text-white leading-none">{sig.label}</span>
                            <div className="flex items-center gap-1.5">
                              {sig.isWeakest && (
                                <span className="text-[7px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md leading-none">
                                  Biggest Opportunity
                                </span>
                              )}
                              <span className="text-[11px] font-black text-slate-800 dark:text-white leading-none">{sig.value}%</span>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          <div className="w-full bg-slate-200 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                sig.isWeakest ? 'bg-amber-500' : 'bg-indigo-500'
                              }`}
                              style={{ width: `${sig.value}%` }}
                            />
                          </div>

                          <p className="text-[9px] text-on-surface-variant/80 font-medium leading-relaxed">
                            {sig.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Behavioral Observations */}
                {mentor?.observations && mentor.observations.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">Behavioral Observations</h4>
                    <div className="flex flex-col gap-2">
                      {mentor.observations.map((obs, idx) => (
                        <div key={idx} className="flex gap-2.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-2.5 rounded-xl items-start">
                          <span className="material-symbols-outlined text-[14px] text-indigo-500 dark:text-indigo-400 mt-0.5 flex-shrink-0">analytics</span>
                          <p className="text-[11px] text-on-surface-variant font-medium leading-relaxed">{obs}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actionable Suggestions */}
                {mentor?.suggestions && mentor.suggestions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">Actionable Suggestions</h4>
                    <div className="flex flex-col gap-2">
                      {mentor.suggestions.map((sug, idx) => (
                        <div key={idx} className="flex gap-2.5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-2.5 rounded-xl items-start">
                          <span className="material-symbols-outlined text-[14px] text-emerald-500 dark:text-emerald-400 mt-0.5 flex-shrink-0">lightbulb</span>
                          <p className="text-[11px] text-on-surface-variant font-medium leading-relaxed">{sug}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="flex justify-between items-center text-[8px] text-on-surface-variant/70 font-bold uppercase tracking-wider border-t border-slate-200 dark:border-white/5 pt-3 mt-1">
                  <span>Cross-Group Analysis</span>
                  <span>Generated {mentor?.generatedAt ? new Date(mentor.generatedAt).toLocaleDateString() : ''} {mentor?.generatedAt ? new Date(mentor.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
