import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export default function UPIPaymentModal({ transaction, onClose, onPaymentInitiated }) {
  const { to, amount } = transaction

  const [copied, setCopied]                 = useState(false)
  const [confirmed, setConfirmed]           = useState(false)
  const paymentAttemptedRef                 = useRef(false)
  const leaveTimeRef                        = useRef(null)
  const listenerAttachedRef                 = useRef(false)

  const upiUri = `upi://pay?pa=${encodeURIComponent(to.upiId)}&pn=${encodeURIComponent(to.name)}&am=${amount}&cu=INR&tn=${encodeURIComponent('Settling on Settl')}`

  // ── visibilitychange — fires when user returns from UPI app ──────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Only trigger if user actually left (attempted payment via deep link)
        if (!paymentAttemptedRef.current) return

        const timeAway = leaveTimeRef.current
          ? Date.now() - leaveTimeRef.current
          : 0

        // Must have been away 5s – 5min (not just a quick accidental switch)
        if (timeAway >= 5000 && timeAway <= 5 * 60 * 1000) {
          document.removeEventListener('visibilitychange', handleVisibility)
          listenerAttachedRef.current = false
          setTimeout(() => onPaymentInitiated(), 500)
        }
      } else {
        // User is leaving — record the time
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
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-card relative w-full max-w-sm rounded-3xl border border-white/10 flex flex-col gap-5 p-6 animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Background gradient orb */}
        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-blue-500/5 blur-xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-extrabold text-white">
              Pay ₹{amount.toLocaleString('en-IN')}
            </h2>
            <p className="text-xs mt-0.5 text-on-surface-variant font-semibold">
              to <span className="font-bold text-white">{to.name}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-pointer text-white"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
 
        {/* Divider */}
        <div className="h-px bg-white/5" />

        {/* QR Code */}
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl p-4 bg-white shadow-md shadow-white/5 flex items-center justify-center">
            <QRCodeSVG
              value={upiUri}
              size={200}
              bgColor="#ffffff"
              fgColor="#0a0f1d"
              level="M"
              includeMargin={false}
            />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            Scan with any UPI app
          </p>
        </div>

        {/* OR divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/5" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">OR</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        {/* UPI ID + Copy */}
        <div className="flex items-center justify-between rounded-2xl px-4 py-3 gap-3 bg-white/[0.02] border border-white/10">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-0.5">
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
                : 'bg-white/5 text-on-surface-variant border-white/5 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* Open UPI App button */}
        <button
          onClick={handleOpenUPIApp}
          className="w-full py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-md bg-blue-500 text-white border border-blue-500/20 hover:brightness-110"
        >
          <span className="material-symbols-outlined text-[16px]">bolt</span>
          Open UPI App · Pay ₹{amount.toLocaleString('en-IN')}
        </button>

        {/* Already paid divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/5" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Already paid?</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        {/* Manual "I have completed payment" button */}
        <button
          onClick={() => {
            setConfirmed(true)
            setTimeout(() => onPaymentInitiated(), 400)
          }}
          className={`w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer border transition-all ${
            confirmed 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-md shadow-emerald-500/5' 
              : 'bg-white/5 text-on-surface-variant border-white/5 hover:bg-white/10 hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: ` 'FILL' ${confirmed ? 1 : 0}` }}>
            check_circle
          </span>
          I have completed the payment
        </button>
      </div>
    </div>
  )
}
