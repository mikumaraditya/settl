import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useNotifications } from '../context/NotificationContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications()

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [now]               = useState(() => Date.now())
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const dropdownRef = useRef(null)
  const bellRef = useRef(null)

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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false)
      if (bellRef.current    && !bellRef.current.contains(e.target))     setBellOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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
  const isGroup  = location.pathname.startsWith('/group/')
  const isSettle = location.pathname.startsWith('/settle/')

  return (
    <header className="sticky top-0 z-50 backdrop-blur-lg bg-background/80 border-b border-outline-variant/20">
      <div className="flex justify-between items-center w-full px-6 md:px-8 h-16 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center border border-secondary/20">
            <span className="material-symbols-outlined text-secondary text-[22px]">account_balance_wallet</span>
          </div>
          <Link to="/dashboard" className="text-xl font-bold text-primary tracking-tight hover:opacity-90 flex items-center gap-1.5 leading-none">
            <span>Settl</span><span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center gap-2">
          <Link
            to="/dashboard"
            className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
              isDashboard
                ? 'bg-secondary/10 text-secondary border border-secondary/25'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-primary border border-transparent'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]" style={isDashboard ? { fontVariationSettings: "'FILL' 1" } : {}}>
              dashboard
            </span>
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          {(isGroup || isSettle) && (
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container text-primary border border-outline-variant/20">
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
              <span className="hidden sm:inline">Active Group</span>
            </span>
          )}
        </nav>

        {/* Right side: bell + theme toggle + avatar dropdown */}
        <div className="flex items-center gap-3.5">
          {/* Notification Bell */}
          <div ref={bellRef} className="relative z-50">
            <button
              onClick={() => { setBellOpen(p => !p); setDropdownOpen(false); if (!bellOpen) markAllRead() }}
              className="relative w-10 h-10 rounded-xl flex items-center justify-center border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all active:scale-95 cursor-pointer"
              aria-label="Notifications"
            >
              <span className="material-symbols-outlined text-[20px]" style={unreadCount > 0 ? { fontVariationSettings: "'FILL' 1" } : {}}>
                notifications
              </span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[#f87171] text-white text-[10px] font-bold flex items-center justify-center px-1 shadow animate-in zoom-in duration-200">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-full mt-3 w-80 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col glass-card"
                style={{ maxHeight: '420px' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
                  <p className="text-xs font-bold text-white uppercase tracking-wider">Notifications</p>
                  {notifications.length > 0 && (
                    <button onClick={clearAll} className="text-[10px] text-on-surface-variant hover:text-[#f87171] transition-colors cursor-pointer font-bold uppercase tracking-wider">Clear all</button>
                  )}
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1 custom-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white/5 border border-white/5">
                        <span className="material-symbols-outlined text-2xl text-on-surface-variant/40">notifications_off</span>
                      </div>
                      <p className="text-xs font-semibold text-on-surface-variant">No notifications yet</p>
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
                          <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">{n.body}</p>
                          <p className="text-[10px] text-on-surface-variant/50 mt-1.5">{timeAgo(n.time)}</p>
                        </div>
                        {!n.read && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full animate-pulse-glow" style={{ backgroundColor: n.color }} />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-xl flex items-center justify-center border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all active:scale-95 cursor-pointer"
            aria-label="Toggle dark mode"
          >
            <span className="material-symbols-outlined text-[20px]">
              {isDark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          {/* Avatar dropdown */}
          <div ref={dropdownRef} className="relative z-50">
            <button
              onClick={() => { setDropdownOpen(prev => !prev); setBellOpen(false) }}
              className="flex items-center gap-2.5 cursor-pointer group active:scale-95 transition-transform"
              aria-label="User menu"
            >
              <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary border border-secondary/25 flex items-center justify-center font-bold text-sm shadow-sm group-hover:ring-2 group-hover:ring-secondary/20 transition-all">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:flex flex-col text-left leading-tight">
                <span className="text-xs font-bold text-primary group-hover:text-secondary transition-colors">
                  {user?.name}
                </span>
                <span className="text-[9px] text-on-surface-variant uppercase font-bold tracking-wider mt-0.5">
                  My Profile
                </span>
              </div>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant transition-transform duration-200" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                expand_more
              </span>
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-3 w-56 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200 glass-card">

                {/* User info header */}
                <div className="px-4 py-3 border-b border-white/5">
                  <p className="text-xs font-bold text-white truncate">{user?.name}</p>
                  <p className="text-[10px] text-on-surface-variant truncate mt-0.5">{user?.email}</p>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <button
                    onClick={() => { setDropdownOpen(false); navigate('/profile') }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:bg-white/5 hover:text-white transition-colors cursor-pointer text-left"
                  >
                    <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
                    My Profile
                  </button>
                </div>

                <div className="border-t border-white/5 py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#f87171] hover:bg-[#f87171]/10 transition-colors cursor-pointer text-left"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}