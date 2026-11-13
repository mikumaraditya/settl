import { useState } from 'react'

export default function ThemeToggle({ className = '' }) {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  const toggleTheme = () => {
    const nextIsDark = !isDark
    document.documentElement.classList.toggle('dark', nextIsDark)
    document.documentElement.classList.toggle('light', !nextIsDark)
    try {
      localStorage.setItem('theme', nextIsDark ? 'dark' : 'light')
    } catch {
      // Theme remains active for this page even if storage is unavailable.
    }
    setIsDark(nextIsDark)
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={className || 'theme-toggle'}
    >
      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
        {isDark ? 'light_mode' : 'dark_mode'}
      </span>
      <span className="sr-only">{isDark ? 'Light theme' : 'Dark theme'}</span>
    </button>
  )
}
