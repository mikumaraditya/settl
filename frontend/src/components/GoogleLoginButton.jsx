import { useEffect, useRef, useState } from 'react'
import axios from '../api/axios'

export default function GoogleLoginButton({ onLoginSuccess, onError }) {
  const buttonRef = useRef(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(!!window.google?.accounts?.id)
  const [scriptFailed, setScriptFailed] = useState(false)

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
      const errMsg = err.response?.data?.message || 'Mock Google Login failed'
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

    const initializeGoogleSignIn = () => {
      if (!window.google?.accounts?.id) return
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
        })

        window.google.accounts.id.renderButton(
          buttonRef.current,
          {
            theme: 'filled_black',
            size: 'large',
            text: 'signin_with',
            shape: 'pill',
            width: buttonRef.current?.offsetWidth || 320,
          }
        )
      } catch (err) {
        console.error('Google Sign-In initialization failed:', err)
        setScriptFailed(true)
      }
    }

    if (window.google?.accounts?.id) {
      initializeGoogleSignIn()
      return
    }

    const checkGoogleScript = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(checkGoogleScript)
        setScriptLoaded(true)
        initializeGoogleSignIn()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, isConfigured])

  // Show a beautiful, fully functional mock button if not configured or if script failed to load
  if (!isConfigured || scriptFailed) {
    return (
      <div className="w-full flex flex-col items-center gap-2">
        <button
          onClick={handleMockLogin}
          disabled={loading}
          className="w-full max-w-xs py-3 px-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white font-extrabold text-xs uppercase tracking-wider active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-lg shadow-black/10 disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? (
            <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
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
          {loading ? 'Signing In...' : 'Sign in with Google (Demo)'}
        </button>
        <span className="text-[9px] text-on-surface-variant/40 text-center max-w-xs leading-normal">
          {!isConfigured 
            ? "Google Sign-In Client ID not configured. Using Demo login flow."
            : "Google script blocked/failed. Using Demo login flow."}
        </span>
        {error && (
          <p className="text-[#f87171] text-[10px] font-bold uppercase tracking-wider animate-pulse mt-1">{error}</p>
        )}
      </div>
    )
  }

  if (isConfigured && !scriptLoaded) {
    return (
      <div className="w-full flex flex-col items-center gap-2">
        <div className="w-full max-w-xs h-[40px] bg-white/5 border border-white/5 rounded-full animate-pulse flex items-center justify-center gap-2">
          <div className="w-4 h-4 bg-white/15 rounded-full" />
          <div className="h-3 bg-white/10 rounded w-24" />
        </div>
        <span className="text-[9px] text-on-surface-variant/40 text-center">
          Loading Google Sign-in...
        </span>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div ref={buttonRef} className="w-full flex justify-center min-h-[40px]" />
      <button 
        onClick={handleMockLogin}
        className="text-[10px] text-secondary hover:underline cursor-pointer font-bold uppercase tracking-wider mt-1 opacity-70 hover:opacity-100 transition-all"
      >
        Sign in with Demo Account
      </button>
      {error && (
        <p className="text-[#f87171] text-[10px] font-bold uppercase tracking-wider animate-pulse">{error}</p>
      )}
    </div>
  )
}
