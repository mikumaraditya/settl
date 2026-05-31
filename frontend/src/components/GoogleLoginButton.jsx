import { useEffect, useRef, useState } from 'react'
import axios from '../api/axios'

export default function GoogleLoginButton({ onLoginSuccess, onError }) {
  const buttonRef = useRef(null)
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
    if (!isConfigured || !scriptLoaded || !buttonRef.current) return

    const parent = buttonRef.current.parentElement
    if (!parent) return

    setContainerWidth(parent.offsetWidth || 320)

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const width = entry.contentBoxSize?.[0]?.inlineSize || entry.contentRect.width
        if (width) {
          setContainerWidth(Math.floor(width))
        }
      }
    })

    resizeObserver.observe(parent)
    return () => resizeObserver.disconnect()
  }, [scriptLoaded, isConfigured])

  // Hook 3: Initialize Google Sign-In and render the official button once DOM element is mounted
  useEffect(() => {
    if (!isConfigured || !scriptLoaded || !buttonRef.current || !window.google?.accounts?.id) return

    // Clamp width to Google API guidelines: [200px, 400px]
    const clampedWidth = Math.max(200, Math.min(400, containerWidth - 32)) // account for card padding

    try {
      buttonRef.current.innerHTML = ''

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false,
      })

      window.google.accounts.id.renderButton(
        buttonRef.current,
        {
          theme: 'filled_blue', // Blends beautifully with neon slate dark card themes
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
  }, [scriptLoaded, isConfigured, clientId, containerWidth])

  const showMockButton = !isConfigured || scriptFailed
  const clampedWidth = Math.max(200, Math.min(400, containerWidth - 32))

  return (
    <div className="w-full flex flex-col items-center">
      {/* Premium Divider */}
      <div className="w-full flex items-center gap-3 my-6">
        <div className="h-[1px] flex-1 bg-white/5" />
        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest leading-none">
          or continue with
        </span>
        <div className="h-[1px] flex-1 bg-white/5" />
      </div>

      {/* Glassmorphic Centered Social Login Container */}
      <div className="w-full p-6 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md shadow-2xl shadow-indigo-500/5 hover:border-indigo-500/20 hover:shadow-indigo-500/10 transition-all duration-300 flex flex-col items-center justify-center gap-4 relative overflow-hidden group">
        {/* Neon Glow Sphere Accent */}
        <div className="absolute -inset-10 bg-gradient-to-r from-indigo-500/10 to-violet-500/10 rounded-full blur-2xl opacity-50 group-hover:opacity-75 transition-opacity duration-500 pointer-events-none -z-10" />

        {showMockButton ? (
          /* Fallback mock button styled identically to Google filled_blue design */
          <button
            onClick={handleMockLogin}
            disabled={loading}
            style={{ maxWidth: `${clampedWidth}px` }}
            className="w-full h-10 bg-[#1a73e8] hover:bg-[#1557b0] active:bg-[#1b66ca] text-white rounded-full font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-3 transition-all cursor-pointer shadow-lg shadow-[#1a73e8]/20 hover:shadow-[#1a73e8]/30 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
            ) : (
              <svg className="w-4.5 h-4.5 flex-shrink-0 bg-white p-0.5 rounded-full" viewBox="0 0 24 24">
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
          /* Glassmorphic Pulse Skeleton Loader */
          <div className="w-full max-w-[320px] h-10 bg-white/5 border border-white/5 rounded-full animate-pulse flex items-center justify-center gap-3">
            <div className="w-4 h-4 bg-white/20 rounded-full animate-ping" />
            <div className="h-3.5 bg-white/15 rounded w-28" />
          </div>
        ) : (
          /* Official Google SDK IFrame container */
          <div className="w-full flex justify-center min-h-[40px] transition-all duration-300">
            <div ref={buttonRef} className="w-full flex justify-center" style={{ maxWidth: `${clampedWidth}px` }} />
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
