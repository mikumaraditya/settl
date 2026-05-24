import { useState } from 'react'
import axios from '../api/axios'

export default function ConfirmPaymentPopup({ transaction, groupId, onConfirm, onCancel }) {
  const { to, amount } = transaction

  const [utr, setUtr]         = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // Only allow digits, max 22 characters (UPI UTRs are 12–22 digits)
  const handleUtrChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 22)
    setUtr(val)
  }

  const handleConfirm = async () => {
    setLoading(true)
    setError('')
    try {
      await axios.post('/settlements/settle', {
        groupId,
        toUserId: to._id,
        amount,
        transactionId: utr || '',
      })
      onConfirm()
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="glass-card w-full max-w-sm rounded-3xl border border-white/10 flex flex-col gap-5 p-6 animate-in zoom-in-95 duration-200 relative overflow-hidden">
        {/* Background gradient orb */}
        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-blue-500/5 blur-xl pointer-events-none" />

        {/* Icon + Title */}
        <div className="flex flex-col items-center gap-3 text-center pt-2">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl shadow-md shadow-blue-500/5">
            <span className="material-symbols-outlined text-[28px] text-blue-400" style={{ fontVariationSettings: "'FILL' 1" }}>
              payments
            </span>
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white">
              Did you complete the payment?
            </h2>
            <p className="text-xs mt-1 text-on-surface-variant font-semibold">
              ₹<span className="font-bold text-white">
                {amount.toLocaleString('en-IN')}
              </span>
              {' '}to{' '}
              <span className="font-bold text-white">{to.name}</span>
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/5" />

        {/* UTR input */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between ml-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Transaction ID (UTR)
              <span className="ml-1 normal-case font-semibold text-on-surface-variant/70">
                — Optional
              </span>
            </label>
            <span className="text-xs font-mono font-bold text-on-surface-variant">
              {utr.length}/22
            </span>
          </div>

          <input
            type="text"
            inputMode="numeric"
            value={utr}
            onChange={handleUtrChange}
            placeholder="Enter UTR number (12–22 digits)"
            className="w-full bg-white/[0.02] border border-white/10 focus:border-blue-500 focus:ring-0 rounded-2xl px-4 py-3 text-xs font-mono text-white placeholder:text-white/20 transition-all"
          />

          <p className="text-[10px] text-on-surface-variant/80 leading-normal ml-1 font-medium">
            Find this in your UPI app under payment history. Helps resolve disputes later.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl px-4 py-3 text-xs text-rose-400 animate-in fade-in duration-200">
            <span className="material-symbols-outlined text-[16px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            <span className="font-semibold leading-normal">{error}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {/* Yes I Paid */}
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-md bg-blue-500 text-white border border-blue-500/20 hover:brightness-110"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined text-[15px] animate-spin">sync</span>
                Submitting...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                Yes, I Paid
              </>
            )}
          </button>

          {/* Not Yet — go back to QR modal */}
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-white/10 text-white hover:bg-white/5 transition-all active:scale-95 cursor-pointer disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[15px]">arrow_back</span>
            Not Yet — Go Back
          </button>
        </div>
      </div>
    </div>
  )
}
