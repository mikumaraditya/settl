import { useEffect, useRef, useState } from 'react'
import axios from '../api/axios'

export default function GoogleLoginButton({ onLoginSuccess, onError }) {
  const buttonRef = useRef(null)
  const containerRef = useRef(null)
  const [error, setError] = useState('')
  const [scriptLoaded, setScriptLoaded] = useState(!!window.google?.accounts?.id)
  const [scriptFailed, setScriptFailed] = useState(false)
  const [containerWidth, setContainerWidth] = useState(320)
  const [retryTrigger, setRetryTrigger] = useState(0)

  const handleCredentialResponse = async (response) => {
    try {
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
        console.warn('Google Sign-In script failed to load.')
        setScriptFailed(true)
      }
    }, 5000)

    return () => {
      clearInterval(checkGoogleScript)
      clearTimeout(timeout)
    }
  }, [isConfigured, retryTrigger])

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
    const buttonNode = buttonRef.current
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
          theme: 'outline', // Subtler outlined button that integrates cleanly with our premium dark layout
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: clampedWidth,
          logo_alignment: 'left',
        }
      )
    } catch (err) {
      console.error('Google Sign-In initialization failed:', err)
      setTimeout(() => setError('Google Sign-In initialization failed'), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded, isConfigured, clientId, containerWidth, retryTrigger])

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

        {!isConfigured ? (
          /* Error State: Google Sign-In not configured */
          <div className="w-full py-3.5 px-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center flex flex-col items-center justify-center gap-2 select-text">
            <span className="material-symbols-outlined text-rose-400 text-2xl">error</span>
            <p className="text-white text-xs font-bold uppercase tracking-wider">Google Sign-In is not configured</p>
            <p className="text-[10px] text-on-surface-variant/85 max-w-[280px] leading-relaxed">
              Google Client ID is missing. Please set VITE_GOOGLE_CLIENT_ID in your environment variables.
            </p>
          </div>
        ) : scriptFailed ? (
          /* Error State: Google Script failed to load */
          <div className="w-full py-3.5 px-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-rose-400 text-2xl">error_outline</span>
            <p className="text-white text-xs font-bold uppercase tracking-wider">Failed to load Google Service</p>
            <p className="text-[10px] text-on-surface-variant/85 max-w-[280px] leading-relaxed">
              Unable to load the Google Identity Sign-In script. Please check your connection.
            </p>
            <button
              type="button"
              onClick={() => {
                setScriptFailed(false)
                setRetryTrigger(prev => prev + 1)
              }}
              className="mt-1 px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all text-white rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : !scriptLoaded ? (
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
            <div ref={buttonRef} className="w-full flex justify-center" style={{ maxWidth: `${clampedWidth}px` }} />
          </div>
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
