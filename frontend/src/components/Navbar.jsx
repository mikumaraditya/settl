import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'

const NAV_ITEMS = [
  { label: 'Home', path: '/dashboard', icon: 'grid_view' },
  { label: 'Groups', path: '/groups', icon: 'groups' },
  { label: 'Activity', path: '/activity', icon: 'timeline' },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const { unreadCount } = useNotifications()
  const location = useLocation()
  const navigate = useNavigate()
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [accountOpen, setAccountOpen] = useState(false)

  const isActive = (path) => path === '/dashboard'
    ? location.pathname === path
    : path === '/groups'
      ? location.pathname === '/groups' || location.pathname.startsWith('/group/') || location.pathname.startsWith('/settle/')
      : location.pathname === path

  const toggleTheme = () => {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    document.documentElement.classList.toggle('light', !next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    setIsDark(next)
  }

  const handleLogout = () => {
    setAccountOpen(false)
    logout()
    navigate('/login')
  }

  const initials = (user?.name || 'U').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()

  return (
    <>
      <header className="app-mobile-header md:hidden fixed top-0 inset-x-0 h-14 z-40 flex items-center justify-between px-4">
        <Link to="/dashboard" className="flex items-center gap-2.5" aria-label="Settl home">
          <span className="app-brand-mark w-8 h-8 rounded-xl flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-[19px]">account_balance_wallet</span>
          </span>
          <span className="text-[19px] font-extrabold tracking-[-0.06em] text-[var(--on-surface)]">settl<span className="text-[var(--secondary)]">.</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} aria-label="Toggle theme" className="w-9 h-9 rounded-xl flex items-center justify-center app-muted hover:bg-[var(--surface-container)]">
            <span className="material-symbols-outlined text-[19px]">{isDark ? 'light_mode' : 'dark_mode'}</span>
          </button>
          <div className="relative">
            <button onClick={() => setAccountOpen(value => !value)} aria-label="Open account menu" className="w-9 h-9 rounded-xl bg-[var(--app-blue-soft)] text-[var(--secondary)] border border-[var(--app-border)] text-xs font-extrabold">
              {initials}
            </button>
            {accountOpen && (
              <div className="absolute right-0 top-11 z-50 w-52 app-card p-2 shadow-xl">
                <div className="px-3 py-2 border-b app-divider mb-1">
                  <p className="text-xs font-bold truncate">{user?.name}</p>
                  <p className="text-[10px] app-muted truncate mt-0.5">{user?.email}</p>
                </div>
                <Link to="/profile" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold hover:bg-[var(--surface-container-low)]">
                  <span className="material-symbols-outlined text-[17px]">person</span> Profile & settings
                </Link>
                <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold text-rose-500 hover:bg-rose-500/5">
                  <span className="material-symbols-outlined text-[17px]">logout</span> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <aside className="app-sidebar hidden md:flex fixed left-0 top-0 bottom-0 z-40 flex-col justify-between px-4 py-6">
        <div>
          <Link to="/dashboard" className="flex items-center gap-3 px-2 mb-10" aria-label="Settl home">
            <span className="app-brand-mark w-10 h-10 rounded-[14px] flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
            </span>
            <span className="text-[22px] font-extrabold tracking-[-0.065em] text-[var(--on-surface)]">settl<span className="text-[var(--secondary)]">.</span></span>
          </Link>

          <p className="app-page-kicker px-3 mb-3">Workspace</p>
          <nav className="flex flex-col gap-1.5" aria-label="Main navigation">
            {NAV_ITEMS.map(item => (
              <Link key={item.path} to={item.path} className={`app-nav-link ${isActive(item.path) ? 'is-active' : ''}`}>
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.path === '/activity' && unreadCount > 0 && (
                  <span className="min-w-5 h-5 px-1 rounded-full flex items-center justify-center bg-[var(--secondary)] text-white text-[10px] font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3">
          <button onClick={toggleTheme} className="app-nav-link" aria-label="Toggle theme">
            <span className="material-symbols-outlined">{isDark ? 'light_mode' : 'dark_mode'}</span>
            <span>{isDark ? 'Light appearance' : 'Dark appearance'}</span>
          </button>
          <div className="border-t app-divider pt-4">
            <Link to="/profile" className={`flex items-center gap-3 p-3 rounded-2xl hover:bg-[var(--surface-container-low)] ${location.pathname === '/profile' ? 'bg-[var(--app-blue-soft)]' : ''}`}>
              <span className="w-10 h-10 rounded-xl bg-[var(--app-blue-soft)] text-[var(--secondary)] flex items-center justify-center text-xs font-extrabold">{initials}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold truncate">{user?.name || 'Your account'}</span>
                <span className="block text-[10px] app-muted truncate mt-0.5">Personal workspace</span>
              </span>
              <span className="material-symbols-outlined app-muted text-[18px]">chevron_right</span>
            </Link>
            <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold app-muted hover:text-rose-500 hover:bg-rose-500/5 mt-1">
              <span className="material-symbols-outlined text-[17px]">logout</span> Sign out
            </button>
          </div>
        </div>
      </aside>

      <nav className="app-mobile-dock md:hidden fixed bottom-0 inset-x-0 z-40 h-[68px] flex items-stretch px-2 pb-safe" aria-label="Mobile navigation">
        {NAV_ITEMS.map(item => (
          <Link key={item.path} to={item.path} className={`app-nav-mobile ${isActive(item.path) ? 'is-active' : ''}`}>
            <span className="relative material-symbols-outlined">
              {item.icon}
              {item.path === '/activity' && unreadCount > 0 && <span className="absolute -top-1 -right-2.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[var(--app-sidebar)]" />}
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
        <Link to="/profile" className={`app-nav-mobile ${location.pathname === '/profile' ? 'is-active' : ''}`}>
          <span className="material-symbols-outlined">person</span>
          <span>Profile</span>
        </Link>
      </nav>
    </>
  )
}
