import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import axios from '../api/axios'
import { useAuth } from '../context/AuthContext'
import AuthShell from '../components/AuthShell'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { markEmailVerified, login, user } = useAuth()
  const token = searchParams.get('token')
  const [status, setStatus] = useState(() => token ? 'verifying' : 'error')
  const [errorMsg, setErrorMsg] = useState(() => token ? '' : 'No verification token was found in this link.')
  const called = useRef(false)

  useEffect(() => {
    if (!token || called.current) return
    called.current = true
    let redirectTimer

    axios.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(({ data }) => {
        if (data?.token) login(data)
        else markEmailVerified()
        setStatus('success')
        redirectTimer = window.setTimeout(() => navigate('/dashboard', { replace: true }), 3000)
      })
      .catch(err => {
        setStatus('error')
        setErrorMsg(err.response?.data?.message || 'Verification failed. The link may have expired.')
      })

    return () => {
      if (redirectTimer) window.clearTimeout(redirectTimer)
    }
  }, [token, login, markEmailVerified, navigate])

  return (
    <AuthShell
      eyebrow="Account security"
      title={status === 'success' ? 'Your email is verified' : status === 'error' ? 'We could not verify that link' : 'Confirming your email'}
      description={status === 'success' ? 'Your Settl account is ready. You can continue to your group workspace.' : status === 'error' ? 'The verification link may be expired or already used. You can return to sign in and request another verification email if needed.' : 'We are checking your secure verification link. This usually takes just a moment.'}
      footer={status === 'success' ? <>Taking you to your workspace… <Link to="/dashboard">Continue now</Link></> : status === 'error' ? <>Need to try again? <Link to={user ? '/profile' : '/login'}>{user ? 'Return to your profile' : 'Go to sign in'}</Link></> : null}
    >
      <div className="auth-state-panel">
        {status === 'verifying' && (
          <>
            <span className="auth-state-icon auth-state-info"><span className="material-symbols-outlined animate-spin">progress_activity</span></span>
            <h2>Verifying link</h2>
            <p>Please keep this page open while we confirm your email address.</p>
            <div className="auth-progress-track"><span /></div>
          </>
        )}
        {status === 'success' && (
          <>
            <span className="auth-state-icon auth-state-success"><span className="material-symbols-outlined">check_circle</span></span>
            <h2>Email verified successfully</h2>
            <p>Your email address is confirmed. Your account can now use Settl without email-verification restrictions.</p>
            <Link to="/dashboard" className="auth-submit">Go to dashboard <span className="material-symbols-outlined">arrow_forward</span></Link>
          </>
        )}
        {status === 'error' && (
          <>
            <span className="auth-state-icon auth-state-error"><span className="material-symbols-outlined">error</span></span>
            <h2>Verification unsuccessful</h2>
            <p className="auth-state-error-copy">{errorMsg}</p>
            <div className="auth-state-actions">
              {user && <Link to="/profile" className="auth-submit">Back to profile</Link>}
              <Link to="/login" className="auth-secondary-action">Back to sign in</Link>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  )
}
