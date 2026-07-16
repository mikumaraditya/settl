import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios, { SOCKET_URL } from '../api/axios'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { io } from 'socket.io-client'
import { useNotifications } from '../context/NotificationContext'
import UPIPaymentModal from '../components/UPIPaymentModal'
import ConfirmPaymentPopup from '../components/ConfirmPaymentPopup'

export default function SettleUp() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { joinGroup } = useNotifications()

  const [transactions, setTransactions]        = useState([])
  const [pendingRequests, setPending]          = useState([])
  const [loading, setLoading]                  = useState(true)
  const [actionLoading, setActionLoading]      = useState({})
  const [showPaymentModal, setShowPaymentModal]   = useState(false)
  const [showConfirmPopup, setShowConfirmPopup]   = useState(false)
  const [activeTransaction, setActiveTransaction] = useState(null)
  const [rejectingSettlement, setRejectingSettlement] = useState(null)
  const [settleAmounts, setSettleAmounts] = useState({})

  const socketRef = useRef(null)

  const fetchData = async () => {
    try {
      const { data } = await axios.get(`/settlements/simplify/${id}`)
      const txs = data.transactions || []
      const pending = data.pendingRequests || []

      setTransactions(txs)
      setPending(pending)
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
      await fetchData()
    } catch (err) {
      alert(err.response?.data?.message || 'Error requesting settlement')
    } finally { setLoading_(key, false) }
  }

  const handleConfirm = async (fromUser) => {
    const key = `confirm-${fromUser._id}`
    setLoading_(key, true)
    try {
      await axios.post('/settlements/confirm', { groupId: id, fromUserId: fromUser._id })
      await fetchData()
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

  const handleReject = async (fromUser) => {
    const key = `reject-${fromUser._id}`
    setLoading_(key, true)
    try {
      await axios.post('/settlements/reject', { groupId: id, fromUserId: fromUser._id })
      await fetchData()
    } catch (err) {
      alert(err.response?.data?.message || 'Error rejecting settlement')
    } finally { setLoading_(key, false) }
  }

  const getPendingRequest = (fromId, toId) =>
    pendingRequests.find(p => p.from?._id === fromId && p.to?._id === toId)

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, { autoConnect: true })
    }
    const socket = socketRef.current
    setTimeout(() => {
      fetchData()
    }, 0)
    socket.emit('join_group', id)
    joinGroup(id)
    const refresh = () => fetchData()
    socket.on('settlement_requested',          refresh)
    socket.on('settlement_done',               refresh)
    socket.on('settlement_undone',             refresh)
    socket.on('expense_added',                 refresh)
    socket.on('expense_deleted',               refresh)
    return () => {
      socket.emit('leave_group', id)
      socket.off('settlement_requested',          refresh)
      socket.off('settlement_done',               refresh)
      socket.off('settlement_undone',             refresh)
      socket.off('expense_added',                 refresh)
      socket.off('expense_deleted',               refresh)
      socket.disconnect()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-background text-white flex flex-col relative overflow-hidden md:pl-20 lg:pl-64 pb-20 md:pb-0 pt-14 md:pt-0">
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

  const totalPayments = transactions.length + pendingRequests.length

  return (
    <div className="min-h-screen bg-background text-white flex flex-col relative overflow-hidden md:pl-20 lg:pl-64 pb-20 md:pb-0 pt-14 md:pt-0">
      {/* Background Orbs */}
      <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-1/4 w-96 h-96 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />

      <Navbar />
      
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6 relative z-10">
        {/* Back Button */}
        <button
          onClick={() => navigate(`/group/${id}`)}
          className="text-on-surface-variant hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer self-start hover:translate-x-[-2px]"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Group
        </button>

        {/* Header */}
        <div className="animate-in fade-in duration-300">
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-[26px]">payments</span>
            Settle Up
          </h2>
          <p className="text-xs text-on-surface-variant font-semibold">
            {transactions.length === 0 && pendingRequests.length === 0
              ? 'All debts are cleared 🎉'
              : `${transactions.length} payment${transactions.length !== 1 ? 's' : ''} pending · ${pendingRequests.length} awaiting confirmation`}
          </p>
        </div>

        {/* Metric bar */}
        {totalPayments > 0 && (
          <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className={`glass-card rounded-2xl p-4 text-center border relative overflow-hidden transition-all ${
              pendingRequests.length > 0 ? 'border-amber-500/20 glow-amber' : 'border-white/5'
            }`}>
              <div className="absolute -right-4 -bottom-4 w-12 h-12 rounded-full bg-amber-500/5 blur-md pointer-events-none" />
              <p className={`text-2xl font-black ${pendingRequests.length > 0 ? 'text-amber-400' : 'text-white'}`}>{pendingRequests.length}</p>
              <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Pending Approval</p>
            </div>

            <div className={`glass-card rounded-2xl p-4 text-center border relative overflow-hidden transition-all ${
              transactions.length > 0 ? 'border-blue-500/20 glow-blue' : 'border-white/5'
            }`}>
              <div className="absolute -right-4 -bottom-4 w-12 h-12 rounded-full bg-blue-500/5 blur-md pointer-events-none" />
              <p className={`text-2xl font-black ${transactions.length > 0 ? 'text-blue-400' : 'text-white'}`}>{transactions.length}</p>
              <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Outstanding Debts</p>
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
                          <div className="flex flex-col sm:flex-row gap-3">
                            <button 
                              onClick={() => handleConfirm(p.from)} 
                              disabled={actionLoading[confirmKey] || actionLoading[`reject-${p.from?._id}`]}
                              className="flex-1 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                            >
                              {actionLoading[confirmKey]
                                ? <><span className="material-symbols-outlined text-[16px] animate-spin">sync</span> Confirming...</>
                                : <><span className="material-symbols-outlined text-[16px]">verified</span> Yes, Received</>}
                            </button>
                            <button 
                              onClick={() => setRejectingSettlement(p)} 
                              disabled={actionLoading[confirmKey] || actionLoading[`reject-${p.from?._id}`]}
                              className="flex-1 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50 bg-rose-500/5 text-rose-400 border border-rose-500/10 hover:bg-rose-500/15"
                            >
                              {actionLoading[`reject-${p.from?._id}`]
                                ? <><span className="material-symbols-outlined text-[16px] animate-spin">sync</span> Rejecting...</>
                                : <><span className="material-symbols-outlined text-[16px]">close</span> Not Received</>}
                            </button>
                          </div>
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

                        {isMe && (
                          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
                            <label className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest block">
                              Amount to Settle
                            </label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                              <input 
                                type="number"
                                min="0.01"
                                max={t.amount}
                                step="any"
                                value={settleAmounts[t.to?._id] !== undefined ? settleAmounts[t.to?._id] : t.amount}
                                onChange={(e) => {
                                  let val = e.target.value;
                                  if (val !== '') {
                                    const parsed = parseFloat(val);
                                    if (parsed > t.amount) val = t.amount.toString();
                                    else if (parsed < 0) val = '0';
                                  }
                                  setSettleAmounts(prev => ({ ...prev, [t.to?._id]: val }));
                                }}
                                className="w-full bg-background border border-white/10 rounded-xl py-3 pl-8 pr-4 text-sm font-bold text-white focus:outline-none focus:border-blue-500/50"
                                placeholder={`Enter amount up to ₹${t.amount}`}
                              />
                            </div>
                            {settleAmounts[t.to?._id] !== undefined && settleAmounts[t.to?._id] !== '' && parseFloat(settleAmounts[t.to?._id]) < t.amount && (
                              <p className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 mt-0.5 animate-in fade-in duration-200">
                                <span className="material-symbols-outlined text-[14px]">info</span>
                                Partial payment: Remaining ₹{(t.amount - parseFloat(settleAmounts[t.to?._id])).toFixed(2)} will remain outstanding.
                              </p>
                            )}
                          </div>
                        )}

                        {isMe ? (
                          <div className="flex flex-col sm:flex-row gap-3 pt-2">
                            {t.to?.upiId && (
                              <button
                                onClick={() => {
                                  const customAmt = settleAmounts[t.to?._id] !== undefined && settleAmounts[t.to?._id] !== ''
                                    ? parseFloat(settleAmounts[t.to?._id])
                                    : t.amount;
                                  if (customAmt <= 0) {
                                    alert('Please enter a positive amount to settle');
                                    return;
                                  }
                                  setActiveTransaction({ ...t, amount: customAmt });
                                  setShowPaymentModal(true);
                                }}
                                disabled={actionLoading[settleKey] || !!pendingReq}
                                className="flex-1 py-3 px-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider shadow-md bg-blue-500 text-white border border-blue-500/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-[16px]">bolt</span>
                                Pay via UPI
                              </button>
                            )}
                            <button
                              onClick={() => {
                                const customAmt = settleAmounts[t.to?._id] !== undefined && settleAmounts[t.to?._id] !== ''
                                  ? parseFloat(settleAmounts[t.to?._id])
                                  : t.amount;
                                if (customAmt <= 0) {
                                  alert('Please enter a positive amount to settle');
                                  return;
                                }
                                handleSettle(t.to, customAmt);
                              }}
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

      {rejectingSettlement && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="glass-card w-full max-w-sm rounded-3xl border border-rose-500/20 flex flex-col gap-5 p-6 animate-in zoom-in-95 duration-200 relative overflow-hidden">
            {/* Background gradient orb */}
            <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-rose-500/5 blur-xl pointer-events-none" />

            {/* Icon + Title */}
            <div className="flex flex-col items-center gap-3 text-center pt-2">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-2xl shadow-md shadow-rose-500/5">
                <span className="material-symbols-outlined text-[28px] text-rose-400" style={{ fontVariationSettings: "'FILL' 1" }}>
                  cancel
                </span>
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Reject Settlement Request?
                </h2>
                <p className="text-xs mt-1 text-on-surface-variant font-semibold leading-relaxed">
                  Are you sure you did not receive ₹<span className="font-bold text-white">{rejectingSettlement.amount?.toLocaleString('en-IN')}</span> from <span className="font-bold text-white">{rejectingSettlement.from?.name}</span>? This will reset their status to unpaid.
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/5" />

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  handleReject(rejectingSettlement.from)
                  setRejectingSettlement(null)
                }}
                className="w-full py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-md bg-rose-500 text-white border border-rose-500/20 hover:brightness-110"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
                Yes, Reject Request
              </button>

              <button
                onClick={() => setRejectingSettlement(null)}
                className="w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-white/10 text-white hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
