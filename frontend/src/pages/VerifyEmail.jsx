import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import axios from '../api/axios'
import { useAuth } from '../context/AuthContext'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { markEmailVerified, login } = useAuth()

  const token = searchParams.get('token')
  const [status, setStatus] = useState(() => token ? 'verifying' : 'error') // 'verifying' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState(() => token ? '' : 'No verification token found in the link.')

  // Guard against React StrictMode double-invoking useEffect in dev,
  // which would consume the one-time token on the first call and cause
  // the second call to return "Invalid or expired".
  const called = useRef(false)

  useEffect(() => {
    if (!token) return
    if (called.current) return
    called.current = true

    axios
      .get(`/auth/verify-email?token=${token}`)
      .then(({ data }) => {
        // If the backend returns a full user object (logged-in flow),
        // persist it so the dashboard is accessible immediately.
        if (data?.token) {
          login(data)
        } else {
          // Already logged in — just mark email verified in context
          markEmailVerified()
        }
        setStatus('success')
        // Auto-redirect to dashboard after 3 seconds
        setTimeout(() => navigate('/dashboard'), 3000)
      })
      .catch((err) => {
        setStatus('error')
        setErrorMsg(
          err.response?.data?.message || 'Verification failed. The link may have expired.'
        )
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="login-bg-pattern min-h-screen flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Premium Decorative Glow Spheres */}
      <div className="fixed top-[20%] -right-24 w-[380px] h-[380px] bg-secondary/15 rounded-full blur-[100px] pointer-events-none -z-10 animate-pulse-glow"></div>
      <div className="fixed bottom-[10%] -left-16 w-[320px] h-[320px] bg-[#fbbf24]/10 rounded-full blur-[100px] pointer-events-none -z-10 animate-pulse-glow"></div>

      <div className="w-full max-w-[440px] z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-tr from-secondary to-blue-600 rounded-xl shadow-md shadow-secondary/20">
              <span className="material-symbols-outlined text-white text-[20px] font-bold">account_balance_wallet</span>
            </div>
            <h1 className="text-3xl font-extrabold text-primary tracking-tight flex items-center gap-1 leading-none">
              <span>Settl</span><span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
            </h1>
          </div>
          <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider mt-2.5">Split now · Settl later</p>
        </div>

        {/* Authentication Card */}
        <div className="glass-card rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-secondary to-blue-500" />

          {/* VERIFYING */}
          {status === 'verifying' && (
            <div className="flex flex-col items-center gap-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center border border-secondary/20 animate-pulse-glow">
                <span className="material-symbols-outlined text-secondary text-[32px]">mark_email_unread</span>
              </div>
              <div>
                <h2 className="text-white text-lg font-bold uppercase tracking-wider">Verifying Email</h2>
                <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">Checking token verification. This will only take a moment.</p>
              </div>
              <div className="flex gap-1.5 mt-2">
                <span className="w-2 h-2 rounded-full bg-secondary animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 rounded-full bg-secondary animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 rounded-full bg-secondary animate-bounce" />
              </div>
            </div>
          )}

          {/* SUCCESS */}
          {status === 'success' && (
            <div className="flex flex-col items-center gap-5 text-center animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center border border-green-500/20">
                <span className="material-symbols-outlined text-green-400 text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  check_circle
                </span>
              </div>
              <div>
                <h2 className="text-white text-lg font-bold uppercase tracking-wider">Email Verified! 🎉</h2>
                <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                  Your email has been successfully verified. You're all set to use Settl without any restrictions.
                </p>
              </div>
              <div className="w-full bg-green-500/5 border border-green-500/15 rounded-xl px-4 py-3 mt-1">
                <p className="text-[11px] text-green-400 font-bold uppercase tracking-wider">
                  Redirecting to dashboard…
                </p>
              </div>
              <Link
                to="/dashboard"
                className="w-full py-3.5 bg-gradient-to-r from-secondary to-blue-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:brightness-110 active:scale-[0.98] transition-all text-center cursor-pointer block shadow-lg shadow-secondary/20"
              >
                Go to Dashboard
              </Link>
            </div>
          )}

          {/* ERROR */}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-5 text-center animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-2xl bg-[#f87171]/10 flex items-center justify-center border border-[#f87171]/20">
                <span className="material-symbols-outlined text-[#f87171] text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  cancel
                </span>
              </div>
              <div>
                <h2 className="text-white text-lg font-bold uppercase tracking-wider">Verification Failed</h2>
                <p className="text-xs text-[#fca5a5] mt-2 leading-relaxed bg-[#f87171]/5 border border-[#f87171]/10 rounded-xl p-3">{errorMsg}</p>
              </div>
              <div className="flex flex-col gap-3 w-full mt-2">
                <Link
                  to="/dashboard"
                  className="w-full py-3.5 bg-gradient-to-r from-secondary to-blue-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:brightness-110 active:scale-[0.98] transition-all text-center cursor-pointer block"
                >
                  Go to Dashboard
                </Link>
                <Link
                  to="/login"
                  className="w-full py-3.5 border border-outline-variant/30 text-primary font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-surface-container transition-all text-center cursor-pointer block"
                >
                  Back to Login
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
