import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from '../api/axios'
import GoogleLoginButton from '../components/GoogleLoginButton'
import ErrorToast from '../components/ErrorToast'
import AuthShell from '../components/AuthShell'

export default function Login() {
  const navigate = useNavigate()
  const { login, user } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.post('/auth/login', form)
      login(data)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'We could not sign you in. Check your details and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (user) return null

  return (
    <AuthShell
      variant="login"
      eyebrow="Welcome back"
      title="Good to have you back."
      description="Sign in to pick up right where your group left off."
      footer={<>New around here? <Link to="/register">Create your Settl account <span aria-hidden>↗</span></Link></>}
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-field">
          <label htmlFor="email">Email address</label>
          <div className="auth-input-wrap">
            <span className="material-symbols-outlined">mail</span>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))}
              required
            />
          </div>
        </div>

        <div className="auth-field">
          <div className="auth-label-row">
            <label htmlFor="password">Password</label>
          </div>
          <div className="auth-input-wrap">
            <span className="material-symbols-outlined">lock</span>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={form.password}
              onChange={event => setForm(previous => ({ ...previous, password: event.target.value }))}
              required
            />
            <button type="button" className="auth-input-action" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              <span className="material-symbols-outlined">{showPassword ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading} className="auth-submit">
          {loading ? <><span className="material-symbols-outlined animate-spin">progress_activity</span> Signing in…</> : <>Sign in <span className="material-symbols-outlined">arrow_forward</span></>}
        </button>
      </form>

      <div className="auth-divider"><span>Or continue with</span></div>
      <GoogleLoginButton
        onLoginSuccess={data => { login(data); navigate('/dashboard') }}
        onError={message => setError(message)}
      />

      <div className="auth-security-note">
        <span className="material-symbols-outlined">verified_user</span>
        Your bank credentials and UPI PIN are never requested by Settl.
      </div>
      {error && <ErrorToast key={error} message={error} onClose={() => setError('')} />}
    </AuthShell>
  )
}
