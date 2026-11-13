import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from '../api/axios'
import UpiConfirmModal from '../components/UpiConfirmModal'
import ErrorToast from '../components/ErrorToast'
import AuthShell from '../components/AuthShell'

export default function Register() {
  const navigate = useNavigate()
  const { login, user } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '', upiId: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const validatePassword = (pass) => {
    if (pass.length < 8) return false
    return /[A-Z]/.test(pass) && /[a-z]/.test(pass) && /[0-9]/.test(pass) && /[!@#$%^&*(),.?":{}|<>]/.test(pass)
  }

  const validateUpi = (upi) => /^[a-zA-Z0-9.\\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upi)

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('Enter your full name to continue.')
      return
    }
    if (!validatePassword(form.password)) {
      setError('Use 8+ characters with uppercase, lowercase, a number and a symbol.')
      return
    }
    if (!validateUpi(form.upiId.trim())) {
      setError('Enter a valid UPI ID, e.g. name@oksbi or name@paytm.')
      return
    }
    setError('')
    setShowConfirmModal(true)
  }

  const handleConfirmRegister = async () => {
    setShowConfirmModal(false)
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.post('/auth/register', { ...form, name: form.name.trim(), email: form.email.trim(), upiId: form.upiId.trim() })
      login(data)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (user) return null

  return (
    <>
      <AuthShell
        eyebrow="Create your workspace"
        title="Make shared spending simpler"
        description="Create your Settl account. Add your details once, then start organising expenses with your groups."
        footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
      >
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="name">Full name</label>
            <div className="auth-input-wrap">
              <span className="material-symbols-outlined">person</span>
              <input id="name" type="text" autoComplete="name" placeholder="Your full name" value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} required maxLength={80}/>
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="email">Email address</label>
            <div className="auth-input-wrap">
              <span className="material-symbols-outlined">mail</span>
              <input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))} required/>
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="password">Create password</label>
            <div className="auth-input-wrap">
              <span className="material-symbols-outlined">lock</span>
              <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Create a strong password" value={form.password} onChange={event => setForm(previous => ({ ...previous, password: event.target.value }))} required/>
              <button type="button" className="auth-input-action" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                <span className="material-symbols-outlined">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
            <p className="auth-field-hint">At least 8 characters, uppercase and lowercase letters, a number and a symbol.</p>
          </div>

          <div className="auth-field">
            <label htmlFor="upiId">Your UPI ID</label>
            <div className="auth-input-wrap">
              <span className="material-symbols-outlined">account_balance_wallet</span>
              <input id="upiId" type="text" autoComplete="off" placeholder="yourname@oksbi" value={form.upiId} onChange={event => setForm(previous => ({ ...previous, upiId: event.target.value }))} required/>
            </div>
            <p className="auth-field-hint">Used when group members need to pay you directly. You will confirm it before the account is created.</p>
          </div>

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? <><span className="material-symbols-outlined animate-spin">progress_activity</span> Creating account…</> : <>Continue <span className="material-symbols-outlined">arrow_forward</span></>}
          </button>
        </form>
        <div className="auth-security-note">
          <span className="material-symbols-outlined">shield_lock</span>
          Settl never asks for your UPI PIN, banking password or card credentials.
        </div>
        {error && <ErrorToast key={error} message={error} onClose={() => setError('')} />}
      </AuthShell>
      <UpiConfirmModal
        open={showConfirmModal}
        upiId={form.upiId.trim()}
        onConfirm={handleConfirmRegister}
        onCancel={() => setShowConfirmModal(false)}
      />
    </>
  )
}
