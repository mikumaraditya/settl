import { useEffect, useRef, useState } from 'react'
import axios from '../api/axios'

export default function GoogleLoginButton({ onLoginSuccess, onError }) {
  const [buttonNode, setButtonNode] = useState(null)
  const containerRef = useRef(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(!!window.google?.accounts?.id)
  const [scriptFailed, setScriptFailed] = useState(false)
  const [containerWidth, setContainerWidth] = useState(320)

  const handleCredentialResponse = async (response) => {
    try {
      setLoading(true)
      setError('')
      const { data } = await axios.post('/auth/google', {
        token: response.credential,
      })
      if (onLoginSuccess) {
        onLoginSuccess(data)
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Google Login failed'
      setError(errMsg)
      if (onError) {
        onError(errMsg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleMockLogin = async () => {
    try {
      setLoading(true)
      setError('')
      const { data } = await axios.post('/auth/google', {
        token: 'mock-google-token',
      })
      if (onLoginSuccess) {
        onLoginSuccess(data)
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Google Login failed'
      setError(errMsg)
      if (onError) {
        onError(errMsg)
      }
    } finally {
      setLoading(false)
    }
  }

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const isConfigured = !!clientId && clientId !== '1013725458908-mockclient.apps.googleusercontent.com'

  // Hook 1: Handle Google Identity Services (GSI) script injection and loading check
  useEffect(() => {
    if (!isConfigured) return

    // Inject Google script dynamically
    let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
    if (!script) {
      script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    if (window.google?.accounts?.id) {
      return
    }

    const checkGoogleScript = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(checkGoogleScript)
        setScriptLoaded(true)
      }
    }, 100)

    const timeout = setTimeout(() => {
      if (!window.google?.accounts?.id) {
        clearInterval(checkGoogleScript)
        console.warn('Google Sign-In script failed to load. Falling back to Demo mode.')
        setScriptFailed(true)
      }
    }, 3000)

    return () => {
      clearInterval(checkGoogleScript)
      clearTimeout(timeout)
    }
  }, [isConfigured])

  // Hook 2: Dynamic parent container width measurement to handle responsiveness
  useEffect(() => {
    if (!containerRef.current) return

    const el = containerRef.current
    setContainerWidth(el.offsetWidth || 320)

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const width = entry.contentBoxSize?.[0]?.inlineSize || entry.contentRect.width
        if (width) {
          setContainerWidth(Math.floor(width))
        }
      }
    })

    resizeObserver.observe(el)
    return () => resizeObserver.disconnect()
  }, [])

  // Hook 3: Initialize Google Sign-In and render the official button once DOM element is mounted
  useEffect(() => {
    if (!isConfigured || !scriptLoaded || !buttonNode || !window.google?.accounts?.id) return

    // Clamp width to Google API guidelines: [200px, 400px]
    const clampedWidth = Math.max(200, Math.min(400, containerWidth - 32)) // account for card padding

    try {
      buttonNode.innerHTML = ''

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false,
      })

      window.google.accounts.id.renderButton(
        buttonNode,
        {
          theme: 'outline', // Subtler outlined button that integrates cleanly with our premium dark card layout
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: clampedWidth,
          logo_alignment: 'left',
        }
      )
    } catch (err) {
      console.error('Google Sign-In initialization failed:', err)
      setTimeout(() => setScriptFailed(true), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded, isConfigured, clientId, containerWidth, buttonNode])

  const showMockButton = !isConfigured || scriptFailed
  const clampedWidth = Math.max(200, Math.min(400, containerWidth - 32))

  return (
    <div className="w-full flex flex-col items-center">
      {/* Refined Premium Divider with Gradient Line Fades */}
      <div className="w-full flex items-center gap-4 my-5 select-none">
        <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-on-surface-variant/10 dark:to-white/10" />
        <span className="text-on-surface-variant/60 text-[9px] font-extrabold uppercase tracking-[0.2em] leading-none">
          or continue with
        </span>
        <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-on-surface-variant/10 dark:to-white/10" />
      </div>

      {/* Glassmorphic Centered Social Login Container with Inner Highlight & Refined Glow */}
      <div 
        ref={containerRef} 
        className="w-full p-4 rounded-2xl border border-slate-200/80 dark:border-white/5 bg-gradient-to-b from-slate-50/50 to-white/30 dark:from-white/[0.04] dark:to-white/[0.01] backdrop-blur-md shadow-[0_8px_32px_0_rgba(0,0,0,0.15)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] hover:border-slate-300 dark:hover:border-white/15 hover:scale-[1.01] active:scale-[0.99] hover:shadow-[0_8px_32px_0_rgba(59,130,246,0.1)] transition-all duration-300 flex flex-col items-center justify-center gap-3 relative overflow-hidden group"
      >
        {/* Shimmer CSS Style Injection */}
        <style>{`
          @keyframes shimmer {
            0% {
              background-position: -200% 0;
            }
            100% {
              background-position: 200% 0;
            }
          }
          .animate-shimmer {
            background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.03) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.6s infinite linear;
          }
        `}</style>

        {/* Soft Neon Glow Sphere Accent */}
        <div className="absolute -inset-24 bg-gradient-to-tr from-secondary/5 via-blue-500/5 to-transparent rounded-full blur-3xl opacity-30 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700 pointer-events-none -z-10" />

        {showMockButton ? (
          /* Custom Fallback Button matching Settl's signature purple-blue gradient */
          <button
            type="button"
            onClick={handleMockLogin}
            disabled={loading}
            style={{ maxWidth: `${clampedWidth}px` }}
            className="w-full h-10 bg-gradient-to-r from-secondary to-blue-600 hover:brightness-110 active:brightness-95 text-white rounded-full font-semibold text-xs flex items-center justify-center gap-3 transition-all cursor-pointer shadow-lg shadow-secondary/15 hover:shadow-secondary/25 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
            ) : (
              <svg className="w-4 h-4 flex-shrink-0 bg-white p-0.5 rounded-full" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.54 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.89 3.02C6.22 7.59 8.87 5.04 12 5.04z"
                />
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58l3.73 2.89c2.18-2.01 3.7-4.97 3.7-8.62z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.42c-.25-.76-.39-1.57-.39-2.42s.14-1.66.39-2.42L1.39 6.56C.5 8.2 .02 10.04 .02 12s.48 3.8 1.37 5.44l3.89-3.02z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.73-2.89c-1.04.7-2.37 1.11-4.23 1.11-3.13 0-5.78-2.55-6.72-5.54L1.39 15.79C3.37 19.68 7.35 23 12 23z"
                />
              </svg>
            )}
            <span>{loading ? 'Signing In...' : 'Sign in with Google'}</span>
          </button>
        ) : isConfigured && !scriptLoaded ? (
          /* Premium Shimmer Skeleton Loader */
          <div 
            style={{ maxWidth: `${clampedWidth}px` }} 
            className="w-full h-10 border border-slate-200 dark:border-white/5 rounded-full animate-shimmer flex items-center justify-center gap-3"
          >
            <div className="w-4 h-4 bg-slate-200 dark:bg-white/10 rounded-full" />
            <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-28" />
          </div>
        ) : (
          /* Official Google SDK IFrame container */
          <div className="w-full flex justify-center min-h-[40px] transition-all duration-300">
            <div ref={setButtonNode} className="w-full flex justify-center" style={{ maxWidth: `${clampedWidth}px` }} />
          </div>
        )}

        {/* Demo Indicator Footnote */}
        {showMockButton && (
          <span className="text-[9px] text-on-surface-variant/40 font-medium tracking-wide text-center leading-normal">
            {!isConfigured 
              ? "Local Demo Mode Active (Bypass Enabled)" 
              : "Google service offline. Fallback bypass active."}
          </span>
        )}

        {error && (
          <div className="w-full mt-2 bg-[#f87171]/10 border border-[#f87171]/20 rounded-xl py-2 px-3 flex items-center gap-2 justify-center animate-in fade-in duration-200">
            <span className="material-symbols-outlined text-[#f87171] text-[14px]">error</span>
            <p className="text-[#fca5a5] text-[10px] font-bold uppercase tracking-wider">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
