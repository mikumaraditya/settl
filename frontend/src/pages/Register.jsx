import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from '../api/axios'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', upiId: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.post('/auth/register', form)
      login(data)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-bg-pattern min-h-screen flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Premium Decorative Glow Spheres */}
      <div className="fixed top-[20%] -right-24 w-[380px] h-[380px] bg-secondary/15 rounded-full blur-[100px] pointer-events-none -z-10 animate-pulse-glow"></div>
      <div className="fixed bottom-[10%] -left-16 w-[320px] h-[320px] bg-[#fbbf24]/10 rounded-full blur-[100px] pointer-events-none -z-10 animate-pulse-glow"></div>

      <div className="w-full max-w-[460px] z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-secondary to-blue-600 rounded-2xl mb-4 shadow-lg shadow-secondary/25">
            <span className="material-symbols-outlined text-white text-[28px] font-bold">account_balance_wallet</span>
          </div>
          <h1 className="text-3xl font-extrabold text-primary tracking-tight flex items-center justify-center gap-1.5 leading-none">
            <span>Settl</span><span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
          </h1>
          <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider mt-2.5">Split now · Settl later</p>
        </div>

        {/* Authentication Card */}
        <div className="glass-card rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-secondary to-blue-500" />
          
          <h2 className="text-white text-lg font-bold mb-6 text-center uppercase tracking-wider">Create Account</h2>

          {error && (
            <div className="bg-[#f87171]/10 border border-[#f87171]/35 text-[#fca5a5] text-xs font-semibold rounded-xl px-4 py-3 mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block ml-1" htmlFor="name">
                Full Name
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">
                  person
                </span>
                <input
                  id="name"
                  type="text"
                  placeholder="Raj Kumar"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm text-primary outline-none transition-all placeholder:text-outline-variant/60"
                  required
                  onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)' }}
                  onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </div>

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
                  className="w-full pl-10 pr-4 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm text-primary outline-none transition-all placeholder:text-outline-variant/60"
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
                  className="w-full pl-10 pr-4 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm text-primary outline-none transition-all placeholder:text-outline-variant/60"
                  required
                  onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)' }}
                  onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            {/* UPI ID Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block" htmlFor="upiId">
                  UPI ID <span className="text-[9px] text-on-surface-variant/50 font-normal lowercase tracking-normal">(optional)</span>
                </label>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">
                  payments
                </span>
                <input
                  id="upiId"
                  type="text"
                  placeholder="raj@upi"
                  value={form.upiId}
                  onChange={e => setForm({ ...form, upiId: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm text-primary outline-none transition-all placeholder:text-outline-variant/60"
                  onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)' }}
                  onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            {/* Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 mt-6 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-secondary to-blue-600 text-white shadow-lg shadow-secondary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  Creating Account…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>person_add</span>
                  Create Account
                </>
              )}
            </button>
          </form>

          {/* Footer Link */}
          <div className="mt-6 text-center pt-4 border-t border-white/5">
            <p className="text-xs text-on-surface-variant font-medium">
              Already have an account?{' '}
              <Link to="/login" className="font-bold text-secondary hover:underline transition-all">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}