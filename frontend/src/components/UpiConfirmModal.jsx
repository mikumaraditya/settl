import { useState } from 'react'

export default function UpiConfirmModal({ open, upiId, onConfirm, onCancel }) {
  const [checked, setChecked] = useState(false)

  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setChecked(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="modal-overlay z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="upi-confirm-modal glass-card relative w-full max-w-md md:max-w-2xl rounded-3xl border border-white/10 flex flex-col gap-6 p-6 md:p-8 animate-in zoom-in-95 duration-200 bg-[#0b1222] text-white shadow-2xl overflow-hidden">
        {/* Top Accent line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-secondary to-blue-500" />
        
        {/* Glow Orb */}
        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-amber-500/5 blur-xl pointer-events-none" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          
          {/* Left Column: Heading and UPI display */}
          <div className="flex flex-col gap-4">
            {/* Warning Icon & Title */}
            <div className="flex flex-col items-center md:items-start gap-3 text-center md:text-left pt-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-3xl shadow-md shadow-amber-500/5">
                <span className="material-symbols-outlined text-[30px] text-amber-400" style={{ fontVariationSettings: "'FILL' 1" }}>
                  warning
                </span>
              </div>
              <div>
                <h3 className="upi-confirm-heading text-lg font-extrabold text-white tracking-tight">Confirm Your UPI ID</h3>
                <p className="upi-confirm-copy text-xs mt-1.5 text-slate-400 font-semibold leading-relaxed">
                  Please double check the payment handle you entered.
                </p>
              </div>
            </div>

            {/* Highlighted UPI ID Display */}
            <div className="upi-confirm-upi-panel bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col gap-1.5">
              <span className="upi-confirm-copy text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center md:text-left leading-none">
                Entered UPI ID
              </span>
              <span className="upi-confirm-upi-value font-mono font-bold text-white select-all bg-white/5 border border-white/10 px-3.5 py-2.5 rounded-xl block text-center mt-1 text-sm tracking-wide break-all">
                {upiId}
              </span>
            </div>
          </div>

          {/* Right Column: Warnings, Checkbox, Actions */}
          <div className="flex flex-col gap-5">
            {/* Notice text */}
            <div className="upi-confirm-notice text-xs text-slate-400 font-semibold space-y-2.5 leading-relaxed bg-amber-500/[0.02] border border-amber-500/10 rounded-2xl p-4">
              <p className="text-amber-400/90 font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]">info</span>
                Crucial Notice
              </p>
              <p>
                Settl <strong className="upi-confirm-emphasis text-white">cannot verify</strong> whether this UPI ID is real, active, or actually belongs to you.
              </p>
              <p>
                All member payments will route directly to this address. There is <strong className="upi-confirm-emphasis text-white">no reversal path</strong> or way to cancel payments through the app.
              </p>
              <p>
                If you entered an incorrect handle, your group payments will be permanently lost. This is the <strong className="upi-confirm-emphasis text-white">user's responsibility</strong>, not the app's.
              </p>
            </div>

            {/* Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                  checked 
                    ? 'bg-blue-500 border-blue-500 text-white shadow-md shadow-blue-500/20' 
                    : 'border-white/20 bg-white/5 hover:border-white/30'
                }`}>
                  {checked && <span className="material-symbols-outlined text-[14px] font-black">check</span>}
                </div>
              </div>
              <span className="upi-confirm-copy text-xs text-slate-400 font-semibold leading-relaxed">
                I have double-checked this UPI ID is correct and mine, and understand the app cannot verify it.
              </span>
            </label>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 pt-1">
              <button
                onClick={onConfirm}
                disabled={!checked}
                className="w-full py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-md bg-blue-500 text-white border border-blue-500/20 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
              >
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                Confirm & Save
              </button>

              <button
                onClick={onCancel}
                className="upi-confirm-cancel w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-white/10 text-white hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
              >
                Go Back
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
