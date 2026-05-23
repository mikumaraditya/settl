import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from '../api/axios'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { io } from 'socket.io-client'
import UPIPaymentModal from '../components/UPIPaymentModal'
import ConfirmPaymentPopup from '../components/ConfirmPaymentPopup'
import DisputeEvidenceModal from '../components/DisputeEvidenceModal'

export default function SettleUp() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [transactions, setTransactions]        = useState([])
  const [confirmedSettlements, setConfirmed]   = useState([])
  const [pendingRequests, setPending]          = useState([])
  const [loading, setLoading]                  = useState(true)
  const [actionLoading, setActionLoading]      = useState({})
  const [disputedSettlements, setDisputed]     = useState([])
  const [unresolvedSettlements, setUnresolved] = useState([])
  const [showPaymentModal, setShowPaymentModal]   = useState(false)
  const [showConfirmPopup, setShowConfirmPopup]   = useState(false)
  const [activeTransaction, setActiveTransaction] = useState(null)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [activeDispute, setActiveDispute]       = useState(null)
  const [disputingId, setDisputingId]               = useState(null)
  const [disputeReasonInput, setDisputeReasonInput] = useState('')

  const socketRef = useRef(null)



  const fetchData = async () => {
    try {
      const { data } = await axios.get(`/settlements/simplify/${id}`)
      setTransactions(data.transactions         || [])
      setConfirmed(data.confirmedSettlements    || [])
      setPending(data.pendingRequests           || [])
      setDisputed(data.disputedSettlements      || [])
      setUnresolved(data.unresolvedSettlements  || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const setLoading_ = (key, val) =>
    setActionLoading(prev => ({ ...prev, [key]: val }))

  const handleSettle = async (toUser, amount) => {
    const key = `settle-${toUser._id}`
    setLoading_(key, true)
    try {
      await axios.post('/settlements/settle', { groupId: id, toUserId: toUser._id, amount })
      fetchData()
    } catch (err) {
      alert(err.response?.data?.message || 'Error requesting settlement')
    } finally { setLoading_(key, false) }
  }

  const handleConfirm = async (fromUser) => {
    const key = `confirm-${fromUser._id}`
    setLoading_(key, true)
    try {
      await axios.post('/settlements/confirm', { groupId: id, fromUserId: fromUser._id })
      fetchData()
    } catch (err) {
      alert(err.response?.data?.message || 'Error confirming settlement')
    } finally { setLoading_(key, false) }
  }

  const handleCancel = async (toUser) => {
    const key = `cancel-${toUser._id}`
    setLoading_(key, true)
    try {
      await axios.delete('/settlements/settle', { data: { groupId: id, toUserId: toUser._id } })
      fetchData()
    } catch (err) {
      alert(err.response?.data?.message || 'Error cancelling request')
    } finally { setLoading_(key, false) }
  }

  const handleDispute = async (settlementId) => {
    const key = `dispute-${settlementId}`
    setLoading_(key, true)
    try {
      await axios.post('/settlements/dispute', {
        settlementId,
        disputeReason: disputeReasonInput.trim() || 'No reason provided',
      })
      setDisputingId(null)
      setDisputeReasonInput('')
      fetchData()
    } catch (err) {
      alert(err.response?.data?.message || 'Error submitting dispute')
    } finally { setLoading_(key, false) }
  }

  const handleResolve = async (settlementId, accept) => {
    const key = `resolve-${settlementId}`
    setLoading_(key, true)
    try {
      await axios.post('/settlements/dispute/resolve', { settlementId, accept })
      fetchData()
    } catch (err) {
      alert(err.response?.data?.message || 'Error resolving dispute')
    } finally { setLoading_(key, false) }
  }

  const getPendingRequest = (fromId, toId) =>
    pendingRequests.find(p => p.from?._id === fromId && p.to?._id === toId)

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io('http://localhost:5000', { autoConnect: true })
    }
    const socket = socketRef.current
    setTimeout(() => {
      fetchData()
    }, 0)
    socket.emit('join_group', id)
    const refresh = () => fetchData()
    socket.on('settlement_requested',          refresh)
    socket.on('settlement_done',               refresh)
    socket.on('settlement_undone',             refresh)
    socket.on('expense_added',                 refresh)
    socket.on('expense_deleted',               refresh)
    socket.on('settlement_disputed',           refresh)
    socket.on('settlement_evidence_submitted', refresh)
    socket.on('settlement_resolved',           refresh)
    return () => {
      socket.emit('leave_group', id)
      socket.off('settlement_requested',          refresh)
      socket.off('settlement_done',               refresh)
      socket.off('settlement_undone',             refresh)
      socket.off('expense_added',                 refresh)
      socket.off('expense_deleted',               refresh)
      socket.off('settlement_disputed',           refresh)
      socket.off('settlement_evidence_submitted', refresh)
      socket.off('settlement_resolved',           refresh)
      socket.disconnect()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-background text-white flex flex-col relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      
      <Navbar />
      <div className="flex-1 flex flex-col justify-center items-center relative z-10">
        <div className="glass-card px-8 py-6 rounded-3xl border border-white/10 flex flex-col items-center gap-4 text-center">
          <span className="material-symbols-outlined animate-spin text-blue-400 text-3xl">sync</span>
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-white">Calculating Debts</p>
            <p className="text-xs text-on-surface-variant mt-1 font-semibold">Simplifying group balances...</p>
          </div>
        </div>
      </div>
    </div>
  )

  const totalPayments = transactions.length + confirmedSettlements.length +
    pendingRequests.length + disputedSettlements.length + unresolvedSettlements.length

  return (
    <div className="min-h-screen bg-background text-white flex flex-col relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-1/4 w-96 h-96 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />

      <Navbar />
      
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6 relative z-10">
        {/* Back Button */}
        <button
          onClick={() => navigate(`/group/${id}`)}
          className="text-on-surface-variant hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer self-start animate-in fade-in duration-200 hover:translate-x-[-2px]"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Group
        </button>

        {/* Header */}
        <div className="flex flex-col gap-1 animate-in fade-in duration-200">
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
            Settle Up
          </h2>
          <p className="text-xs text-on-surface-variant font-semibold">
            {transactions.length === 0 && pendingRequests.length === 0 && disputedSettlements.length === 0
              ? 'All debts are cleared 🎉'
              : `${transactions.length} payment${transactions.length !== 1 ? 's' : ''} pending · ${pendingRequests.length} awaiting confirmation${disputedSettlements.length > 0 ? ` · ${disputedSettlements.length} disputed` : ''}`}
          </p>
        </div>

        {/* Metric bar */}
        {totalPayments > 0 && (
          <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="glass-card rounded-2xl p-4 text-center border border-white/5 relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 w-12 h-12 rounded-full bg-white/[0.02] blur-md pointer-events-none" />
              <p className="text-2xl font-black text-white">{totalPayments}</p>
              <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Total</p>
            </div>
            
            <div className={`glass-card rounded-2xl p-4 text-center border relative overflow-hidden transition-all ${
              transactions.length > 0 ? 'border-blue-500/20 glow-blue' : 'border-white/5'
            }`}>
              <div className="absolute -right-4 -bottom-4 w-12 h-12 rounded-full bg-blue-500/5 blur-md pointer-events-none" />
              <p className={`text-2xl font-black ${transactions.length > 0 ? 'text-blue-400' : 'text-white'}`}>{transactions.length}</p>
              <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Pending</p>
            </div>
            
            <div className={`glass-card rounded-2xl p-4 text-center border relative overflow-hidden transition-all ${
              confirmedSettlements.length > 0 ? 'border-emerald-500/20 glow-green' : 'border-white/5'
            }`}>
              <div className="absolute -right-4 -bottom-4 w-12 h-12 rounded-full bg-emerald-500/5 blur-md pointer-events-none" />
              <p className={`text-2xl font-black ${confirmedSettlements.length > 0 ? 'text-emerald-400' : 'text-white'}`}>{confirmedSettlements.length}</p>
              <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Settled</p>
            </div>
          </div>
        )}

        {totalPayments === 0 ? (
          <div className="text-center py-16 glass-card rounded-3xl border border-white/10 flex flex-col items-center animate-in fade-in duration-300">
            <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-3xl mb-4 shadow-lg shadow-emerald-500/10">
              <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <p className="text-white font-extrabold text-lg uppercase tracking-wider">All settled up!</p>
            <p className="text-on-surface-variant text-xs mt-2 max-w-sm leading-relaxed font-semibold">
              There are no expenses yet, or everyone in the group has simplified balances set to zero.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ── Awaiting Confirmation ─────────────────────────────────────── */}
            {pendingRequests.length > 0 && (
              <div className="animate-in fade-in duration-300">
                <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-4 px-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400 text-[16px]">hourglass_empty</span>
                  Awaiting Confirmation
                  <span className="px-2 py-0.5 rounded-full text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                    {pendingRequests.length}
                  </span>
                </p>
                
                <div className="space-y-4">
                  {pendingRequests.map((p, index) => {
                    const iAmPayer    = p.from?._id === user._id
                    const iAmReceiver = p.to?._id   === user._id
                    const cancelKey  = `cancel-${p.to?._id}`
                    const confirmKey = `confirm-${p.from?._id}`
                    const disputeKey = `dispute-${p._id}`
                    const isDisputingThis = disputingId === p._id
                    return (
                      <div key={p._id || index} className="glass-card border border-amber-500/20 rounded-3xl p-6 shadow-md flex flex-col gap-4 relative overflow-hidden">
                        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-amber-500/5 blur-xl pointer-events-none" />
                        
                        <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                              {p.from?.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-sm text-white block truncate">{iAmPayer ? 'You (Paid)' : p.from?.name}</span>
                              <span className="text-on-surface-variant text-[10px] uppercase tracking-wider font-bold block mt-0.5">Payer</span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-center flex-1 max-w-[80px]">
                            <span className="material-symbols-outlined text-amber-400 animate-pulse text-[20px]">arrow_forward</span>
                            <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mt-0.5">settling</span>
                          </div>
                          
                          <div className="flex items-center gap-3 text-right min-w-0">
                            <div className="min-w-0">
                              <span className="font-bold text-sm text-white block truncate">{iAmReceiver ? 'You (Received)' : p.to?.name}</span>
                              <span className="text-on-surface-variant text-[10px] uppercase tracking-wider font-bold block mt-0.5">Receiver</span>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                              {p.to?.name?.charAt(0).toUpperCase()}
                            </div>
                          </div>
                        </div>

                        <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-on-surface-variant text-[10px] font-bold uppercase tracking-wider block mb-1">Claimed Amount</span>
                            <span className="text-white text-2xl font-black">₹{p.amount?.toLocaleString('en-IN')}</span>
                            {p.transactionId && (
                              <div className="flex items-center gap-1.5 mt-2">
                                <span className="material-symbols-outlined text-amber-400 text-[12px]">receipt_long</span>
                                <span className="text-[10px] font-mono text-amber-400/80 select-all">UTR: {p.transactionId}</span>
                              </div>
                            )}
                          </div>
                          
                          <span className="text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-xl flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px] animate-pulse">hourglass_empty</span>
                            Awaiting
                          </span>
                        </div>

                        {iAmPayer && (
                          <div className="flex items-center justify-between bg-white/[0.01] border border-white/5 rounded-2xl px-4 py-3 text-xs">
                            <span className="text-on-surface-variant font-semibold flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[16px] text-amber-400">info</span>
                              Waiting for <span className="font-bold text-white ml-1">{p.to?.name}</span> to confirm
                            </span>
                            <button 
                              onClick={() => handleCancel(p.to)} 
                              disabled={actionLoading[cancelKey]}
                              className="ml-4 flex-shrink-0 text-rose-400 text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1 hover:text-rose-300 transition-all cursor-pointer disabled:opacity-40"
                            >
                              {actionLoading[cancelKey]
                                ? <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                                : <span className="material-symbols-outlined text-[14px]">close</span>}
                              Cancel
                            </button>
                          </div>
                        )}

                        {iAmReceiver && (
                          <>
                            {isDisputingThis ? (
                              <div className="flex flex-col gap-3">
                                <div>
                                  <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5 ml-1">Dispute Reason</label>
                                  <textarea 
                                    value={disputeReasonInput} 
                                    onChange={e => setDisputeReasonInput(e.target.value)}
                                    placeholder="Explain why you are disputing (e.g. money not received in UPI, wrong amount)..." 
                                    rows={2}
                                    className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-4 py-3 text-xs outline-none resize-none text-white transition-all placeholder:text-white/20 focus:border-rose-500"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => { setDisputingId(null); setDisputeReasonInput('') }} 
                                    disabled={actionLoading[disputeKey]}
                                    className="flex-1 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider border border-white/10 text-white hover:bg-white/5 transition-all cursor-pointer disabled:opacity-40"
                                  >
                                    Cancel
                                  </button>
                                  <button 
                                    onClick={() => handleDispute(p._id)} 
                                    disabled={actionLoading[disputeKey]}
                                    className="flex-1 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50 bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                                  >
                                    {actionLoading[disputeKey]
                                      ? <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                                      : <span className="material-symbols-outlined text-[14px]">flag</span>}
                                    Confirm Dispute
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col sm:flex-row gap-3">
                                <button 
                                  onClick={() => handleConfirm(p.from)} 
                                  disabled={actionLoading[confirmKey]}
                                  className="flex-1 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                                >
                                  {actionLoading[confirmKey]
                                    ? <><span className="material-symbols-outlined text-[16px] animate-spin">sync</span> Confirming...</>
                                    : <><span className="material-symbols-outlined text-[16px]">verified</span> Yes, Received</>}
                                </button>
                                <button 
                                  onClick={() => setDisputingId(p._id)} 
                                  disabled={actionLoading[confirmKey]}
                                  className="flex-1 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50 bg-rose-500/5 text-rose-400 border border-rose-500/10 hover:bg-rose-500/15"
                                >
                                  <span className="material-symbols-outlined text-[16px]">close</span>
                                  Not Received
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Pending Payments ──────────────────────────────────────────── */}
            {transactions.length > 0 && (
              <div className="animate-in fade-in duration-300">
                <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-4 px-1">
                  Pending Payments
                </p>
                <div className="space-y-4">
                  {transactions.map((t, index) => {
                    const isMe       = t.from?._id === user._id
                    const pendingReq = getPendingRequest(t.from?._id, t.to?._id)
                    const settleKey  = `settle-${t.to?._id}`
                    return (
                      <div key={index} className="glass-card border border-white/5 rounded-3xl p-6 shadow-md hover:border-white/10 transition-all flex flex-col gap-4 relative overflow-hidden">
                        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-blue-500/[0.02] blur-xl pointer-events-none" />
                        
                        <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                              {t.from?.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span className={`font-bold text-sm block truncate ${isMe ? 'text-rose-400' : 'text-white'}`}>{isMe ? 'You (Owe)' : t.from?.name}</span>
                              <span className="text-on-surface-variant text-[10px] uppercase tracking-wider font-bold block mt-0.5">Payer</span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-center flex-1 max-w-[80px]">
                            <span className="material-symbols-outlined text-on-surface-variant/40 text-[20px]">arrow_forward</span>
                            <span className="text-[9px] font-bold text-on-surface-variant/50 uppercase tracking-widest mt-0.5">owes</span>
                          </div>
                          
                          <div className="flex items-center gap-3 text-right min-w-0">
                            <div className="min-w-0">
                              <span className={`font-bold text-sm block truncate ${t.to?._id === user._id ? 'text-emerald-400' : 'text-white'}`}>
                                {t.to?._id === user._id ? 'You (Get)' : t.to?.name}
                              </span>
                              <span className="text-on-surface-variant text-[10px] uppercase tracking-wider font-bold block mt-0.5">Receiver</span>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                              {t.to?.name?.charAt(0).toUpperCase()}
                            </div>
                          </div>
                        </div>

                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <span className="text-on-surface-variant text-[10px] font-bold uppercase tracking-wider block mb-1">Settlement Balance</span>
                            <span className="text-white text-2xl font-black">₹{t.amount.toLocaleString('en-IN')}</span>
                          </div>
                          
                          {t.to?.upiId ? (
                            <div className="flex items-center gap-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2.5 self-start sm:self-auto shadow-sm">
                              <span className="material-symbols-outlined text-blue-400 text-xl">qr_code_2</span>
                              <div className="text-left min-w-0">
                                <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest block leading-none">UPI Address</span>
                                <span className="text-white/90 text-xs font-mono font-bold select-all mt-1 block truncate max-w-[180px]">{t.to.upiId}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 self-start sm:self-auto">
                              <span className="material-symbols-outlined text-amber-400 text-lg">warning</span>
                              <div className="text-left">
                                <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest block leading-none">No UPI Saved</span>
                                <span className="text-on-surface-variant text-[10px] font-semibold mt-1 block">Settle via Cash / Net Banking</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {isMe ? (
                          <div className="flex flex-col sm:flex-row gap-3 pt-2">
                            {t.to?.upiId && (
                              <button
                                onClick={() => { setActiveTransaction(t); setShowPaymentModal(true) }}
                                disabled={actionLoading[settleKey] || !!pendingReq}
                                className="flex-1 py-3 px-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider shadow-md bg-blue-500 text-white border border-blue-500/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-[16px]">bolt</span>
                                Pay via UPI
                              </button>
                            )}
                            <button
                              onClick={() => handleSettle(t.to, t.amount)}
                              disabled={actionLoading[settleKey] || !!pendingReq}
                              className={`py-3 px-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider border active:scale-95 transition-all cursor-pointer disabled:opacity-50 ${
                                t.to?.upiId 
                                  ? 'bg-white/5 border-white/10 text-white hover:bg-white/10 sm:flex-1' 
                                  : 'bg-blue-500 text-white border-transparent hover:brightness-110 w-full'
                              }`}
                            >
                              {actionLoading[settleKey]
                                ? <><span className="material-symbols-outlined text-[16px] animate-spin">sync</span> Requesting...</>
                                : <><span className="material-symbols-outlined text-[16px]">done_all</span> Mark Settled</>}
                            </button>
                          </div>
                        ) : (
                          <div className="bg-white/[0.01] border border-white/5 rounded-2xl py-3.5 px-4 text-center text-on-surface-variant text-xs font-semibold flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined animate-pulse text-amber-400 text-[18px]">hourglass_empty</span>
                            Waiting for {t.from?.name} to send payment
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Disputed Settlements — RED theme ─────────────────────────── */}
            {disputedSettlements.length > 0 && (
              <div className="animate-in fade-in duration-300 flex flex-col gap-4">
                <div className="glass-card rounded-3xl p-5 border border-rose-500/20 glow-red relative overflow-hidden flex items-center justify-between">
                  <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-rose-500/5 blur-xl pointer-events-none" />
                  
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-500/10 border border-rose-500/20">
                      <span className="material-symbols-outlined text-[20px] text-rose-400" style={{ fontVariationSettings: "'FILL' 1" }}>gavel</span>
                    </div>
                    <div>
                      <p className="font-extrabold text-sm text-white uppercase tracking-wider">Disputed Payments</p>
                      <p className="text-[10px] text-on-surface-variant mt-0.5 font-semibold">
                        {disputedSettlements.length} settlement{disputedSettlements.length !== 1 ? 's' : ''} rejected · manual audit or proof verification required
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold px-3 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/25 rounded-xl">
                    {disputedSettlements.length}
                  </span>
                </div>

                <div className="space-y-4">
                  {disputedSettlements.map((s, index) => {
                    const iAmPayer    = s.from?._id === user._id
                    const iAmReceiver = s.to?._id   === user._id
                    const hasEvidence = s.evidence?.utrNumber || s.evidence?.screenshotUrl
                    const resolveKey  = `resolve-${s._id}`
                    return (
                      <div key={s._id || index} className="glass-card border border-rose-500/20 rounded-3xl overflow-hidden shadow-lg relative">
                        <div className="p-5 flex flex-col gap-4 bg-rose-500/[0.01]">
                          {/* Header */}
                          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-500/10 border border-rose-500/20 flex-shrink-0">
                              <span className="material-symbols-outlined text-[20px] text-rose-400">gavel</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-sm text-white truncate">
                                {iAmPayer
                                  ? `${s.to?.name} rejected your payment claim`
                                  : `${s.from?.name} claims they paid you`}
                              </p>
                              <p className="text-xs font-bold text-rose-400 mt-0.5">Disputed Settlement · ₹{s.amount?.toLocaleString('en-IN')}</p>
                            </div>
                          </div>

                          {/* Dispute reason */}
                          <div className="rounded-2xl px-4 py-3.5 flex items-start gap-2.5 bg-rose-500/5 border border-rose-500/15">
                            <span className="material-symbols-outlined text-[15px] mt-0.5 flex-shrink-0 text-rose-400" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-rose-400 mb-0.5">
                                {iAmPayer ? `${s.to?.name} says:` : 'You said:'}
                              </p>
                              <p className="text-xs text-white/90 leading-relaxed font-semibold">"{s.disputeReason || 'No reason provided'}"</p>
                            </div>
                          </div>

                          {/* Payer view */}
                          {iAmPayer && (
                            hasEvidence ? (
                              <div className="rounded-2xl px-4 py-3 flex items-center gap-2 bg-blue-500/5 border border-blue-500/15">
                                <span className="material-symbols-outlined text-[16px] animate-pulse text-blue-400">schedule</span>
                                <p className="text-xs font-semibold text-on-surface-variant">
                                  Evidence submitted. Waiting for {s.to?.name} to review...
                                </p>
                              </div>
                            ) : (
                              <button 
                                onClick={() => { setActiveDispute(s); setShowDisputeModal(true) }}
                                className="w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 bg-blue-500 text-white border border-blue-500/20 shadow-md shadow-blue-500/10 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[16px]">upload</span>
                                Submit UTR / Screenshot Proof
                              </button>
                            )
                          )}

                          {/* Receiver view */}
                          {iAmReceiver && (
                            <>
                              {hasEvidence && (
                                <div className="rounded-2xl p-4 flex flex-col gap-3 bg-white/[0.01] border border-white/5">
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
                                    Proof submitted by {s.from?.name}
                                  </p>
                                  <div className="flex flex-col gap-2 pt-1">
                                    {s.evidence?.utrNumber && (
                                      <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[14px] text-emerald-400">receipt_long</span>
                                        <span className="text-xs font-mono text-white select-all">UTR: {s.evidence.utrNumber}</span>
                                      </div>
                                    )}
                                    {s.evidence?.screenshotUrl && (
                                      <a 
                                        href={`http://localhost:5000${s.evidence.screenshotUrl}`} 
                                        target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-xs font-bold text-blue-400 uppercase tracking-wider hover:underline"
                                      >
                                        <span className="material-symbols-outlined text-[16px]">image</span>
                                        View Screenshot
                                        <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                                      </a>
                                    )}
                                  </div>
                                  
                                  {s.evidence?.aiReason && (
                                    <div className="rounded-xl px-3.5 py-3 flex items-start gap-2.5 mt-1"
                                      style={{
                                        backgroundColor: s.evidence.aiVerified ? 'rgba(74, 222, 128, 0.05)' : 'rgba(251, 191, 36, 0.05)',
                                        border: `1px solid ${s.evidence.aiVerified ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 191, 36, 0.15)'}`
                                      }}>
                                      <span className="material-symbols-outlined text-[15px] mt-0.5 flex-shrink-0 animate-pulse-glow"
                                        style={{ color: s.evidence.aiVerified ? '#4ade80' : '#fbbf24' }}>smart_toy</span>
                                      <div>
                                        <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5"
                                          style={{ color: s.evidence.aiVerified ? '#4ade80' : '#fbbf24' }}>
                                          AI: {s.evidence.aiVerified ? 'Verified ✓' : 'Alert / Manual Review'}
                                        </p>
                                        <p className="text-xs text-on-surface-variant leading-relaxed">{s.evidence.aiReason}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {!hasEvidence && (
                                <div className="rounded-2xl px-4 py-3 flex items-center gap-2 bg-[#fbbf24]/5 border border-[#fbbf24]/15">
                                  <span className="material-symbols-outlined text-[16px] animate-pulse text-[#fbbf24]">hourglass_empty</span>
                                  <p className="text-xs font-semibold text-on-surface-variant">
                                    Waiting for {s.from?.name} to submit evidence...
                                  </p>
                                </div>
                              )}
                              
                              {hasEvidence && (
                                <div className="flex flex-col sm:flex-row gap-2.5 border-t border-white/5 pt-3">
                                  <button 
                                    onClick={() => handleResolve(s._id, true)} 
                                    disabled={actionLoading[resolveKey]}
                                    className="flex-1 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                                  >
                                    {actionLoading[resolveKey] 
                                      ? <span className="material-symbols-outlined text-[16px] animate-spin">sync</span> 
                                      : <span className="material-symbols-outlined text-[16px]">check_circle</span>}
                                    Accept & Confirm
                                  </button>
                                  <button 
                                    onClick={() => handleResolve(s._id, false)} 
                                    disabled={actionLoading[resolveKey]}
                                    className="flex-1 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50 bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                                  >
                                    {actionLoading[resolveKey] 
                                      ? <span className="material-symbols-outlined text-[16px] animate-spin">sync</span> 
                                      : <span className="material-symbols-outlined text-[16px]">close</span>}
                                    Reject Proof
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Confirmed Settlements — GREEN theme ──────────────────────── */}
            {confirmedSettlements.length > 0 && (
              <div className="animate-in fade-in duration-300">
                <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-4 mt-2 px-1">
                  Settled Payments
                </p>
                
                <div className="space-y-3">
                  {confirmedSettlements.map((s, index) => {
                    const isMe = s.from?._id === user._id
                    return (
                      <div key={s._id || index} className="glass-card border border-white/5 rounded-3xl p-5 opacity-80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:opacity-100 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white border border-white/10 flex items-center justify-center font-bold text-xs">
                            {s.from?.name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">
                              <span>{isMe ? 'You' : s.from?.name}</span>
                              <span className="text-on-surface-variant font-medium mx-2">settled with</span>
                              <span>{s.to?._id === user._id ? 'You' : s.to?.name}</span>
                            </p>
                            <span className="text-[8px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg uppercase inline-flex items-center gap-1 mt-1">
                              <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                              Confirmed
                            </span>
                          </div>
                        </div>
                        <span className="text-base font-black text-emerald-400">₹{s.amount.toLocaleString('en-IN')}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Unresolved Settlements — ORANGE theme ────────────────────── */}
            {unresolvedSettlements.length > 0 && (
              <div className="animate-in fade-in duration-300 flex flex-col gap-4">
                <div className="glass-card rounded-3xl p-5 border border-amber-500/20 glow-orange relative overflow-hidden flex items-center justify-between">
                  <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-amber-500/5 blur-xl pointer-events-none" />
                  
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/10 border border-amber-500/20">
                      <span className="material-symbols-outlined text-[20px] text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>report</span>
                    </div>
                    <div>
                      <p className="font-extrabold text-sm text-white uppercase tracking-wider">Unresolved Settlements</p>
                      <p className="text-[10px] text-on-surface-variant mt-0.5 font-semibold">
                        {unresolvedSettlements.length} settlement{unresolvedSettlements.length !== 1 ? 's' : ''} disputed and rejected multiple times · manual intervention needed
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/25 rounded-xl">
                    {unresolvedSettlements.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {unresolvedSettlements.map((s, index) => {
                    const isMe = s.from?._id === user._id
                    return (
                      <div key={s._id || index} className="glass-card border border-amber-500/20 rounded-3xl flex overflow-hidden">
                        <div className="w-1 flex-shrink-0 bg-amber-500" />
                        <div className="flex-1 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-500/[0.01]">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white flex-shrink-0">
                              {s.from?.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">
                                <span>{isMe ? 'You' : s.from?.name}</span>
                                <span className="mx-2 font-normal text-on-surface-variant">→</span>
                                <span>{s.to?._id === user._id ? 'You' : s.to?.name}</span>
                              </p>
                              <p className="text-[10px] font-semibold mt-1 flex items-center gap-1 text-amber-500">
                                <span className="material-symbols-outlined text-[12px]">warning</span>
                                Please resolve offline via direct cash / bank transfer
                              </p>
                            </div>
                          </div>
                          <span className="text-base font-black text-amber-500 flex-shrink-0">
                            ₹{s.amount?.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </main>

      {/* Modals */}
      {showPaymentModal && activeTransaction && (
        <UPIPaymentModal
          transaction={activeTransaction}
          onClose={() => { setShowPaymentModal(false); setActiveTransaction(null) }}
          onPaymentInitiated={() => { setShowPaymentModal(false); setShowConfirmPopup(true) }}
        />
      )}
      {showConfirmPopup && activeTransaction && (
        <ConfirmPaymentPopup
          transaction={activeTransaction}
          groupId={id}
          onConfirm={() => { setShowConfirmPopup(false); setActiveTransaction(null); fetchData() }}
          onCancel={() => { setShowConfirmPopup(false); setShowPaymentModal(true) }}
        />
      )}
      {showDisputeModal && activeDispute && (
        <DisputeEvidenceModal
          settlement={activeDispute}
          onClose={() => { setShowDisputeModal(false); setActiveDispute(null) }}
          onEvidenceSubmitted={() => { setShowDisputeModal(false); setActiveDispute(null); fetchData() }}
        />
      )}
    </div>
  )
}
