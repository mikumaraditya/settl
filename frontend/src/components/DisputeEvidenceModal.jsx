import { useRef, useState } from 'react'
import axios from '../api/axios'

export default function DisputeEvidenceModal({ settlement, onClose, onEvidenceSubmitted }) {
  const { to, amount, disputeReason, _id } = settlement

  const [utr, setUtr]           = useState('')
  const [file, setFile]         = useState(null)
  const [preview, setPreview]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [aiResult, setAiResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef            = useRef(null)

  const handleUtrChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 22)
    setUtr(val)
  }

  const processFile = (selected) => {
    if (!selected) return
    if (selected.size > 5 * 1024 * 1024) { setError('Screenshot must be under 5 MB.'); return }
    setError('')
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
  }

  const handleFileChange = (e) => processFile(e.target.files[0])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    processFile(e.dataTransfer.files[0])
  }

  const handleRemoveFile = () => {
    setFile(null)
    setPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async () => {
    if (!utr.trim()) { setError('Please enter your UTR / Transaction ID.'); return }
    setError('')
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('settlementId', _id)
      formData.append('utrNumber', utr)
      if (file) formData.append('screenshot', file)
      const { data } = await axios.post('/settlements/dispute/evidence', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAiResult({ aiVerified: data.aiVerified, aiReason: data.aiReason, photoOfScreen: data.photoOfScreen })
      setTimeout(() => onEvidenceSubmitted(data), 2800)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit evidence. Please try again.')
      setLoading(false)
    }
  }

  // ── AI Result screen ──────────────────────────────────────────────────────
  if (aiResult) {
    const isPhotoOfScreen = aiResult.photoOfScreen
    const verified        = aiResult.aiVerified
    const color           = verified ? '#4ade80' : isPhotoOfScreen ? '#f87171' : '#fbbf24'
    const bgColor         = verified ? 'rgba(74, 222, 128, 0.1)' : isPhotoOfScreen ? 'rgba(248, 113, 113, 0.1)' : 'rgba(251, 191, 36, 0.1)'
    const borderColor     = verified ? 'rgba(74, 222, 128, 0.25)' : isPhotoOfScreen ? 'rgba(248, 113, 113, 0.25)' : 'rgba(251, 191, 36, 0.25)'
    const icon            = verified ? 'verified' : isPhotoOfScreen ? 'no_photography' : 'pending_actions'
    const title           = verified ? 'Payment Verified!' : isPhotoOfScreen ? 'Image Rejected' : 'Sent for Review'
    const sub             = verified ? 'AI confirmed your payment. Settlement is complete.' : aiResult.aiReason

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-modal animate-in fade-in duration-200">
        <div className="glass-card w-full max-w-xs rounded-3xl border border-white/10 flex flex-col items-center gap-6 p-8 text-center animate-in zoom-in-95 duration-300 shadow-2xl">
          {/* Animated ring */}
          <div className="relative flex items-center justify-center">
            <div className="absolute w-24 h-24 rounded-full animate-ping opacity-15"
              style={{ backgroundColor: color }} />
            <div className="w-20 h-20 rounded-full flex items-center justify-center border-2"
              style={{ backgroundColor: bgColor, borderColor: borderColor }}>
              <span className="material-symbols-outlined text-[40px]"
                style={{ color, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-base font-extrabold text-on-surface leading-tight">{title}</p>
            <p className="text-xs leading-relaxed text-on-surface-variant/80 font-semibold">{sub}</p>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
            <div className="h-full rounded-full"
              style={{
                backgroundColor: color,
                width: '100%',
                animation: 'progressBar 2.8s linear forwards'
              }} />
          </div>

          <p className="text-[10px] font-bold text-on-surface-variant/40 tracking-wider uppercase">Closing automatically…</p>
        </div>
        <style>{`@keyframes progressBar { from { width: 100%; } to { width: 0%; } }`}</style>
      </div>
    )
  }

  const utrValid = utr.length >= 12

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-modal animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}>

      <div className="glass-card w-full max-w-md rounded-3xl border border-white/10 flex flex-col animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden shadow-2xl">
        {/* ── Top colour bar ───────────────────────────────────────────── */}
        <div className="h-1.5 w-full rounded-t-3xl bg-gradient-to-r from-amber-500 to-rose-500" />

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-500/10 border border-amber-500/20 text-[#fbbf24]">
              <span className="material-symbols-outlined text-[20px]"
                style={{ fontVariationSettings: "'FILL' 1" }}>gavel</span>
            </div>
            <div>
              <h2 className="text-base font-black text-white leading-tight">Payment Disputed</h2>
              <p className="text-xs mt-0.5 text-on-surface-variant font-medium">
                Prove your <span className="font-bold text-[#fbbf24]">₹{amount.toLocaleString('en-IN')}</span> payment
              </p>
            </div>
          </div>
          {!loading && (
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all cursor-pointer hover:bg-white/5 text-on-surface-variant hover:text-on-surface">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* ── Scrollable Body ────────────────────────────────────────── */}
        <div className="flex-grow overflow-y-auto custom-scrollbar flex flex-col gap-5 px-6 py-5">
          {/* ── Dispute reason card ───────────────────────────────────── */}
          <div className="rounded-2xl p-4 flex items-start gap-3 bg-amber-500/5 border border-amber-500/15">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 bg-amber-500/10 border border-amber-500/25">
              <span className="material-symbols-outlined text-[16px] text-[#fbbf24]"
                style={{ fontVariationSettings: "'FILL' 1" }}>format_quote</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#fbbf24] mb-1">
                {to.name} says
              </p>
              <p className="text-sm text-white font-medium leading-snug italic">
                "{disputeReason || 'No reason provided'}"
              </p>
            </div>
          </div>

          {/* ── UTR input ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between ml-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                UTR / Transaction ID <span className="text-[#f87171]">*</span>
              </label>
              <span className={`text-[10px] font-mono font-bold ${utrValid ? 'text-green-500' : 'text-on-surface-variant/60'}`}>
                {utr.length}/22
              </span>
            </div>
            <div className="relative">
              <span className={`material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] pointer-events-none transition-colors ${utrValid ? 'text-green-500' : 'text-on-surface-variant/40'}`}>tag</span>
              <input
                type="text"
                inputMode="numeric"
                value={utr}
                onChange={handleUtrChange}
                placeholder="e.g. 421234567890"
                disabled={loading}
                className={`w-full rounded-2xl pl-11 pr-4 py-3.5 text-xs font-mono bg-white/5 border outline-none transition-all placeholder:text-on-surface-variant/30 text-on-surface ${
                  utrValid
                    ? 'border-green-500/30 focus:border-green-500 focus:ring-2 focus:ring-green-500/10'
                    : 'border-white/10 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10'
                }`}
              />
            </div>
            <p className="text-[10px] text-on-surface-variant/70 flex items-center gap-1 font-semibold ml-1">
              <span className="material-symbols-outlined text-[13px] text-on-surface-variant/60">info</span>
              UPI app → Payment History → Transaction Details
            </p>
          </div>

          {/* ── Screenshot upload ─────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between ml-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Payment Screenshot
              </label>
              <span className="text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-lg bg-secondary/10 border border-secondary/20 text-secondary">
                Recommended
              </span>
            </div>

            {preview ? (
              <div className="relative rounded-2xl overflow-hidden border border-green-500/25 bg-green-500/5 flex flex-col">
                <img src={preview} alt="Payment screenshot" className="w-full max-h-48 object-contain bg-white/5" />
                {!loading && (
                  <button onClick={handleRemoveFile}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-110 bg-[#0b1c30]/80 border border-[#f87171]/40 text-[#f87171] hover:bg-[#b91c1c] hover:text-white hover:border-transparent duration-200">
                    <span className="material-symbols-outlined text-[15px]">close</span>
                  </button>
                )}
                <div className="px-4 py-2.5 flex items-center gap-2 border-t border-green-500/20 bg-green-500/5">
                  <span className="material-symbols-outlined text-[16px] text-green-500 font-bold animate-pulse-glow" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span className="text-xs truncate font-semibold text-green-500">{file?.name}</span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                disabled={loading}
                className={`w-full py-6 rounded-2xl flex flex-col items-center gap-3 transition-all cursor-pointer disabled:opacity-40 border-2 border-dashed group ${
                  dragOver
                    ? 'bg-secondary/15 border-secondary shadow-lg shadow-secondary/5 scale-[1.01]'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-[1.002]'
                }`}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-secondary/10 border border-secondary/20 text-secondary transition-transform group-hover:scale-110 duration-200">
                  <span className="material-symbols-outlined text-[20px]">upload_file</span>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-on-surface">Drop screenshot here</p>
                  <p className="text-[10px] text-on-surface-variant/60 mt-0.5 font-medium">or click to browse · JPG, PNG · max 5 MB</p>
                </div>
              </button>
            )}

            <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" onChange={handleFileChange} className="hidden" />

            {/* AI badge */}
            <div className="flex items-start gap-3 rounded-2xl px-4 py-3 bg-secondary/5 border border-secondary/15">
              <span className="material-symbols-outlined text-[18px] text-secondary flex-shrink-0 mt-0.5 animate-pulse"
                style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
              <p className="text-[11px] leading-relaxed text-on-surface-variant font-medium">
                {file
                  ? <><span className="font-bold text-secondary">Gemini AI</span> will verify your screenshot — only genuine UPI app screenshots are accepted.</>
                  : <>Upload a screenshot for <span className="font-bold text-secondary">instant AI verification</span>. Without it, {to.name} reviews manually.</>
                }
              </p>
            </div>
          </div>

          {/* ── Error ─────────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-2xl px-4 py-3 bg-red-500/10 border border-red-500/20 text-[#f87171] animate-in fade-in duration-200">
              <span className="material-symbols-outlined text-[18px] flex-shrink-0 mt-0.5"
                style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
              <p className="text-xs font-semibold leading-normal">{error}</p>
            </div>
          )}
        </div>

        {/* ── Fixed Footer Action buttons ───────────────────────────── */}
        <div className="px-6 pb-6 pt-3 border-t border-white/5 flex flex-col gap-2 flex-shrink-0">
          <button
            onClick={handleSubmit}
            disabled={loading || !utr.trim()}
            className={`w-full py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              loading || !utr.trim()
                ? 'bg-white/5 border border-white/10 text-on-surface-variant/50'
                : 'bg-gradient-to-r from-secondary to-blue-600 text-white shadow-lg shadow-secondary/20 hover:brightness-110'
            }`}
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                {file ? 'AI is verifying…' : 'Submitting…'}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                Submit Evidence
              </>
            )}
          </button>

          {!loading && (
            <button onClick={onClose}
              className="w-full py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer hover:bg-white/5 text-on-surface-variant hover:text-on-surface">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
