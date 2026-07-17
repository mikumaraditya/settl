import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from '../api/axios'
import { useAuth } from '../context/AuthContext'
import UpiConfirmModal from '../components/UpiConfirmModal'
import ErrorToast from '../components/ErrorToast'

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', upiId: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.upiId.trim()) {
      setError('UPI ID is required')
      return
    }
    const upiRegex = /^[a-zA-Z0-9.\-_]{3,50}@(oksbi|paytm|ybl|barodampay|okaxis|okhdfcbank|okicici|okbizaxis|ibl|axl|upi|apl|rapl|yapl|sbi|hdfcbank|icici|axisbank|yesbank|pnb|cnrb|indianbank|iob|unionbank|uboi|idfcbank|federal|kotak|kmbl|boi|uco|cbin|centralbank|dbs|hsbc|sc|citi|postbank|ippb|airtel|airtelmail|jio|cred|slice|sliceaxis|fi|jupiter|waaxis|wasbi|waicici|wahdfc|bob)$/i
    if (!upiRegex.test(form.upiId.trim())) {
      setError('Enter a valid UPI ID, e.g. name@oksbi or name@paytm.')
      return
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
    if (!passwordRegex.test(form.password)) {
      setError('Password must have 8+ characters, upper & lowercase letters, a number, and a symbol.')
      return
    }
    setShowConfirmModal(true)
  }

  const handleConfirmRegister = async () => {
    setShowConfirmModal(false)
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
    <div className="h-screen w-full flex bg-[#060e20] text-white overflow-hidden relative">
      {/* Left Panel: Presentation (hidden on mobile/tablet) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#0b1528] via-[#091122] to-[#040914] relative items-center justify-center p-12 overflow-hidden border-r border-white/5">
        {/* Decorative Glow */}
        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none"></div>
        
        {/* Decorative Grid Overlay */}
        <div className="absolute inset-0 auth-split-grid opacity-30"></div>
        
        <div className="max-w-[500px] z-10 space-y-5 lg:space-y-6 animate-in fade-in slide-in-from-left-6 duration-700">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-tr from-secondary to-blue-600 rounded-xl shadow-lg shadow-secondary/20">
              <span className="material-symbols-outlined text-white text-[22px] font-bold">account_balance_wallet</span>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight flex items-center gap-1 leading-none">
              <span>Settl</span><span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
            </h2>
          </div>

          {/* Catchy Slogan */}
          <div className="space-y-2">
            <h1 className="text-3xl lg:text-4xl font-black leading-tight tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Split bills with ease.<br />Settl them in one click.
            </h1>
            <p className="text-xs lg:text-sm text-slate-400 leading-relaxed">
              The smartest way to track group expenses, manage shared bills, and simplify complex debts with friends, family, and flatmates.
            </p>
          </div>

          {/* Live CSS Demo Card */}
          <div className="glass-card p-4 lg:p-5 rounded-2xl border border-white/10 bg-white/[0.02] shadow-[0_20px_50px_rgba(0,0,0,0.3)] space-y-3.5 animate-float-slow">
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-slate-400">Live Demo: Goa Trip 🌴</span>
              </div>
              <span className="text-[9px] lg:text-[10px] bg-secondary/20 text-secondary border border-secondary/30 px-2 py-0.5 rounded-full font-bold uppercase">Active Group</span>
            </div>

            {/* Members Visualizer */}
            <div className="relative h-[120px] w-[330px] mx-auto">
              {/* Connection SVG Line */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                {/* Unsimplified Paths */}
                <path d="M 285 28 Q 225 58 165 68" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3 3" />
                <path d="M 165 68 Q 105 58 45 28" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3 3" />
                <path d="M 45 28 Q 105 58 165 68" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3 3" />
                <path d="M 285 28 Q 165 5 45 28" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3 3" />
                
                {/* Simplified Path */}
                <path d="M 285 28 Q 165 5 45 28" fill="none" stroke="url(#blue-gradient)" strokeWidth="2.5" strokeDasharray="4 6" className="animate-dash-line" />
                
                {/* Gradient Definitions */}
                <defs>
                  <linearGradient id="blue-gradient" x1="100%" y1="0%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#ec4899" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Avatars */}
              <div className="absolute left-[20px] top-[8px] flex flex-col items-center z-10 animate-float-fast">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600/20 to-blue-500/10 border border-blue-500/40 flex items-center justify-center font-bold text-blue-400 text-xs shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                  AM
                </div>
                <span className="text-[10px] font-semibold mt-1 text-slate-300">Amit</span>
                <span className="text-[9px] text-emerald-400 font-bold mt-0.5">+₹1,500</span>
              </div>

              <div className="absolute left-[145px] top-[48px] flex flex-col items-center z-10">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-800/80 to-slate-700/40 border border-slate-600/40 flex items-center justify-center font-bold text-slate-400 text-xs">
                  SA
                </div>
                <span className="text-[10px] font-semibold mt-1 text-slate-300">Sara</span>
                <span className="text-[9px] text-slate-500 font-semibold mt-0.5">Settled</span>
              </div>

              <div className="absolute left-[270px] top-[8px] flex flex-col items-center z-10 animate-float-slow">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-600/20 to-pink-500/10 border border-pink-500/40 flex items-center justify-center font-bold text-pink-400 text-xs shadow-[0_0_15px_rgba(236,72,153,0.15)]">
                  KA
                </div>
                <span className="text-[10px] font-semibold mt-1 text-slate-300">Kabir</span>
                <span className="text-[9px] text-rose-400 font-bold mt-0.5">-₹1,500</span>
              </div>
            </div>

            {/* Explanation Text */}
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2.5 text-[11px] lg:text-xs text-slate-400 flex items-start gap-2">
              <span className="material-symbols-outlined text-secondary text-[16px] lg:text-[18px]">lightbulb</span>
              <p className="leading-relaxed">
                Instead of 4 back-and-forth payments between Amit (paid ₹3,000), Sara (paid ₹1,500), and Kabir (paid ₹0), Settl simplifies it so Kabir pays Amit ₹1,500 directly and Sara pays ₹0.
              </p>
            </div>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[18px] lg:text-[20px]">check_circle</span>
              <span className="text-[11px] lg:text-xs font-semibold text-slate-300">Equal & Unequal Splits</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[18px] lg:text-[20px]">check_circle</span>
              <span className="text-[11px] lg:text-xs font-semibold text-slate-300">UPI Payments & QR</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[18px] lg:text-[20px]">check_circle</span>
              <span className="text-[11px] lg:text-xs font-semibold text-slate-300">Real-time Group Chat</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[18px] lg:text-[20px]">check_circle</span>
              <span className="text-[11px] lg:text-xs font-semibold text-slate-300">Detailed Activity Log</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel: Authentication (Form) */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-6 lg:py-8 relative overflow-y-auto lg:overflow-hidden h-full">
        {/* Decorative Glow Sphere on Right */}
        <div className="absolute top-[20%] right-[-10%] w-[300px] h-[300px] bg-secondary/10 rounded-full blur-[100px] pointer-events-none -z-10 animate-pulse-glow"></div>
        <div className="absolute bottom-[20%] left-[-10%] w-[250px] h-[250px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none -z-10 animate-pulse-glow"></div>

        <div className="w-full max-w-[420px] flex flex-col space-y-6">
          {/* Brand Header for Mobile Only */}
          <div className="flex flex-col items-center lg:hidden mb-2">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-to-tr from-secondary to-blue-600 rounded-xl shadow-md">
                <span className="material-symbols-outlined text-white text-[18px] font-bold">account_balance_wallet</span>
              </div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-0.5 animate-pulse-glow">
                <span>Settl</span><span className="w-2 h-2 rounded-full bg-secondary"></span>
              </h1>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-1.5">Split now · Settl later</p>
          </div>

          {/* Authentication Card */}
          <div className="glass-card rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden flex flex-col min-h-0 w-full auth-card-shadow">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-secondary to-blue-500" />
            
            <h2 className="text-white text-base md:text-lg font-bold mb-4 md:mb-5 text-center uppercase tracking-wider flex-shrink-0">Create Account</h2>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 space-y-3.5 min-h-0 hide-scrollbar">
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
                    className="w-full pl-10 pr-4 py-2.5 md:py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm text-primary outline-none transition-all placeholder:text-outline-variant/60"
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

              {/* UPI ID Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block ml-1" htmlFor="upiId">
                  UPI ID <span className="text-[#f87171]">*</span>
                </label>
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
            <div className="mt-4 md:mt-5 text-center pt-3 border-t border-white/5 flex-shrink-0">
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
      <UpiConfirmModal
        open={showConfirmModal}
        upiId={form.upiId}
        onConfirm={handleConfirmRegister}
        onCancel={() => setShowConfirmModal(false)}
      />
      {error && (
        <ErrorToast key={error} message={error} onClose={() => setError('')} />
      )}
    </div>
  )
}