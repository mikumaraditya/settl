import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import axios from '../api/axios'
import UpiConfirmModal from '../components/UpiConfirmModal'

export default function Profile() {
  const { user, login, logout } = useAuth()
  const navigate = useNavigate()

  // ── Profile form ──────────────────────────────────────────────────────────
  const [name,  setName]  = useState(user?.name  || '')
  const [upiId, setUpiId] = useState(user?.upiId || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileError,   setProfileError]   = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)



  // ── Password form ─────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew,     setShowNew]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [savingPwd,   setSavingPwd]   = useState(false)
  const [pwdSuccess,  setPwdSuccess]  = useState('')
  const [pwdError,    setPwdError]    = useState('')

  const submitProfile = async () => {
    setSavingProfile(true)
    setProfileSuccess('')
    setProfileError('')
    try {
      const { data } = await axios.put('/auth/profile', { name: name.trim(), upiId: upiId.trim() })
      login(data)  // update AuthContext + localStorage with fresh data
      setProfileSuccess('Profile updated successfully!')
      setTimeout(() => setProfileSuccess(''), 3000)
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleProfileSave = (e) => {
    e.preventDefault()
    if (!name.trim()) return setProfileError('Name cannot be empty')
    if (!upiId.trim()) return setProfileError('UPI ID is required')
    
    const upiRegex = /^[a-zA-Z0-9.\-_]{3,50}@(oksbi|paytm|ybl|barodampay|okaxis|okhdfcbank|okicici|okbizaxis|ibl|axl|upi|apl|rapl|yapl|sbi|hdfcbank|icici|axisbank|yesbank|pnb|cnrb|indianbank|iob|unionbank|uboi|idfcbank|federal|kotak|kmbl|boi|uco|cbin|centralbank|dbs|hsbc|sc|citi|postbank|ippb|airtel|airtelmail|jio|cred|slice|sliceaxis|fi|jupiter|waaxis|wasbi|waicici|wahdfc|bob)$/i
    if (!upiRegex.test(upiId.trim())) {
      return setProfileError('Please enter a valid UPI ID with a valid bank handle (e.g. name@oksbi, name@paytm, name@ybl)')
    }

    if (upiId.trim() !== user?.upiId) {
      setShowConfirmModal(true)
    } else {
      submitProfile()
    }
  }

  const handleConfirmProfileSave = () => {
    setShowConfirmModal(false)
    submitProfile()
  }



  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPwdSuccess('')
    setPwdError('')
    if (newPassword !== confirmPassword) return setPwdError('New passwords do not match')
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
    if (!passwordRegex.test(newPassword)) {
      return setPwdError('New password must be at least 8 characters long, and contain at least one uppercase letter, one lowercase letter, one number, and one special character.')
    }
    setSavingPwd(true)
    try {
      await axios.put('/auth/change-password', { currentPassword, newPassword })
      setPwdSuccess('Password changed! Please log in again.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => {
        logout()
        navigate('/login')
      }, 2000)
    } catch (err) {
      setPwdError(err.response?.data?.message || 'Failed to change password')
    } finally {
      setSavingPwd(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-white flex flex-col relative overflow-hidden md:pl-20 lg:pl-64 pb-20 md:pb-0 pt-14 md:pt-0">
      {/* Background Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      
      <Navbar />

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6 relative z-10">

        {/* Back */}
        <button
          onClick={() => navigate('/dashboard')}
          className="text-on-surface-variant hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer self-start hover:translate-x-[-2px]"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Dashboard
        </button>

        {/* Header */}
        <div className="glass-card p-6 rounded-3xl border border-white/5 flex items-center gap-5 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-blue-500/5 blur-xl pointer-events-none" />
          
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-2xl shadow-md flex-shrink-0">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-white truncate">{user?.name}</h1>
            <p className="text-xs text-on-surface-variant font-semibold mt-0.5 truncate">{user?.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {user?.isEmailVerified ? (
                <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-xl flex-shrink-0">
                  <span className="material-symbols-outlined text-[13px] flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                  Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-xl flex-shrink-0">
                  <span className="material-symbols-outlined text-[13px] flex-shrink-0">warning</span>
                  Unverified Email
                </span>
              )}
              {user?.upiId && (
                <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-on-surface-variant bg-white/5 px-2.5 py-1 rounded-xl border border-white/5 min-w-0 max-w-full">
                  <span className="material-symbols-outlined text-[13px] flex-shrink-0">account_balance</span>
                  <span className="truncate">{user.upiId}</span>
                </span>
              )}
            </div>
          </div>
        </div>



        {/* ── Edit Profile Card ─────────────────────────────────────────── */}
        <div className="glass-card rounded-3xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3 bg-white/[0.01]">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px] text-blue-400">person</span>
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white">Edit Profile</h2>
              <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider mt-0.5">Update Name and UPI Details</p>
            </div>
          </div>

          <form onSubmit={handleProfileSave} className="p-6 flex flex-col gap-5">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">Name</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant pointer-events-none">badge</span>
                <input
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setProfileError('') }}
                  placeholder="Your full name"
                  className="w-full pl-11 pr-4 py-3 rounded-2xl text-xs text-white bg-white/[0.02] border border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-white/20"
                />
              </div>
            </div>

            {/* UPI ID */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">UPI ID <span className="text-[#f87171]">*</span></label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant pointer-events-none">account_balance</span>
                <input
                  type="text"
                  value={upiId}
                  onChange={e => setUpiId(e.target.value)}
                  placeholder="yourname@upi"
                  required
                  className="w-full pl-11 pr-4 py-3 rounded-2xl text-xs text-white bg-white/[0.02] border border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-white/20"
                />
              </div>
              <p className="text-[10px] text-on-surface-variant/70 font-semibold ml-1">Used when others need to settle payments with you</p>
            </div>

            {/* Feedback */}
            {profileSuccess && (
              <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl px-4 py-3 text-xs font-semibold animate-in fade-in duration-200">
                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                {profileSuccess}
              </div>
            )}
            {profileError && (
              <div className="flex items-center gap-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl px-4 py-3 text-xs font-semibold animate-in fade-in duration-200">
                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                {profileError}
              </div>
            )}

            <button
              type="submit"
              disabled={savingProfile}
              className="self-start flex items-center gap-2 bg-blue-500 text-white px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider border border-blue-500/20 shadow-md shadow-blue-500/10 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {savingProfile
                ? <><span className="material-symbols-outlined text-[14px] animate-spin">sync</span> Saving...</>
                : <><span className="material-symbols-outlined text-[14px]">save</span> Save Changes</>}
            </button>
          </form>
        </div>

        {/* ── Change Password Card ──────────────────────────────────────── */}
        <div className="glass-card rounded-3xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3 bg-white/[0.01]">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px] text-amber-400">lock</span>
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white">Change Password</h2>
              <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider mt-0.5">Your session will end after password change</p>
            </div>
          </div>

          <form onSubmit={handlePasswordChange} className="p-6 flex flex-col gap-5">
            {/* Password Fields */}
            {[
              { label: 'Current Password', value: currentPassword, setter: setCurrentPassword, show: showCurrent, toggle: setShowCurrent, placeholder: 'Verify current password' },
              { label: 'New Password',     value: newPassword,     setter: setNewPassword,     show: showNew,     toggle: setShowNew,     placeholder: 'At least 6 characters' },
              { label: 'Confirm New Password', value: confirmPassword, setter: setConfirmPassword, show: showConfirm, toggle: setShowConfirm, placeholder: 'Repeat new password' },
            ].map(field => (
              <div key={field.label} className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">{field.label}</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant pointer-events-none">lock</span>
                  <input
                    type={field.show ? 'text' : 'password'}
                    value={field.value}
                    onChange={e => { field.setter(e.target.value); setPwdError(''); setPwdSuccess('') }}
                    placeholder={field.placeholder}
                    required
                    className="w-full pl-11 pr-12 py-3 rounded-2xl text-xs text-white bg-white/[0.02] border border-white/10 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all placeholder:text-white/20"
                  />
                  <button
                    type="button"
                    onClick={() => field.toggle(!field.show)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-white transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">{field.show ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>
            ))}

            {/* Feedback */}
            {pwdSuccess && (
              <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl px-4 py-3 text-xs font-semibold animate-in fade-in duration-200">
                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                {pwdSuccess}
              </div>
            )}
            {pwdError && (
              <div className="flex items-center gap-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl px-4 py-3 text-xs font-semibold animate-in fade-in duration-200">
                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                {pwdError}
              </div>
            )}

            <button
              type="submit"
              disabled={savingPwd}
              className="self-start flex items-center gap-2 bg-amber-500 text-white px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider border border-amber-500/20 shadow-md shadow-amber-500/10 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {savingPwd
                ? <><span className="material-symbols-outlined text-[14px] animate-spin">sync</span> Changing...</>
                : <><span className="material-symbols-outlined text-[14px]">lock_reset</span> Change Password</>}
            </button>
          </form>
        </div>

        {/* ── Danger Zone ───────────────────────────────────────────────── */}
        <div className="glass-card rounded-3xl border border-rose-500/15 overflow-hidden">
          <div className="px-6 py-4 border-b border-rose-500/10 flex items-center gap-3 bg-white/[0.01]">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px] text-rose-400">logout</span>
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white">Sign Out</h2>
              <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider mt-0.5">End your current session</p>
            </div>
          </div>
          <div className="p-6">
            <button
              onClick={() => { logout(); navigate('/login') }}
              className="flex items-center gap-2 border border-rose-500/20 text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              Sign Out
            </button>
          </div>
        </div>

      </main>
      <UpiConfirmModal
        open={showConfirmModal}
        upiId={upiId}
        onConfirm={handleConfirmProfileSave}
        onCancel={() => setShowConfirmModal(false)}
      />
    </div>
  )
}
