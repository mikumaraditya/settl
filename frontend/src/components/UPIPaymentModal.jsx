import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export default function UPIPaymentModal({ transaction, onClose, onPaymentInitiated }) {
  const { to, amount } = transaction

  const [copied, setCopied]                 = useState(false)
  const [confirmed, setConfirmed]           = useState(false)
  const [isMobile, setIsMobile]             = useState(false)
  const paymentAttemptedRef                 = useRef(false)
  const leaveTimeRef                        = useRef(null)
  const listenerAttachedRef                 = useRef(false)

  const upiUri = `upi://pay?pa=${encodeURIComponent(to.upiId)}&pn=${encodeURIComponent(to.name)}&am=${amount}&cu=INR&tn=${encodeURIComponent('Settling on Settl')}`

  // Check if screen width indicates a mobile/portrait layout
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // ── visibilitychange — fires when user returns from UPI app ──────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!paymentAttemptedRef.current) return

        const timeAway = leaveTimeRef.current
          ? Date.now() - leaveTimeRef.current
          : 0

        // Must have been away 5s – 5min (indicating they successfully handed off to UPI App)
        if (timeAway >= 5000 && timeAway <= 5 * 60 * 1000) {
          document.removeEventListener('visibilitychange', handleVisibility)
          listenerAttachedRef.current = false
          setTimeout(() => onPaymentInitiated(), 500)
        }
      } else {
        leaveTimeRef.current = Date.now()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    listenerAttachedRef.current = true

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      listenerAttachedRef.current = false
    }
  }, [onPaymentInitiated])

  // ── Open UPI app via deep link ───────────────────────────────────────────
  const handleOpenUPIApp = () => {
    paymentAttemptedRef.current = true
    leaveTimeRef.current = Date.now()
    window.location.href = upiUri
  }

  // ── Copy UPI ID to clipboard ─────────────────────────────────────────────
  const handleCopy = () => {
    navigator.clipboard.writeText(to.upiId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-card relative w-full max-w-sm rounded-t-3xl md:rounded-3xl border border-white/10 flex flex-col gap-5 p-6 animate-in slide-in-from-bottom md:zoom-in-95 duration-200 overflow-hidden !bg-white dark:!bg-[#0a0f1d]">
        {/* Background gradient orb */}
        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-blue-500/5 blur-xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-extrabold text-white">
              Pay ₹{amount.toLocaleString('en-IN')}
            </h2>
            <p className="text-xs mt-0.5 text-slate-400 font-semibold">
              to <span className="font-bold text-white">{to.name}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-pointer text-white"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
 
        {/* Divider */}
        <div className="h-px bg-white/5" />

        {isMobile ? (
          /* ─────────────────────────────────────────────────────────────
             MOBILE LAYOUT: Hide QR Code. Massive CTA deep link + Easy Copy
             ───────────────────────────────────────────────────────────── */
          <div className="flex flex-col gap-4">
            <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
              Open your banking app to transfer money
            </p>

            {/* Massive Deep Link Action Button */}
            <button
              onClick={handleOpenUPIApp}
              className="w-full h-14 rounded-2xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.97] cursor-pointer shadow-lg shadow-blue-500/20 bg-blue-500 hover:brightness-110 text-white border border-blue-500/10"
            >
              <span className="material-symbols-outlined text-[20px]">bolt</span>
              Pay via UPI App
            </button>

            {/* Faint Divider */}
            <div className="h-px bg-white/5 my-1" />

            {/* One-Handed VPA Copying (Large target boundary) */}
            <button
              onClick={handleCopy}
              className={`w-full h-14 rounded-2xl flex items-center justify-between px-4 transition-all active:scale-[0.97] cursor-pointer border ${
                copied 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <div className="text-left min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-0.5 leading-none">
                  UPI ID (Tap to Copy)
                </span>
                <span className="text-white text-xs font-mono font-bold block mt-0.5 truncate max-w-[200px]">
                  {to.upiId}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="material-symbols-outlined text-[16px]">
                  {copied ? 'check' : 'content_copy'}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider">{copied ? 'Copied' : 'Copy'}</span>
              </div>
            </button>
          </div>
        ) : (
          /* ─────────────────────────────────────────────────────────────
             DESKTOP LAYOUT: Show QR Code + Side Buttons
             ───────────────────────────────────────────────────────────── */
          <div className="flex flex-col gap-4">
            {/* QR Code */}
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-2xl p-4 bg-white shadow-md shadow-white/5 flex items-center justify-center">
                <QRCodeSVG
                  value={upiUri}
                  size={180}
                  bgColor="#ffffff"
                  fgColor="#0a0f1d"
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Scan with any UPI app
              </p>
            </div>

            {/* OR divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">OR</span>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            {/* UPI ID + Copy */}
            <div className="flex items-center justify-between rounded-2xl px-4 py-3 gap-3 bg-white/5 border border-white/10">
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                  UPI ID
                </p>
                <p className="text-xs font-mono font-bold text-white truncate select-all">
                  {to.upiId}
                </p>
              </div>
              <button
                onClick={handleCopy}
                className={`flex-shrink-0 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all cursor-pointer border ${
                  copied 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">
                  {copied ? 'check' : 'content_copy'}
                </span>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {/* Open UPI App link button */}
            <button
              onClick={handleOpenUPIApp}
              className="w-full py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-md bg-blue-500 text-white border border-blue-500/20 hover:brightness-110"
            >
              <span className="material-symbols-outlined text-[16px]">bolt</span>
              Open UPI App
            </button>
          </div>
        )}

        {/* Action Confirmation Section (Always visible) */}
        <div className="flex flex-col gap-4 mt-1">
          {/* Already paid divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Already paid?</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {/* Manual "I have completed payment" button */}
          <button
            onClick={() => {
              setConfirmed(true)
              setTimeout(() => onPaymentInitiated(), 400)
            }}
            className={`w-full h-12 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer border transition-all ${
              confirmed 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-md shadow-emerald-500/5' 
                : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: ` 'FILL' ${confirmed ? 1 : 0}` }}>
              check_circle
            </span>
            I have completed the payment
          </button>
        </div>
      </div>
    </div>
  )
}
