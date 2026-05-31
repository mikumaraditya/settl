import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useNotifications } from '../context/NotificationContext'
import axios from '../api/axios'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications()

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [now]               = useState(() => Date.now())
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [activeGroupId, setActiveGroupId] = useState(() => localStorage.getItem('settl_active_group_id'))
  const [showGroupSelector, setShowGroupSelector] = useState(false)
  const [groups, setGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(false)

  const dropdownRef = useRef(null)
  const mobileDropdownRef = useRef(null)
  const bellRef = useRef(null)
  const mobileBellRef = useRef(null)
  const groupSelectorRef = useRef(null)
  const mobileGroupSelectorRef = useRef(null)

  const timeAgo = (ms) => {
    const diff = now - ms
    if (diff < 60000)  return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e) => {
      const clickedOutsideDropdown = (!dropdownRef.current || !dropdownRef.current.contains(e.target)) &&
                                     (!mobileDropdownRef.current || !mobileDropdownRef.current.contains(e.target))
      if (clickedOutsideDropdown) setDropdownOpen(false)

      const clickedOutsideBell = (!bellRef.current || !bellRef.current.contains(e.target)) &&
                                 (!mobileBellRef.current || !mobileBellRef.current.contains(e.target))
      if (clickedOutsideBell) setBellOpen(false)

      const clickedOutsideGroupSelector = (!groupSelectorRef.current || !groupSelectorRef.current.contains(e.target)) &&
                                          (!mobileGroupSelectorRef.current || !mobileGroupSelectorRef.current.contains(e.target))
      if (clickedOutsideGroupSelector) setShowGroupSelector(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Dynamically remember the active/last visited group ID for navigation shortcut
  useEffect(() => {
    const match = location.pathname.match(/\/(group|settle)\/([a-fA-F0-9]{24})/)
    if (match && match[2]) {
      localStorage.setItem('settl_active_group_id', match[2])
      setTimeout(() => setActiveGroupId(match[2]), 0)
    }
  }, [location.pathname])

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
      localStorage.setItem('theme', 'light')
      setIsDark(false)
    } else {
      document.documentElement.classList.remove('light')
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
      setIsDark(true)
    }
  }

  const handleLogout = () => {
    setDropdownOpen(false)
    setBellOpen(false)
    logout()
    navigate('/login')
  }

  const isDashboard = location.pathname === '/dashboard'
  const isGroupPage = location.pathname.startsWith('/group/')
  const isSettlePage = location.pathname.startsWith('/settle/')
  const isProfile = location.pathname === '/profile'

  // Dynamic link path for active group shortcut
  const activeGroupPath = activeGroupId ? `/group/${activeGroupId}` : '/dashboard'

  const handleGroupClick = async () => {
    if (showGroupSelector) {
      setShowGroupSelector(false)
      return
    }
    setLoadingGroups(true)
    try {
      const { data } = await axios.get('/groups')
      setGroups(data)
      if (data.length === 0) {
        navigate('/dashboard')
      } else if (data.length === 1) {
        navigate(`/group/${data[0]._id}`)
      } else {
        setShowGroupSelector(true)
        setBellOpen(false)
        setDropdownOpen(false)
      }
    } catch (err) {
      console.error('Failed to fetch groups', err)
      navigate(activeGroupPath)
    } finally {
      setLoadingGroups(false)
    }
  }

  const renderGroupSelectorList = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
        <p className="text-xs font-bold text-white uppercase tracking-wider">Select Group</p>
        <button onClick={() => setShowGroupSelector(false)} className="text-[10px] text-slate-400 hover:text-[#f87171] transition-colors cursor-pointer font-bold uppercase tracking-wider">Close</button>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1 custom-scrollbar max-h-[300px]">
        {groups.map(g => (
          <button
            key={g._id}
            onClick={() => {
              setShowGroupSelector(false)
              navigate(`/group/${g._id}`)
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5 last:border-0"
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-secondary/10 border border-secondary/20">
              <span className="material-symbols-outlined text-[16px] text-secondary">group</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{g.name}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{g.members?.length || 0} members</p>
            </div>
            <span className="material-symbols-outlined text-[16px] text-slate-500">chevron_right</span>
          </button>
        ))}
      </div>
    </>
  )

  // Render notification list content
  const renderNotificationList = () => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
        <p className="text-xs font-bold text-white uppercase tracking-wider">Notifications</p>
        {notifications.length > 0 && (
          <button onClick={clearAll} className="text-[10px] text-slate-400 hover:text-[#f87171] transition-colors cursor-pointer font-bold uppercase tracking-wider">Clear all</button>
        )}
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1 custom-scrollbar">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white/5 border border-white/5">
              <span className="material-symbols-outlined text-2xl text-slate-500">notifications_off</span>
            </div>
            <p className="text-xs font-semibold text-slate-400">No notifications yet</p>
          </div>
        ) : (
          notifications.map(n => (
            <button
              key={n.id}
              onClick={() => {
                markRead(n.id)
                setBellOpen(false)
                if (n.groupId) navigate(`/group/${n.groupId}`)
              }}
              className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5 last:border-0 relative"
              style={{ backgroundColor: n.read ? 'transparent' : 'rgba(37,99,235,0.06)' }}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ backgroundColor: `${n.color}15`, border: `1px solid ${n.color}25` }}>
                <span className="material-symbols-outlined text-[16px]" style={{ color: n.color, fontVariationSettings: "'FILL' 1" }}>{n.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white leading-snug">{n.title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{n.body}</p>
                <p className="text-[10px] text-slate-500 mt-1.5">{timeAgo(n.time)}</p>
              </div>
              {!n.read && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: n.color }} />
              )}
            </button>
          ))
        )}
      </div>
    </>
  )

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────────────────────
          MOBILE LAYOUT: Sticky Top Header & Bottom Thumb Navigation Dock
          ───────────────────────────────────────────────────────────────────────────── */}
      <div className="md:hidden">
        {/* Mobile Top Header */}
        <header className="fixed top-0 left-0 right-0 h-14 bg-white/80 dark:bg-[#0a0f1d]/80 backdrop-blur-lg border-b border-white/5 flex items-center justify-between px-4 z-40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-secondary/10 flex items-center justify-center border border-secondary/20">
              <span className="material-symbols-outlined text-secondary text-[16px]">account_balance_wallet</span>
            </div>
            <Link to="/dashboard" className="text-base font-extrabold text-white tracking-tight flex items-center gap-1 leading-none">
              <span>Settl</span><span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-lg flex items-center justify-center border border-white/5 text-slate-400 hover:text-white transition-all active:scale-95 cursor-pointer"
              aria-label="Toggle dark mode"
            >
              <span className="material-symbols-outlined text-[18px]">
                {isDark ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            {/* Avatar Dropdown */}
            <div ref={mobileDropdownRef} className="relative">
              <button
                onClick={() => { setDropdownOpen(p => !p); setBellOpen(false) }}
                className="w-9 h-9 rounded-lg bg-secondary/10 text-secondary border border-secondary/20 flex items-center justify-center font-bold text-xs shadow-sm active:scale-95 transition-transform cursor-pointer"
              >
                {user?.name?.charAt(0).toUpperCase()}
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150 glass-card !bg-white dark:!bg-[#0a0f1d] border border-white/10">
                  <div className="px-3 py-2 border-b border-white/5">
                    <p className="text-[10px] font-bold text-white truncate">{user?.name}</p>
                    <p className="text-[9px] text-slate-400 truncate mt-0.5">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#f87171] hover:bg-[#f87171]/10 transition-colors cursor-pointer text-left"
                  >
                    <span className="material-symbols-outlined text-[14px]">logout</span>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Bottom Thumb Navigation Bar */}
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white/90 dark:bg-[#0a0f1d]/90 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-2 z-40 shadow-[0_-8px_30px_rgba(0,0,0,0.4)] pb-safe">
          {/* Dashboard */}
          <Link
            to="/dashboard"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1.5 gap-0.5 active:scale-90 transition-transform ${
              isDashboard ? 'text-secondary' : 'text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" style={isDashboard ? { fontVariationSettings: "'FILL' 1" } : {}}>
              dashboard
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider">Dashboard</span>
          </Link>

          {/* Active Group Shortcut */}
          <button
            onClick={handleGroupClick}
            disabled={loadingGroups}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1.5 gap-0.5 active:scale-90 transition-transform cursor-pointer ${
              (isGroupPage || isSettlePage || showGroupSelector) ? 'text-secondary' : 'text-slate-400'
            }`}
          >
            {loadingGroups ? (
              <span className="material-symbols-outlined text-[20px] animate-spin">sync</span>
            ) : (
              <span className="material-symbols-outlined text-[20px]" style={(isGroupPage || isSettlePage) ? { fontVariationSettings: "'FILL' 1" } : {}}>
                group
              </span>
            )}
            <span className="text-[9px] font-bold uppercase tracking-wider">Group</span>
          </button>

          {/* Activity / Notifications Bell */}
          <button
            onClick={() => { setBellOpen(p => !p); setDropdownOpen(false); if (!bellOpen) markAllRead() }}
            className={`relative flex flex-col items-center justify-center flex-1 h-full py-1.5 gap-0.5 active:scale-90 transition-transform cursor-pointer ${
              bellOpen ? 'text-secondary' : 'text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" style={unreadCount > 0 || bellOpen ? { fontVariationSettings: "'FILL' 1" } : {}}>
              notifications
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider">Activity</span>
            {unreadCount > 0 && (
              <span className="absolute top-2.5 right-6 w-2.5 h-2.5 rounded-full bg-[#f87171] border border-white dark:border-[#0a0f1d] animate-pulse-glow" />
            )}
          </button>

          {/* Profile */}
          <Link
            to="/profile"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1.5 gap-0.5 active:scale-90 transition-transform ${
              isProfile ? 'text-secondary' : 'text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" style={isProfile ? { fontVariationSettings: "'FILL' 1" } : {}}>
              person
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider">Profile</span>
          </Link>
        </nav>

        {/* Mobile Notification Sheet Slide-up Overlay */}
        {bellOpen && (
          <div ref={mobileBellRef} className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setBellOpen(false)} />
            
            {/* Bottom Sheet Card */}
            <div className="relative w-full max-w-lg rounded-t-3xl shadow-2xl flex flex-col glass-card !bg-white dark:!bg-[#0a0f1d] border-t border-white/10 h-[65vh] animate-in slide-in-from-bottom duration-300">
              {/* Bottom Sheet Handle */}
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto my-3 flex-shrink-0" />
              {renderNotificationList()}
            </div>
          </div>
        )}

        {/* Mobile Group Selector Slide-up Overlay */}
        {showGroupSelector && (
          <div ref={mobileGroupSelectorRef} className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowGroupSelector(false)} />
            
            {/* Bottom Sheet Card */}
            <div className="relative w-full max-w-lg rounded-t-3xl shadow-2xl flex flex-col glass-card !bg-white dark:!bg-[#0a0f1d] border-t border-white/10 h-[50vh] animate-in slide-in-from-bottom duration-300">
              {/* Bottom Sheet Handle */}
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto my-3 flex-shrink-0" />
              {renderGroupSelectorList()}
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          TABLET & DESKTOP LAYOUT: Sleek Glassmorphic Left Sidebar Dock
          ───────────────────────────────────────────────────────────────────────────── */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-20 lg:w-64 bg-white/85 dark:bg-[#0a0f1d]/85 backdrop-blur-lg border-r border-white/5 flex-col justify-between py-6 z-40">
        <div className="flex flex-col gap-8 w-full px-3 lg:px-4">
          {/* Logo & Toggle Header */}
          <div className="flex flex-col lg:flex-row items-center lg:justify-between gap-4 lg:gap-0 lg:px-3 w-full">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center border border-secondary/20 flex-shrink-0 shadow-md shadow-secondary/5">
                <span className="material-symbols-outlined text-secondary text-[20px]">account_balance_wallet</span>
              </div>
              <Link to="/dashboard" className="hidden lg:flex text-lg font-black text-white tracking-tight items-center gap-1.5 leading-none hover:opacity-90">
                <span>Settl</span><span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse-glow"></span>
              </Link>
            </div>
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/5 text-slate-400 hover:bg-white/5 hover:text-white transition-all active:scale-95 cursor-pointer flex-shrink-0"
              aria-label="Toggle dark mode"
            >
              <span className="material-symbols-outlined text-[18px]">
                {isDark ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="flex flex-col gap-2 w-full">
            {/* Dashboard */}
            <Link
              to="/dashboard"
              className={`flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all active:scale-95 ${
                isDashboard
                  ? 'bg-secondary/15 text-secondary border border-secondary/20 shadow-lg shadow-secondary/5'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[20px] flex-shrink-0" style={isDashboard ? { fontVariationSettings: "'FILL' 1" } : {}}>
                dashboard
              </span>
              <span className="hidden lg:inline text-xs font-bold uppercase tracking-wider">Dashboard</span>
            </Link>

            {/* Active Group Shortcut */}
            <div ref={groupSelectorRef} className="relative w-full">
              <button
                onClick={handleGroupClick}
                disabled={loadingGroups}
                className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all active:scale-95 cursor-pointer ${
                  (isGroupPage || isSettlePage || showGroupSelector)
                    ? 'bg-secondary/15 text-secondary border border-secondary/20 shadow-lg shadow-secondary/5'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] flex-shrink-0" style={(isGroupPage || isSettlePage) ? { fontVariationSettings: "'FILL' 1" } : {}}>
                  group
                </span>
                <span className="hidden lg:inline text-xs font-bold uppercase tracking-wider text-left">Active Group</span>
                {loadingGroups && (
                  <span className="material-symbols-outlined text-[16px] animate-spin ml-auto flex-shrink-0">sync</span>
                )}
              </button>

              {/* Desktop Group Selector Dropdown */}
              {showGroupSelector && (
                <div className="absolute left-full top-0 ml-3 w-72 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-left-2 duration-150 flex flex-col glass-card !bg-white dark:!bg-[#0a0f1d] border border-white/5">
                  {renderGroupSelectorList()}
                </div>
              )}
            </div>

            {/* Notification Bell */}
            <div ref={bellRef} className="relative">
              <button
                onClick={() => { setBellOpen(p => !p); setDropdownOpen(false); if (!bellOpen) markAllRead() }}
                className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all active:scale-95 cursor-pointer ${
                  bellOpen
                    ? 'bg-secondary/15 text-secondary border border-secondary/20 shadow-lg shadow-secondary/5'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px]" style={unreadCount > 0 || bellOpen ? { fontVariationSettings: "'FILL' 1" } : {}}>
                    notifications
                  </span>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#f87171] border border-white dark:border-[#0a0f1d] animate-pulse-glow" />
                  )}
                </div>
                <span className="hidden lg:inline text-xs font-bold uppercase tracking-wider text-left">Activity</span>
                {unreadCount > 0 && (
                  <span className="hidden lg:flex ml-auto min-w-[18px] h-[18px] rounded-full bg-[#f87171] text-white text-[9px] font-black items-center justify-center px-1">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Desktop Notification Dropdown */}
              {bellOpen && (
                <div className="absolute left-full top-0 ml-3 w-80 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-left-2 duration-150 flex flex-col glass-card !bg-white dark:!bg-[#0a0f1d] border border-white/5"
                  style={{ maxHeight: '420px' }}>
                  {renderNotificationList()}
                </div>
              )}
            </div>

            {/* Profile */}
            <Link
              to="/profile"
              className={`flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all active:scale-95 ${
                isProfile
                  ? 'bg-secondary/15 text-secondary border border-secondary/20 shadow-lg shadow-secondary/5'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-[20px] flex-shrink-0" style={isProfile ? { fontVariationSettings: "'FILL' 1" } : {}}>
                person
              </span>
              <span className="hidden lg:inline text-xs font-bold uppercase tracking-wider">My Profile</span>
            </Link>
          </nav>
        </div>

        {/* Bottom controls: user info */}
        <div className="flex flex-col items-center gap-4 w-full px-3 lg:px-4">

          {/* User Account / Avatar Dropdown */}
          <div ref={dropdownRef} className="relative w-full">
            <button
              onClick={() => { setDropdownOpen(prev => !prev); setBellOpen(false) }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group active:scale-95"
              aria-label="User menu"
            >
              <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary border border-secondary/20 flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="hidden lg:flex flex-col text-left leading-tight overflow-hidden">
                <span className="text-xs font-bold text-white group-hover:text-secondary transition-colors truncate">
                  {user?.name}
                </span>
                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mt-0.5 truncate">
                  Options
                </span>
              </div>
              <span className="hidden lg:inline material-symbols-outlined text-[14px] text-slate-500 ml-auto transition-transform duration-200" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                expand_more
              </span>
            </button>

            {dropdownOpen && (
              <div className="absolute bottom-full left-3 w-52 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 glass-card !bg-white dark:!bg-[#0a0f1d] border border-white/5 mb-3">
                <div className="px-4 py-3 border-b border-white/5">
                  <p className="text-xs font-bold text-white truncate">{user?.name}</p>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#f87171] hover:bg-[#f87171]/10 transition-colors cursor-pointer text-left"
                >
                  <span className="material-symbols-outlined text-[16px]">logout</span>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}