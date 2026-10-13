import { useState, useEffect, useRef } from 'react';
import axios from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { MENTOR_NAME } from '../constants/mentor';
import MentorChat from './MentorChat';
import MentorOnboardingModal from './MentorOnboardingModal';

export default function FinancialMentorWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'report'
  const [mentor, setMentor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasFetched, setHasFetched] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      return localStorage.getItem('settl_mentor_panel_expanded') === 'true';
    } catch {
      return false;
    }
  });

  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const chatRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Check window size for mobile sheet vs tablet vs desktop panel
  useEffect(() => {
    const checkViewport = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
      setIsTablet(w >= 768 && w < 1024);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Handle body scroll lock & focus management for mobile modal sheet
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;

      if (isMobile) {
        document.body.style.overflow = 'hidden';
      }

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsOpen(false);
        } else if (e.key === 'Tab' && isMobile && panelRef.current) {
          const focusables = panelRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        if (isMobile) {
          document.body.style.overflow = '';
        }
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
          previousFocusRef.current.focus();
        }
      };
    }
  }, [isOpen, isMobile]);

  // Click outside listener for desktop non-modal panel
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        !isMobile &&
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen && !isMobile) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isMobile]);

  // Click outside listener for overflow menu
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const toggleOpen = () => {
    setIsOpen((prev) => !prev);
  };

  const toggleExpand = () => {
    setIsExpanded((prev) => {
      const nextState = !prev;
      try {
        localStorage.setItem('settl_mentor_panel_expanded', String(nextState));
      } catch {
        // ignore localStorage write errors
      }
      return nextState;
    });
  };

  const handleSwitchTab = (tab) => {
    setActiveTab(tab);
    if (tab === 'report' && !hasFetched) {
      fetchMentor();
    }
  };

  const fetchMentor = async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const url = force ? '/insights/mentor?bypassCache=true' : '/insights/mentor';
      const { data } = await axios.get(url);

      setMentor(data);
      setHasFetched(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Your mentor report is unavailable right now.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  // Determine panel width variable based on breakpoint and expansion state
  const panelWidth = isMobile
    ? '100%'
    : isExpanded
    ? '640px'
    : isTablet
    ? '420px'
    : '460px';

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className="fixed bottom-20 md:bottom-8 right-4 md:right-8 w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:shadow-[0_0_45px_rgba(124,58,237,0.7)] hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer z-50 focus:outline-none ring-4 ring-indigo-500/20 hover:ring-indigo-500/40 group"
        aria-label={`Open ${MENTOR_NAME} AI Financial Mentor`}
        title={`Ask ${MENTOR_NAME}`}
      >
        <span className="absolute inset-0 rounded-full bg-indigo-500/30 animate-pulse-ring pointer-events-none" />

        {isOpen ? (
          <span className="material-symbols-outlined text-[24px] md:text-[28px]">close</span>
        ) : (
          <span className="text-xl md:text-2xl font-black font-sans tracking-tight group-hover:scale-110 transition-transform">
            F
          </span>
        )}

        <span className="hidden md:group-hover:block absolute right-20 bg-slate-900 text-white text-xs font-semibold px-2.5 py-1 rounded-lg shadow-md whitespace-nowrap pointer-events-none border border-white/10 animate-in fade-in duration-150">
          Ask {MENTOR_NAME}
        </span>
      </button>

      {/* Floating Panel (Desktop/Tablet Panel or Mobile Bottom Sheet) */}
      {isOpen && (
        <div
          ref={panelRef}
          role={isMobile ? 'dialog' : undefined}
          aria-modal={isMobile ? 'true' : undefined}
          aria-labelledby="mentor-widget-title"
          style={{
            '--mentor-panel-width': panelWidth,
            width: isMobile ? '100%' : 'var(--mentor-panel-width)',
            maxWidth: isMobile ? '100%' : 'calc(100vw - 48px)',
            height: isMobile ? 'calc(100% - 48px)' : '600px',
            maxHeight: isMobile ? 'calc(100% - 48px)' : 'calc(100vh - 120px)',
          }}
          className={`fixed z-50 mentor-glass-panel bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 shadow-2xl shadow-slate-900/20 dark:shadow-black/70 overflow-hidden flex flex-col transition-[width,height,max-width,max-height,inset] duration-300 ease-in-out ${
            isMobile
              ? 'inset-x-0 bottom-0 top-12 rounded-t-3xl border-b-0'
              : 'bottom-24 right-4 md:right-8 rounded-3xl'
          }`}
        >
          {/* Single Consolidated Header Bar */}
          <div className="px-4 pt-3.5 pb-3 border-b border-slate-200 dark:border-white/10 bg-slate-50/90 dark:bg-[#0f172a]/90 backdrop-blur-md flex flex-col gap-3">
            {/* Row 1: Title, Avatar, Expand Toggle, Overflow Menu, Single Close Button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 font-black text-sm">
                    F
                  </div>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#0f172a] bg-emerald-500"
                    title="Live Financial Guidance"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 id="mentor-widget-title" className="text-xs font-black text-slate-900 dark:text-white tracking-tight">
                      {MENTOR_NAME}
                    </h2>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                      AI Mentor
                    </span>
                  </div>
                  <p className="text-[9.5px] text-slate-500 dark:text-slate-400 font-medium">
                    Live Financial Guidance
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 relative" ref={menuRef}>
                {/* Desktop-only Expand/Collapse Button */}
                <button
                  onClick={toggleExpand}
                  className="hidden md:flex p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer items-center justify-center"
                  title={isExpanded ? 'Collapse panel' : 'Expand panel'}
                  aria-label={isExpanded ? 'Collapse mentor panel' : 'Expand mentor panel'}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isExpanded ? 'close_fullscreen' : 'open_in_full'}
                  </span>
                </button>

                {/* 3-dots Overflow Menu */}
                <button
                  onClick={() => setShowMenu((prev) => !prev)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer flex items-center justify-center"
                  title="Menu Options"
                  aria-label="Mentor options menu"
                >
                  <span className="material-symbols-outlined text-[18px]">more_vert</span>
                </button>

                {/* Single Close Button */}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer flex items-center justify-center"
                  aria-label="Close mentor panel"
                  title="Close"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>

                {/* Dropdown Menu Items */}
                {showMenu && (
                  <div className="absolute right-0 top-10 z-50 w-56 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 shadow-xl py-1.5 text-xs animate-in fade-in duration-150">
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowOnboarding(true);
                      }}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-indigo-500/10 text-slate-800 dark:text-slate-200 font-medium transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px] text-indigo-500">tune</span>
                      Personalize {MENTOR_NAME}
                    </button>

                    <button
                      onClick={() => {
                        setShowMenu(false);
                        chatRef.current?.handleClearHistory();
                      }}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-rose-500/10 text-slate-800 dark:text-slate-200 font-medium transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px] text-rose-500">delete_sweep</span>
                      Clear History
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Tabs in a row under the Finn title */}
            <div className="flex items-center bg-slate-200/60 dark:bg-white/5 p-1 rounded-xl border border-slate-300/40 dark:border-white/5 text-[11px] font-semibold">
              <button
                onClick={() => handleSwitchTab('chat')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'chat'
                    ? 'bg-white dark:bg-[#1e293b] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">chat</span>
                Chat
              </button>
              <button
                onClick={() => handleSwitchTab('report')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'report'
                    ? 'bg-white dark:bg-[#1e293b] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">analytics</span>
                Trust Score
              </button>
            </div>
          </div>

          {/* TAB 1: Chat Panel */}
          {activeTab === 'chat' ? (
            <div className="flex-1 overflow-hidden flex flex-col">
              <MentorChat
                ref={chatRef}
                isMobileSheet={isMobile}
                onClosePanel={() => setIsOpen(false)}
              />
            </div>
          ) : (
            /* TAB 2: Trust Score Report */
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-5">
              <div
                onClick={() => handleSwitchTab('chat')}
                className="group cursor-pointer bg-gradient-to-r from-indigo-500/10 to-violet-500/10 hover:from-indigo-500/20 hover:to-violet-500/20 border border-indigo-500/25 p-3 rounded-2xl flex items-center justify-between transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-[13px] font-black">
                    F
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-slate-900 dark:text-white">Ask {MENTOR_NAME} anything</h4>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400">Discuss your score, SIPs, debts, &amp; advice</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-[16px] text-indigo-500 group-hover:translate-x-0.5 transition-transform">
                  arrow_forward
                </span>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <span className="material-symbols-outlined text-[32px] text-indigo-400 animate-spin">sync</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Analyzing your cross-group activity...</p>
                </div>
              ) : error ? (
                <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl px-4 py-3 text-xs font-semibold">
                  <span className="material-symbols-outlined text-[16px] flex-shrink-0 mt-0.5">error</span>
                  <span className="leading-relaxed">{error}</span>
                </div>
              ) : mentor?.status === 'not_enough_data' || mentor?.status === 'new' ? (
                <div className="flex flex-col items-center text-center py-4 px-2 gap-3 bg-slate-50 dark:bg-white/[0.01] rounded-2xl border border-slate-200 dark:border-white/5">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 dark:text-amber-400">
                    <span className="material-symbols-outlined text-[24px]">analytics</span>
                  </div>
                  <h3 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">
                    {mentor?.status === 'new' ? 'Building Your Trust Score' : 'Not Enough Activity Yet'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{mentor.reason || mentor.explanation}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4 bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-indigo-500/5 border border-indigo-500/20 p-5 rounded-3xl relative">
                    <div className="flex items-center gap-4 relative z-20">
                      <div className="relative flex-shrink-0 flex items-center justify-center w-16 h-16 rounded-full bg-white dark:bg-slate-900 shadow-inner border border-indigo-500/20">
                        <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                          {mentor?.score}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                          Trust Score ({mentor?.scoreBand})
                        </h3>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{mentor?.explanation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <MentorOnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </>
  );
}
