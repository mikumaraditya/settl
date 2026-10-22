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

  const [activeHistoryTab, setActiveHistoryTab] = useState('factors'); // 'factors', 'commitments', 'history'

  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const chatRef = useRef(null);
  const previousFocusRef = useRef(null);

  const getScoreBandStyle = (band) => {
    switch (band) {
      case 'Excellent':
        return {
          badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
          ring: 'border-emerald-500',
          gradient: 'from-emerald-500 to-teal-600',
          icon: 'verified',
        };
      case 'Good':
        return {
          badge: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400',
          ring: 'border-indigo-500',
          gradient: 'from-indigo-500 to-violet-600',
          icon: 'thumb_up',
        };
      case 'Needs Attention':
        return {
          badge: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
          ring: 'border-amber-500',
          gradient: 'from-amber-500 to-orange-600',
          icon: 'warning',
        };
      case 'At Risk':
        return {
          badge: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
          ring: 'border-rose-500',
          gradient: 'from-rose-500 to-red-600',
          icon: 'report',
        };
      default:
        return {
          badge: 'bg-violet-500/15 border-violet-500/30 text-violet-400',
          ring: 'border-violet-500',
          gradient: 'from-indigo-600 to-violet-600',
          icon: 'hourglass_top',
        };
    }
  };

  const handleQuickAction = (actionType) => {
    if (actionType === 'explain') {
      setActiveTab('chat');
      setTimeout(() => {
        chatRef.current?.sendMessage(
          `Can you explain my current Trust Score of ${mentor?.score ?? 'N/A'}/100 in the '${mentor?.scoreBand || 'New'}' category and what factors contributed to it?`
        );
      }, 100);
    } else if (actionType === 'settle') {
      setActiveTab('chat');
      setTimeout(() => {
        chatRef.current?.sendMessage(
          `Help me plan my settlements: what are my pending or overdue commitments, and how should I prioritize clearing them?`
        );
      }, 100);
    } else if (actionType === 'history') {
      setActiveHistoryTab('history');
    }
  };

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
    ? '720px'
    : isTablet
    ? '440px'
    : '480px';

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
            height: isMobile ? 'calc(100% - 44px)' : '640px',
            maxHeight: isMobile ? 'calc(100% - 44px)' : 'calc(100vh - 100px)',
          }}
          className={`fixed z-50 mentor-glass-panel bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-white/10 shadow-2xl shadow-indigo-950/40 overflow-hidden flex flex-col transition-[width,height,max-width,max-height,inset] duration-300 ease-in-out ${
            isMobile
              ? 'inset-x-0 bottom-0 top-11 rounded-t-3xl border-b-0'
              : 'bottom-24 right-4 md:right-8 rounded-3xl'
          }`}
        >
          {/* Mobile Drag Indicator Bar */}
          {isMobile && (
            <div className="pt-2 pb-0.5 flex justify-center items-center w-full bg-slate-50/95 dark:bg-[#0f172a]/95">
              <div className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
            </div>
          )}

          {/* Single Consolidated Header Bar */}
          <div className="px-4 pt-3 pb-3 border-b border-slate-200 dark:border-white/10 bg-slate-50/95 dark:bg-[#0f172a]/95 backdrop-blur-md flex flex-col gap-2.5">
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
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 flex flex-col gap-4 text-slate-800 dark:text-slate-100">
              {/* Header Score Card */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <span className="material-symbols-outlined text-[32px] text-indigo-500 animate-spin">sync</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Analyzing your cross-group activity...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 rounded-2xl p-4 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">error</span>
                    <span>{error}</span>
                  </div>
                  <button
                    onClick={() => fetchMentor(true)}
                    className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg text-rose-400 font-bold transition-colors cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              ) : mentor?.status === 'not_enough_data' || mentor?.status === 'new' ? (
                /* New / Ineligible State */
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col items-center text-center p-5 gap-3 bg-white dark:bg-[#131c31] rounded-2xl border border-slate-200 dark:border-white/10 shadow-xs">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 dark:text-indigo-400">
                      <span className="material-symbols-outlined text-[26px]">hourglass_top</span>
                    </div>
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-[10px] font-extrabold uppercase tracking-wider mb-1">
                        Building History
                      </div>
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {mentor?.status === 'new' ? 'Building Your Trust Score' : 'Join a Group to Unlock Score'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
                        {mentor?.explanation || mentor?.reason}
                      </p>
                    </div>

                    {/* Progress indicators towards eligibility */}
                    {mentor?.status === 'new' && mentor?.activity && (
                      <div className="w-full bg-slate-50 dark:bg-white/[0.02] p-3 rounded-xl border border-slate-200/80 dark:border-white/5 flex flex-col gap-2.5 text-left text-xs mt-1">
                        <div>
                          <div className="flex justify-between font-semibold text-[11px] mb-1">
                            <span className="text-slate-600 dark:text-slate-300">Shared Expenses</span>
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                              {mentor.activity.expenses || 0} / 3 needed
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, ((mentor.activity.expenses || 0) / 3) * 100)}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between font-semibold text-[11px] mb-1">
                            <span className="text-slate-600 dark:text-slate-300">Active Months</span>
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                              {mentor.activity.activeMonths || 0} / 2 needed
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, ((mentor.activity.activeMonths || 0) / 2) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Eligible Score View */
                <div className="flex flex-col gap-4">
                  {/* Primary Score Banner */}
                  {(() => {
                    const style = getScoreBandStyle(mentor?.scoreBand);
                    return (
                      <div className="bg-white dark:bg-[#131c31] border border-slate-200 dark:border-white/10 rounded-2xl p-4 sm:p-5 shadow-xs relative overflow-hidden">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3.5">
                            {/* Score Gauge Circle */}
                            <div className="relative flex-shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500/10 via-violet-500/10 to-indigo-500/5 border border-indigo-500/25 shadow-inner">
                              <span className="text-2xl font-black text-slate-900 dark:text-white leading-none">
                                {mentor?.score}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 leading-none mt-0.5">
                                /100
                              </span>
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${style.badge}`}>
                                  <span className="material-symbols-outlined text-[12px]">{style.icon}</span>
                                  {mentor?.scoreBand}
                                </span>

                                {/* Score trend pill */}
                                {mentor?.scoreTrend && (
                                  <span
                                    className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                      mentor.scoreTrend.delta > 0
                                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                        : mentor.scoreTrend.delta < 0
                                        ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                        : 'bg-slate-200/60 dark:bg-white/5 text-slate-500 border-slate-300/40 dark:border-white/5'
                                    }`}
                                    title={`Compared to previous score of ${mentor.scoreTrend.previousScore}`}
                                  >
                                    <span className="material-symbols-outlined text-[12px]">
                                      {mentor.scoreTrend.delta > 0 ? 'trending_up' : mentor.scoreTrend.delta < 0 ? 'trending_down' : 'trending_flat'}
                                    </span>
                                    {mentor.scoreTrend.delta > 0 ? `+${mentor.scoreTrend.delta}` : mentor.scoreTrend.delta} pts
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed mt-1.5">
                                {mentor?.scoreBandSummary || mentor?.explanation}
                              </p>
                            </div>
                          </div>

                          {/* Quick Refresh Icon */}
                          <button
                            onClick={() => fetchMentor(true)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer flex-shrink-0 self-start"
                            title="Recalculate score"
                            aria-label="Refresh Trust Score"
                          >
                            <span className="material-symbols-outlined text-[16px]">refresh</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Contextual Action Pills */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleQuickAction('explain')}
                      className="flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl bg-white dark:bg-[#131c31] hover:bg-indigo-50 dark:hover:bg-indigo-950/30 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 transition-all cursor-pointer shadow-xs group"
                    >
                      <span className="material-symbols-outlined text-[18px] text-indigo-500 group-hover:scale-110 transition-transform">chat</span>
                      <span className="text-[10.5px] font-bold">Explain Score</span>
                    </button>
                    <button
                      onClick={() => handleQuickAction('settle')}
                      className="flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl bg-white dark:bg-[#131c31] hover:bg-indigo-50 dark:hover:bg-indigo-950/30 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 transition-all cursor-pointer shadow-xs group"
                    >
                      <span className="material-symbols-outlined text-[18px] text-indigo-500 group-hover:scale-110 transition-transform">bolt</span>
                      <span className="text-[10.5px] font-bold">Settle Guide</span>
                    </button>
                    <button
                      onClick={() => handleQuickAction('history')}
                      className={`flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border transition-all cursor-pointer shadow-xs group ${
                        activeHistoryTab === 'history'
                          ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-600 dark:text-indigo-400'
                          : 'bg-white dark:bg-[#131c31] hover:bg-indigo-50 dark:hover:bg-indigo-950/30 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px] text-indigo-500 group-hover:scale-110 transition-transform">history</span>
                      <span className="text-[10.5px] font-bold">Score Ledger</span>
                    </button>
                  </div>

                  {/* Sub-Navigation Tabs */}
                  <div className="flex items-center bg-slate-200/50 dark:bg-white/5 p-1 rounded-xl text-[10.5px] font-bold">
                    <button
                      onClick={() => setActiveHistoryTab('factors')}
                      className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                        activeHistoryTab === 'factors'
                          ? 'bg-white dark:bg-[#131c31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Factors &amp; Signals
                    </button>
                    <button
                      onClick={() => setActiveHistoryTab('commitments')}
                      className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        activeHistoryTab === 'commitments'
                          ? 'bg-white dark:bg-[#131c31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Commitments
                      {mentor?.pendingCommitments?.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-500 text-white font-bold">
                          {mentor.pendingCommitments.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveHistoryTab('history')}
                      className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                        activeHistoryTab === 'history'
                          ? 'bg-white dark:bg-[#131c31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Score Ledger
                    </button>
                  </div>

                  {/* Sub-Tab 1: Factors Breakdown */}
                  {activeHistoryTab === 'factors' && (
                    <div className="flex flex-col gap-3">
                      {mentor?.signalBreakdown && mentor.signalBreakdown.length > 0 ? (
                        <div className="flex flex-col gap-2.5">
                          {mentor.signalBreakdown.map((sig, idx) => {
                            const isDispute = sig.key === 'reliabilityIncidents';
                            const val = sig.value;
                            const barColor = isDispute
                              ? sig.penaltyApplied > 0
                                ? 'bg-rose-500'
                                : 'bg-emerald-500'
                              : val >= 80
                              ? 'bg-emerald-500'
                              : val >= 60
                              ? 'bg-indigo-500'
                              : val >= 40
                              ? 'bg-amber-500'
                              : 'bg-rose-500';

                            return (
                              <div
                                key={idx}
                                className="bg-white dark:bg-[#131c31] p-3 rounded-xl border border-slate-200 dark:border-white/10 shadow-xs flex flex-col gap-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                                      {sig.label}
                                    </span>
                                    {sig.weight && (
                                      <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/5 px-1.5 py-0.2 rounded">
                                        {Math.round(sig.weight * 100)}% wt
                                      </span>
                                    )}
                                    {sig.isWeakest && (
                                      <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded">
                                        Area to improve
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs font-extrabold text-slate-900 dark:text-white tabular-nums">
                                    {isDispute && sig.penaltyApplied > 0 ? `-${sig.penaltyApplied} pts` : `${val}/100`}
                                  </span>
                                </div>

                                <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${barColor} rounded-full transition-all duration-300`}
                                    style={{ width: `${Math.min(100, val)}%` }}
                                  />
                                </div>

                                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                                  {sig.description}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
                          No factor breakdown available yet.
                        </div>
                      )}

                      {/* Plain-Language Why Facts */}
                      {mentor?.whyFacts && mentor.whyFacts.length > 0 && (
                        <div className="mt-1 bg-white dark:bg-[#131c31] p-3 rounded-xl border border-slate-200 dark:border-white/10 shadow-xs flex flex-col gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px] text-indigo-500">fact_check</span>
                            Key Activity Observations
                          </span>
                          <div className="space-y-1.5">
                            {mentor.whyFacts.map((fact, fIdx) => (
                              <div key={fIdx} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                                <span className={`material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5 ${
                                  fact.sentiment === 'good' ? 'text-emerald-500' : fact.sentiment === 'warning' ? 'text-amber-500' : 'text-slate-400'
                                }`}>
                                  {fact.icon}
                                </span>
                                <span className="leading-tight">{fact.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-Tab 2: Commitments */}
                  {activeHistoryTab === 'commitments' && (
                    <div className="flex flex-col gap-2.5">
                      {mentor?.pendingCommitments && mentor.pendingCommitments.length > 0 ? (
                        mentor.pendingCommitments.map((c, cIdx) => (
                          <div
                            key={cIdx}
                            className="bg-white dark:bg-[#131c31] p-3.5 rounded-xl border border-slate-200 dark:border-white/10 shadow-xs flex flex-col gap-2"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">
                                  {c.direction === 'outgoing' ? 'Payment to' : 'Payment from'}
                                </span>
                                <span className="text-xs font-bold text-slate-900 dark:text-white">
                                  {c.counterpartName}
                                </span>
                              </div>
                              <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                                ₹{Number(c.amount).toLocaleString('en-IN')}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-white/5 text-[10.5px]">
                              <span className="text-slate-400 dark:text-slate-500 truncate max-w-[160px]">
                                {c.groupName}
                              </span>
                              <span className={`font-semibold px-2 py-0.5 rounded ${
                                c.isOverdue
                                  ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                  : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                              }`}>
                                {c.isOverdue ? `Overdue · ${c.ageDays}d old` : `Pending · ${c.ageDays}d old`}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="bg-white dark:bg-[#131c31] p-6 rounded-xl border border-slate-200 dark:border-white/10 shadow-xs flex flex-col items-center text-center gap-2">
                          <span className="material-symbols-outlined text-[28px] text-emerald-500">task_alt</span>
                          <span className="text-xs font-bold text-slate-800 dark:text-white">All Caught Up!</span>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            You have no pending or overdue settlement commitments across your groups.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-Tab 3: Score Ledger */}
                  {activeHistoryTab === 'history' && (
                    <div className="flex flex-col gap-2.5">
                      {mentor?.recentHistory && mentor.recentHistory.length > 0 ? (
                        <div className="bg-white dark:bg-[#131c31] p-3.5 rounded-xl border border-slate-200 dark:border-white/10 shadow-xs flex flex-col gap-3">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px] text-indigo-500">history_edu</span>
                            Score Change Ledger
                          </span>
                          <div className="relative pl-3 border-l-2 border-indigo-500/20 space-y-3">
                            {mentor.recentHistory.map((h, hIdx) => (
                              <div key={hIdx} className="relative flex flex-col gap-0.5 text-xs">
                                <span className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-[#131c31]" />
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {new Date(h.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                    h.delta > 0
                                      ? 'text-emerald-500 bg-emerald-500/10'
                                      : h.delta < 0
                                      ? 'text-rose-500 bg-rose-500/10'
                                      : 'text-slate-400 bg-slate-100 dark:bg-white/5'
                                  }`}>
                                    {h.delta > 0 ? `+${h.delta}` : h.delta} pts · Score {h.score}
                                  </span>
                                </div>
                                <span className="text-slate-700 dark:text-slate-300 font-medium leading-snug">
                                  {h.reason}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white dark:bg-[#131c31] p-6 rounded-xl border border-slate-200 dark:border-white/10 shadow-xs flex flex-col items-center text-center gap-2">
                          <span className="material-symbols-outlined text-[28px] text-slate-400">history</span>
                          <span className="text-xs font-bold text-slate-800 dark:text-white">Initial Baseline Recorded</span>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Subsequent payment milestones and settlement events will be logged in this ledger.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Next Milestone Card */}
                  {mentor?.nextTarget && (
                    <div className="bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-indigo-500/5 border border-indigo-500/25 p-3.5 sm:p-4 rounded-xl flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">track_changes</span>
                          Next Milestone
                        </span>
                        <span className="text-xs font-black text-slate-900 dark:text-white">
                          Target {mentor.nextTarget.targetScore} / 100
                        </span>
                      </div>
                      <div className="space-y-1">
                        {mentor.nextTarget.actions.map((act, aIdx) => (
                          <div key={aIdx} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                            <span className="material-symbols-outlined text-[14px] text-indigo-500 mt-0.5">check_small</span>
                            <span className="leading-tight">{act}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
