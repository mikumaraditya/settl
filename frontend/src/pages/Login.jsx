import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from '../api/axios'
import { useAuth } from '../context/AuthContext'
import GoogleLoginButton from '../components/GoogleLoginButton'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(() => {
    const expired = localStorage.getItem("settl_session_expired")
    if (expired) {
      localStorage.removeItem("settl_session_expired")
      return "Session expired, please sign in again."
    }
    return ""
  })
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.post('/auth/login', form)
      login(data)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-bg-pattern h-screen overflow-hidden flex flex-col justify-center items-center px-4 relative">
      {/* Premium Decorative Glow Spheres */}
      <div className="fixed top-[20%] -right-24 w-[380px] h-[380px] bg-secondary/15 rounded-full blur-[100px] pointer-events-none -z-10 animate-pulse-glow"></div>
      <div className="fixed bottom-[10%] -left-16 w-[320px] h-[320px] bg-[#fbbf24]/10 rounded-full blur-[100px] pointer-events-none -z-10 animate-pulse-glow"></div>

      <div className="w-full max-w-[460px] z-10 flex flex-col max-h-[95vh] md:max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-4 md:mb-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 bg-gradient-to-tr from-secondary to-blue-600 rounded-xl shadow-md shadow-secondary/20 flex-shrink-0">
              <span className="material-symbols-outlined text-white text-[18px] md:text-[20px] font-bold">account_balance_wallet</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-primary tracking-tight flex items-center gap-1 leading-none">
              <span>Settl</span><span className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-secondary"></span>
            </h1>
          </div>
          <p className="text-[10px] md:text-xs text-on-surface-variant font-semibold uppercase tracking-wider mt-1.5 md:mt-2.5">Split now · Settl later</p>
        </div>

        {/* Authentication Card */}
        <div className="glass-card rounded-3xl p-5 md:p-6 shadow-2xl relative overflow-hidden flex flex-col min-h-0 w-full">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-secondary to-blue-500" />
          
          <h2 className="text-white text-base md:text-lg font-bold mb-4 md:mb-5 text-center uppercase tracking-wider flex-shrink-0">Welcome Back</h2>

          {error && (
            <div className="bg-[#f87171]/10 border border-[#f87171]/35 text-[#fca5a5] text-xs font-semibold rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2 flex-shrink-0">
              <span className="material-symbols-outlined text-[16px] flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0 hide-scrollbar">
            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block ml-1" htmlFor="email">
                Email Address
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">
                  mail
                </span>
                <input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 md:py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm text-primary outline-none transition-all placeholder:text-outline-variant/60"
                  required
                  onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)' }}
                  onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block ml-1" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">
                  lock
                </span>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 md:py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm text-primary outline-none transition-all placeholder:text-outline-variant/60"
                  required
                  onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)' }}
                  onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            {/* Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 md:py-3.5 mt-2 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-secondary to-blue-600 text-white shadow-lg shadow-secondary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  Signing In…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>login</span>
                  Sign In
                </>
              )}
            </button>

            {/* Google login button */}
            <div className="flex-shrink-0 pt-1">
              <GoogleLoginButton
                onLoginSuccess={(data) => {
                  login(data)
                  navigate('/dashboard')
                }}
                onError={(msg) => setError(msg)}
              />
            </div>
          </form>

          {/* Footer Link */}
          <div className="mt-4 md:mt-5 text-center pt-3 border-t border-white/5 flex-shrink-0">
            <p className="text-xs text-on-surface-variant font-medium">
              New to Settl?{' '}
              <Link to="/register" className="font-bold text-secondary hover:underline transition-all">
                Create an account
              </Link>
            </p>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="mt-4 md:mt-6 flex flex-wrap justify-center gap-4 md:gap-6 opacity-45 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-on-surface-variant">verified_user</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Secure 256-bit encryption</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-on-surface-variant">sync</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Real-time settlement</span>
          </div>
        </div>
      </div>
    </div>
  )
}