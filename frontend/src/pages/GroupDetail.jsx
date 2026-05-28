import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from '../api/axios'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { io } from 'socket.io-client'
import DisputeEvidenceModal from '../components/DisputeEvidenceModal'

export default function GroupDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  // ── Core state ──────────────────────────────────────────────────────────────
  const [group, setGroup]     = useState(null)
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading]   = useState(true)

  // ── Pagination state ─────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage]       = useState(1)
  const [hasMore, setHasMore]               = useState(false)
  const [loadingMore, setLoadingMore]       = useState(false)
  const [totalMonths, setTotalMonths]       = useState(0)
  // loadedMonths state removed

  // ── Tab state ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('expenses') // 'expenses' | 'disputes' | 'activity'

  // ── Disputes state ────────────────────────────────────────────────────────────
  const [disputes, setDisputes]           = useState({ pending: [], disputed: [], unresolved: [] })
  const [loadingDisputes, setLoadingDisputes] = useState(false)
  const [disputesFetched, setDisputesFetched] = useState(false)
  const [disputingId, setDisputingId]         = useState(null)
  const [disputeReason, setDisputeReason]     = useState('')
  const [disputeActionLoading, setDisputeActionLoading] = useState({})
  const [activeDisputeEvidence, setActiveDisputeEvidence] = useState(null)

  // ── Activity log state ────────────────────────────────────────────────────────
  const [activityLogs, setActivityLogs]       = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityFetched, setActivityFetched] = useState(false)
  const [activityHasMore, setActivityHasMore] = useState(false)
  const [activityTotal, setActivityTotal]     = useState(0)

  // ── Modals / forms ────────────────────────────────────────────────────────────
  const [showAddExpense, setShowAddExpense]   = useState(false)
  const [showAddMember, setShowAddMember]     = useState(false)
  const [showDeleteGroup, setShowDeleteGroup] = useState(false)
  const [showLeaveGroup, setShowLeaveGroup]   = useState(false)
  const [expenseToDelete, setExpenseToDelete] = useState(null)
  const [deletingExpense, setDeletingExpense] = useState(false)
  const [deleteExpenseError, setDeleteExpenseError] = useState('')
  const [memberEmail, setMemberEmail]         = useState('')
  const [expenseForm, setExpenseForm]         = useState({
    description: '', amount: '', category: 'food', splitType: 'equal'
  })
  const [addingExpense, setAddingExpense]     = useState(false)
  const [addingMember, setAddingMember]       = useState(false)
  const [deletingGroup, setDeletingGroup]     = useState(false)
  const [deleteError, setDeleteError]         = useState('')
  const [leavingGroup, setLeavingGroup]       = useState(false)
  const [leaveError, setLeaveError]           = useState('')
  const [removingMemberId, setRemovingMemberId] = useState(null)
  const [removeError, setRemoveError]         = useState('')
  const [addMemberError, setAddMemberError]   = useState('')

  // ── Smart Settlement state ────────────────────────────────────────────────────
  const [transactions, setTransactions]             = useState([])
  const [now]                                       = useState(() => Date.now())
  const [loadingSettlements, setLoadingSettlements] = useState(true)

  // ── Socket ref ────────────────────────────────────────────────────────────────
  const socketRef = useRef(null)

  // ── Effects ───────────────────────────────────────────────────────────────────


  // ── Data fetching ─────────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      setLoading(true)
      const [groupRes, expenseRes] = await Promise.all([
        axios.get(`/groups/${id}`),
        axios.get(`/expenses/group/${id}?months=3&page=1`)
      ])
      setGroup(groupRes.data)
      const { expenses: exps, hasMore: more, totalMonths: tm } = expenseRes.data
      setExpenses(exps)
      setHasMore(more)
      setTotalMonths(tm)
      setCurrentPage(1)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchMoreExpenses = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const nextPage = currentPage + 1
    try {
      const { data } = await axios.get(`/expenses/group/${id}?months=3&page=${nextPage}`)
      setExpenses(prev => {
        // Merge — avoid duplicates by _id
        const existingIds = new Set(prev.map(e => e._id))
        const newOnes = data.expenses.filter(e => !existingIds.has(e._id))
        return [...prev, ...newOnes]
      })
      setHasMore(data.hasMore)
      setTotalMonths(data.totalMonths)
      setCurrentPage(nextPage)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingMore(false)
    }
  }

  const fetchSettlements = async () => {
    try {
      setLoadingSettlements(true)
      const { data } = await axios.get(`/settlements/simplify/${id}`)
      setTransactions(data.transactions || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingSettlements(false)
    }
  }

  const fetchDisputes = async () => {
    try {
      setLoadingDisputes(true)
      const { data } = await axios.get(`/settlements/group/${id}/disputes`)
      setDisputes(data)
      setDisputesFetched(true)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingDisputes(false)
    }
  }

  // Switch to disputes tab — lazy load on first visit
  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'disputes' && !disputesFetched) fetchDisputes()
    if (tab === 'activity' && !activityFetched) fetchActivity()
  }

  const fetchActivity = async (append = false) => {
    setActivityLoading(true)
    try {
      const skip = append ? activityLogs.length : 0
      const { data } = await axios.get(`/settlements/group/${id}/activity?limit=20&skip=${skip}`)
      setActivityLogs(prev => append ? [...prev, ...data.logs] : data.logs)
      setActivityHasMore(data.hasMore)
      setActivityTotal(data.total)
      setActivityFetched(true)
    } catch (err) {
      console.error(err)
    } finally {
      setActivityLoading(false)
    }
  }

  // ── Dispute actions ───────────────────────────────────────────────────────────
  const setDisputeLoading = (key, val) =>
    setDisputeActionLoading(prev => ({ ...prev, [key]: val }))

  const handleConfirmSettlement = async (settlementId) => {
    setDisputeLoading(`confirm-${settlementId}`, true)
    try {
      await axios.post('/settlements/confirm', { groupId: id, fromUserId: disputes.pending.find(p => p._id === settlementId)?.from?._id })
      fetchDisputes()
      fetchSettlements()
    } catch (err) {
      alert(err.response?.data?.message || 'Error confirming')
    } finally {
      setDisputeLoading(`confirm-${settlementId}`, false)
    }
  }

  const handleDisputeSettlement = async (settlementId) => {
    if (!disputeReason.trim()) return
    setDisputeLoading(`dispute-${settlementId}`, true)
    try {
      await axios.post('/settlements/dispute', {
        settlementId,
        disputeReason: disputeReason.trim(),
      })
      setDisputingId(null)
      setDisputeReason('')
      fetchDisputes()
      fetchSettlements()
    } catch (err) {
      alert(err.response?.data?.message || 'Error disputing')
    } finally {
      setDisputeLoading(`dispute-${settlementId}`, false)
    }
  }

  const handleResolveDispute = async (settlementId, accept) => {
    setDisputeLoading(`resolve-${settlementId}`, true)
    try {
      await axios.post('/settlements/dispute/resolve', { settlementId, accept })
      fetchDisputes()
      fetchSettlements()
    } catch (err) {
      alert(err.response?.data?.message || 'Error resolving dispute')
    } finally {
      setDisputeLoading(`resolve-${settlementId}`, false)
    }
  }

  // ── Expense helpers ───────────────────────────────────────────────────────────
  const handleAddExpense = async (e) => {
    e.preventDefault()
    const parsedAmount = parseFloat(expenseForm.amount)
    if (!expenseForm.description || !expenseForm.amount) return
    if (isNaN(parsedAmount) || parsedAmount <= 0) return
    setAddingExpense(true)
    try {
      await axios.post('/expenses', { ...expenseForm, amount: parsedAmount, groupId: id })
      setExpenseForm({ description: '', amount: '', category: 'food', splitType: 'equal' })
      setShowAddExpense(false)
    } catch (err) {
      console.error(err)
    } finally {
      setAddingExpense(false)
    }
  }

  const handleAddMember = async (e) => {
    e.preventDefault()
    if (!memberEmail) return
    setAddingMember(true)
    setAddMemberError('')
    try {
      const { data } = await axios.post(`/groups/${id}/members`, { email: memberEmail })
      setGroup(data)
      setMemberEmail('')
      setShowAddMember(false)
    } catch (err) {
      setAddMemberError(err.response?.data?.message || 'Error adding member')
    } finally {
      setAddingMember(false)
    }
  }

  const getTimeStatus = (createdAt) => {
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000
    const ageMs = now - new Date(createdAt).getTime()
    if (ageMs >= TWO_HOURS_MS) return { canDelete: false, label: 'Window expired' }
    const remaining = TWO_HOURS_MS - ageMs
    const mins = Math.floor(remaining / 60000)
    const hrs  = Math.floor(mins / 60)
    const remMins = mins % 60
    const label = hrs > 0 ? `${hrs}h ${remMins}m left` : `${mins}m left`
    return { canDelete: true, label }
  }

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return
    setDeletingExpense(true)
    setDeleteExpenseError('')
    try {
      await axios.delete(`/expenses/${expenseToDelete._id}`)
      setExpenseToDelete(null)
    } catch (err) {
      setDeleteExpenseError(err.response?.data?.message || 'Error deleting expense')
      setDeletingExpense(false)
    }
  }

  const handleDeleteGroup = async () => {
    setDeletingGroup(true)
    setDeleteError('')
    try {
      await axios.delete(`/groups/${id}`)
      navigate('/dashboard')
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Error deleting group')
      setDeletingGroup(false)
    }
  }

  const handleRemoveMember = async (memberId) => {
    setRemovingMemberId(memberId)
    setRemoveError('')
    try {
      const { data } = await axios.delete(`/groups/${id}/members/${memberId}`)
      setGroup(data)
    } catch (err) {
      setRemoveError(err.response?.data?.message || 'Error removing member')
    } finally {
      setRemovingMemberId(null)
    }
  }

  const handleLeaveGroup = async () => {
    setLeavingGroup(true)
    setLeaveError('')
    try {
      await axios.delete(`/groups/${id}/members/${user._id}`)
      navigate('/dashboard')
    } catch (err) {
      setLeaveError(err.response?.data?.message || 'Error leaving group')
      setLeavingGroup(false)
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0)
  const myShareTotal = expenses.reduce((sum, exp) => {
    const userSplit = exp.splits.find(s => s.user?._id === user._id)
    return sum + (userSplit ? userSplit.amount : 0)
  }, 0)
  const pendingTransactions = transactions
  let myGroupBalance = 0
  pendingTransactions.forEach(t => {
    if (t.from?._id === user._id) myGroupBalance -= t.amount
    if (t.to?._id   === user._id) myGroupBalance += t.amount
  })

  // ── Group expenses by month ───────────────────────────────────────────────────
  const monthLabel = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  }

  const groupedExpenses = expenses.reduce((acc, exp) => {
    const key = monthLabel(exp.createdAt)
    if (!acc[key]) acc[key] = []
    acc[key].push(exp)
    return acc
  }, {})

  // Maintain insertion order (already sorted newest-first from API)
  const monthKeys = Object.keys(groupedExpenses)

  // ── Category maps ─────────────────────────────────────────────────────────────
  const categoryIcons = {
    food: 'restaurant', travel: 'flight', shopping: 'shopping_cart',
    entertainment: 'theaters', other: 'receipt_long'
  }
  const categoryColors = {
    food:          { bg: 'bg-orange-500/15', text: 'text-orange-400' },
    travel:        { bg: 'bg-sky-500/15',    text: 'text-sky-400'    },
    shopping:      { bg: 'bg-violet-500/15', text: 'text-violet-400' },
    entertainment: { bg: 'bg-pink-500/15',   text: 'text-pink-400'   },
    other:         { bg: 'bg-slate-500/15',  text: 'text-slate-400'  }
  }

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io('http://localhost:5000', { autoConnect: true })
    }
    const socket = socketRef.current

    setTimeout(() => {
      fetchData()
      fetchSettlements()
    }, 0)
    socket.emit('join_group', id)

    // Expense events
    const onExpenseAdded = (expense) => {
      setExpenses(prev => [expense, ...prev])
      fetchSettlements()
    }
    const onExpenseDeleted = ({ expenseId }) => {
      setExpenses(prev => prev.filter(e => e._id !== expenseId))
      fetchSettlements()
    }

    // Settlement events — refresh smart settlement widget
    const onSettlementDone      = () => fetchSettlements()
    const onSettlementUndone    = () => fetchSettlements()
    const onSettlementRequested = () => fetchSettlements()

    // Dispute events — refresh disputes tab if it was already loaded
    const onDisputeEvent = () => {
      fetchSettlements()
      if (disputesFetched) fetchDisputes()
    }

    socket.on('expense_added',                onExpenseAdded)
    socket.on('expense_deleted',              onExpenseDeleted)
    socket.on('settlement_done',              onSettlementDone)
    socket.on('settlement_undone',            onSettlementUndone)
    socket.on('settlement_requested',         onSettlementRequested)
    socket.on('settlement_disputed',          onDisputeEvent)
    socket.on('settlement_evidence_submitted', onDisputeEvent)
    socket.on('settlement_resolved',          onDisputeEvent)
    socket.on('payment_confirmed',            onDisputeEvent)

    return () => {
      socket.emit('leave_group', id)
      socket.off('expense_added',                onExpenseAdded)
      socket.off('expense_deleted',              onExpenseDeleted)
      socket.off('settlement_done',              onSettlementDone)
      socket.off('settlement_undone',            onSettlementUndone)
      socket.off('settlement_requested',         onSettlementRequested)
      socket.off('settlement_disputed',          onDisputeEvent)
      socket.off('settlement_evidence_submitted', onDisputeEvent)
      socket.off('settlement_resolved',          onDisputeEvent)
      socket.off('payment_confirmed',            onDisputeEvent)
      socket.disconnect()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, disputesFetched])

  // ── Loading screen ────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex justify-center items-center">
        <div className="text-on-surface-variant text-sm font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined animate-spin">sync</span>
          Loading group details...
        </div>
      </div>
    </div>
  )

  const totalDisputeCount = disputes.pending.length + disputes.disputed.length + disputes.unresolved.length

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Back navigation */}
        <button
          onClick={() => navigate('/dashboard')}
          className="text-on-surface-variant hover:text-primary text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-start"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to Dashboard
        </button>

        {/* Hero Header Card */}
        <section className="glass-card p-6 md:p-8 rounded-2xl shadow-lg relative overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
            <span className="material-symbols-outlined text-[140px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              beach_access
            </span>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10 w-full">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-0.5">
                Group Details
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight">{group?.name}</h2>
              <p className="text-xs text-on-surface-variant font-medium">{group?.description || 'No description provided'}</p>
              <div className="flex items-center gap-3 mt-3">
                <div className="flex -space-x-2">
                  {group?.members.slice(0, 3).map((m, index) => (
                    <div key={index} className="w-8 h-8 rounded-full bg-primary-container text-white flex items-center justify-center font-bold text-xs border border-[#0d1326] shadow-md transition-transform hover:scale-105">
                      {m.user?.name?.charAt(0).toUpperCase()}
                    </div>
                  ))}
                  {group?.members.length > 3 && (
                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-xs font-bold text-on-surface-variant shadow-md">
                      +{group.members.length - 3}
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  {group?.members.length} members
                </span>
              </div>
            </div>

            <div className="flex gap-3 self-stretch md:self-auto justify-end">
              <button
                onClick={() => setShowAddExpense(true)}
                className="bg-gradient-to-r from-secondary to-blue-600 text-white px-5 py-3 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-wider shadow-lg shadow-secondary/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px] font-bold">add</span> Add Expense
              </button>
              <button
                onClick={() => navigate(`/settle/${id}`)}
                className="bg-white/5 border border-white/10 text-white px-5 py-3 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-wider hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">payments</span> Settle Up
              </button>
            </div>
          </div>
        </section>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── Left column: Tabs + Content ─────────────────────────────────── */}
          <div className="lg:col-span-8 flex flex-col gap-4">

            {/* Tab bar */}
            <div className="flex items-center gap-2 border-b border-white/5">
              {/* Expenses tab */}
              <button
                onClick={() => handleTabChange('expenses')}
                className={`px-5 py-3.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer -mb-px ${
                  activeTab === 'expenses'
                    ? 'border-secondary text-secondary bg-secondary/5 rounded-t-xl'
                    : 'border-transparent text-on-surface-variant hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                Expenses
                {expenses.length > 0 && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    activeTab === 'expenses' ? 'bg-secondary/15 text-secondary border border-secondary/25' : 'bg-white/5 text-on-surface-variant'
                  }`}>
                    {expenses.length}
                  </span>
                )}
              </button>

              {/* Disputes tab */}
              <button
                onClick={() => handleTabChange('disputes')}
                className={`px-5 py-3.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer -mb-px ${
                  activeTab === 'disputes'
                    ? 'border-[#f87171] text-[#f87171] bg-[#f87171]/5 rounded-t-xl'
                    : 'border-transparent text-on-surface-variant hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">gavel</span>
                Disputes
                {disputesFetched && totalDisputeCount > 0 && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    activeTab === 'disputes' ? 'bg-[#f87171]/15 text-[#f87171] border border-[#f87171]/25' : 'bg-[#f87171]/10 text-[#f87171]'
                  }`}>
                    {totalDisputeCount}
                  </span>
                )}
              </button>
              {/* Activity tab */}
              <button
                onClick={() => handleTabChange('activity')}
                className={`px-5 py-3.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer -mb-px ${
                  activeTab === 'activity'
                    ? 'border-[#a78bfa] text-[#a78bfa] bg-[#a78bfa]/5 rounded-t-xl'
                    : 'border-transparent text-on-surface-variant hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">history</span>
                Activity
              </button>
            </div>

            {/* ── EXPENSES TAB ─────────────────────────────────────────────── */}
            {activeTab === 'expenses' && (
              <div className="flex flex-col gap-6 animate-in fade-in duration-200">

                {expenses.length === 0 ? (
                  <div className="text-center py-16 border-2 border-dashed border-outline-variant/20 rounded-2xl bg-white/5 flex flex-col items-center">
                    <span className="material-symbols-outlined text-4xl text-outline-variant/40 mb-3">payments</span>
                    <p className="text-on-surface-variant text-sm font-semibold">No expenses logged yet</p>
                    <button
                      onClick={() => setShowAddExpense(true)}
                      className="mt-3 text-secondary text-xs font-bold uppercase tracking-wider hover:underline cursor-pointer"
                    >
                      Add the first expense
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Month sections */}
                    {monthKeys.map(month => {
                      const monthExpenses = groupedExpenses[month]
                      const monthTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0)
                      return (
                        <div key={month} className="flex flex-col gap-3.5">
                          {/* Month header */}
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[16px] text-secondary">calendar_month</span>
                              <h3 className="text-xs font-bold uppercase tracking-wider text-white">{month}</h3>
                              <span className="text-[9px] font-bold text-on-surface-variant bg-white/5 border border-white/5 px-2 py-0.5 rounded-md">
                                {monthExpenses.length} expense{monthExpenses.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                              Total: ₹{monthTotal.toLocaleString('en-IN')}
                            </span>
                          </div>

                          {/* Expense cards */}
                          <div className="flex flex-col gap-3.5">
                            {monthExpenses.map(expense => {
                              const myShare = expense.splits.find(s => s.user?._id === user._id)
                              const iPaid   = expense.paidBy?._id === user._id
                              const cat     = expense.category || 'other'
                              const colors  = categoryColors[cat] || categoryColors.other
                              return (
                                <div
                                  key={expense._id}
                                  className="glass-card p-5 rounded-2xl hover:border-secondary/20 hover:shadow-lg transition-all duration-200 flex flex-col gap-4 relative animate-in fade-in duration-200"
                                >
                                  {/* Top row */}
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3.5 min-w-0">
                                      <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/5 ${colors.bg}`}>
                                        <span
                                          className={`material-symbols-outlined text-[20px] ${colors.text}`}
                                          style={{ fontVariationSettings: "'FILL' 1, 'wght' 500" }}
                                        >
                                          {categoryIcons[cat] || 'receipt_long'}
                                        </span>
                                      </div>
                                      <div className="min-w-0">
                                        <h4 className="font-extrabold text-sm text-white truncate">{expense.description}</h4>
                                        <p className="text-xs text-on-surface-variant truncate mt-1">
                                          Paid by <span className="font-bold text-white">{iPaid ? 'You' : expense.paidBy?.name}</span>
                                          {' · '}
                                          {new Date(expense.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <span className="font-extrabold text-base text-white block">
                                        ₹{expense.amount.toLocaleString('en-IN')}
                                      </span>
                                      {myShare && (
                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md inline-block mt-2 border ${
                                          iPaid
                                            ? 'bg-green-500/10 text-green-400 border-green-500/25'
                                            : 'bg-red-500/10 text-[#f87171] border-red-500/25'
                                        }`}>
                                          {iPaid
                                            ? `You are owed ₹${(expense.amount - myShare.amount).toLocaleString('en-IN')}`
                                            : `You owe ₹${myShare.amount.toLocaleString('en-IN')}`}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Split details */}
                                  <div className="border-t border-white/5 pt-3.5">
                                    <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Split Details</p>
                                    <div className="flex flex-wrap gap-2">
                                      {expense.splits.map(split => {
                                        const isPayer = split.user?._id === expense.paidBy?._id
                                        return (
                                          <div key={split._id} className={`border rounded-xl px-2.5 py-1.5 flex items-center gap-2 text-xs ${
                                            isPayer ? 'bg-green-500/5 border-green-500/20 text-green-400' : 'bg-white/5 border-white/5 text-on-surface-variant'
                                          }`}>
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] ${
                                              isPayer ? 'bg-green-500 text-white' : 'bg-primary-container text-white'
                                            }`}>
                                              {split.user?.name?.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-[11px] font-medium">
                                              <span className={isPayer ? 'text-green-400 font-bold' : 'text-on-surface-variant'}>
                                                {split.user?._id === user._id ? 'You' : split.user?.name}
                                              </span>
                                              {isPayer && <span className="text-green-400 text-[8px] ml-1 font-bold uppercase tracking-wider">(paid)</span>}:
                                              {' '}<span className={`font-bold ${isPayer ? 'text-green-400' : 'text-white'}`}>₹{split.amount}</span>
                                            </span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>

                                  {/* Delete button */}
                                  {expense.paidBy?._id === user._id && (() => {
                                    const { canDelete, label } = getTimeStatus(expense.createdAt)
                                    if (!canDelete) return null
                                    return (
                                      <button
                                        onClick={() => { setDeleteExpenseError(''); setExpenseToDelete(expense) }}
                                        className="absolute bottom-3.5 right-3.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-[#f87171] opacity-35 hover:opacity-100 transition-all cursor-pointer p-1 rounded-lg border border-transparent hover:bg-white/5 hover:border-white/5"
                                        title="Delete Expense"
                                      >
                                        <span className="material-symbols-outlined text-[15px]">delete</span>
                                        <span>{label}</span>
                                      </button>
                                    )
                                  })()}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}

                    {/* Load More / All loaded */}
                    <div className="flex flex-col items-center gap-2 pt-2">
                      {hasMore ? (
                        <button
                          onClick={fetchMoreExpenses}
                          disabled={loadingMore}
                          className="flex items-center gap-2 px-6 py-3 rounded-xl border border-outline-variant text-primary font-semibold text-sm hover:bg-surface-container-low active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {loadingMore ? (
                            <>
                              <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                              Loading...
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[18px]">expand_more</span>
                              Load more — next 3 months
                            </>
                          )}
                        </button>
                      ) : (
                        <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px] text-secondary">check_circle</span>
                          All {totalMonths} month{totalMonths !== 1 ? 's' : ''} loaded
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── ACTIVITY TAB ─────────────────────────────────────────────── */}
            {activeTab === 'activity' && (
              <div className="flex flex-col gap-2 animate-in fade-in duration-200">

                {activityLoading && activityLogs.length === 0 ? (
                  <div className="flex flex-col gap-3 pt-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-start gap-3 px-1">
                        <div className="w-8 h-8 rounded-xl bg-white/5 animate-pulse flex-shrink-0" />
                        <div className="flex-1 flex flex-col gap-1.5 pt-1">
                          <div className="h-3 w-2/3 bg-white/5 rounded animate-pulse" />
                          <div className="h-2.5 w-1/3 bg-white/5 rounded animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activityLogs.length === 0 ? (
                  <div className="text-center py-16 border-2 border-dashed border-outline-variant/20 rounded-2xl bg-white/5 flex flex-col items-center">
                    <span className="material-symbols-outlined text-4xl text-outline-variant/40 mb-3">history</span>
                    <p className="text-on-surface-variant text-sm font-semibold">No activity yet</p>
                    <p className="text-xs text-on-surface-variant/60 mt-1">Events will appear here as the group is used</p>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-[15px] top-4 bottom-4 w-px bg-white/5" />

                    <div className="flex flex-col">
                      {activityLogs.map((log, idx) => {
                        const cfg = {
                          group_created:        { icon: 'group_add',      color: '#a78bfa', label: () => `created this group` },
                          expense_added:        { icon: 'receipt_long',   color: '#2563eb', label: (l) => `added "${l.meta?.description}" — ₹${Number(l.meta?.amount).toLocaleString('en-IN')}` },
                          expense_deleted:      { icon: 'delete',         color: '#f87171', label: (l) => `deleted expense "${l.meta?.description}" — ₹${Number(l.meta?.amount).toLocaleString('en-IN')}` },
                          settlement_requested: { icon: 'payments',       color: '#4ade80', label: (l) => `sent ₹${Number(l.meta?.amount).toLocaleString('en-IN')} to ${l.meta?.toName}` },
                          settlement_confirmed: { icon: 'check_circle',   color: '#4ade80', label: (l) => `confirmed ₹${Number(l.meta?.amount).toLocaleString('en-IN')} from ${l.meta?.fromName}` },
                          settlement_disputed:  { icon: 'gavel',          color: '#f87171', label: (l) => `disputed ₹${Number(l.meta?.amount).toLocaleString('en-IN')} payment from ${l.meta?.fromName}` },
                          evidence_submitted:   { icon: 'upload_file',    color: '#fbbf24', label: (l) => `submitted payment proof to ${l.meta?.toName}` },
                          dispute_resolved:     { icon: 'verified',       color: '#4ade80', label: (l) => `resolved dispute of ₹${Number(l.meta?.amount).toLocaleString('en-IN')}` },
                          dispute_rejected:     { icon: 'cancel',         color: '#f87171', label: (l) => `rejected proof for dispute of ₹${Number(l.meta?.amount).toLocaleString('en-IN')}` },
                          member_added:         { icon: 'person_add',     color: '#60a5fa', label: (l) => `added ${l.meta?.memberName} to the group` },
                          member_removed:       { icon: 'person_remove',  color: '#f87171', label: () => `removed a member from the group` },
                          member_left:          { icon: 'exit_to_app',    color: '#94a3b8', label: () => `left the group` },
                        }[log.type] || { icon: 'info', color: '#475569', label: () => log.type }

                        const timeAgo = (date) => {
                          const diff = now - new Date(date).getTime()
                          if (diff < 60000)   return 'just now'
                          if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
                          if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
                          return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        }

                        return (
                          <div key={log._id} className={`flex items-start gap-3 py-3 px-1 ${idx !== activityLogs.length - 1 ? 'border-b border-white/5' : ''}`}>
                            {/* Icon */}
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 z-10"
                              style={{ backgroundColor: `${cfg.color}10`, border: `1.5px solid ${cfg.color}25` }}>
                              <span className="material-symbols-outlined text-[14px]" style={{ color: cfg.color, fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-white leading-snug">
                                <span className="font-bold text-white">{log.actor?.name ?? 'Someone'}</span>{' '}
                                <span className="text-on-surface-variant font-medium">{cfg.label(log)}</span>
                              </p>
                              <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40 mt-1">{timeAgo(log.createdAt)}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {activityHasMore && (
                      <button
                        onClick={() => fetchActivity(true)}
                        disabled={activityLoading}
                        className="w-full mt-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant border border-outline-variant/30 rounded-xl hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {activityLoading ? 'Loading...' : `Load more · ${activityTotal - activityLogs.length} remaining`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── DISPUTES TAB ─────────────────────────────────────────────── */}
            {activeTab === 'disputes' && (
              <div className="flex flex-col gap-6 animate-in fade-in duration-200">

                {loadingDisputes ? (
                  <div className="flex flex-col gap-3.5">
                    {[1, 2].map(i => (
                      <div key={i} className="h-24 rounded-2xl animate-pulse bg-white/5" />
                    ))}
                  </div>
                ) : totalDisputeCount === 0 ? (
                  /* Empty state */
                  <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/5" style={{ background: 'rgba(74, 222, 128, 0.02)' }}>
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border border-green-500/20 bg-green-500/10">
                      <span className="material-symbols-outlined text-[32px] text-green-400 font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                    </div>
                    <p className="font-bold text-sm text-white uppercase tracking-wider">No disputes in this group</p>
                    <p className="text-xs mt-1 text-on-surface-variant">All payments are confirmed ✅</p>
                  </div>
                ) : (
                  <>
                    {/* ── SECTION 1: Awaiting Confirmation (pending) ────────── */}
                    {disputes.pending.length > 0 && (
                      <div className="flex flex-col gap-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1 flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-[#fbbf24]">hourglass_empty</span>
                          Awaiting Confirmation
                          <span className="px-2 py-0.5 rounded-full text-[9px] bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/20 font-bold">
                            {disputes.pending.length}
                          </span>
                        </p>
                        {disputes.pending.map(s => {
                          const iAmPayer    = s.from?._id === user._id
                          const iAmReceiver = s.to?._id   === user._id
                          const isDisputingThis = disputingId === s._id
                          return (
                            <div key={s._id} className="rounded-2xl p-5 flex flex-col gap-4 border border-[#fbbf24]/20 shadow-md" style={{ background: 'rgba(251, 191, 36, 0.02)' }}>
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold border border-[#fbbf24]/25 bg-[#fbbf24]/10 text-[#fbbf24]">
                                  {s.from?.name?.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-extrabold text-sm text-white truncate">
                                    {iAmReceiver
                                      ? `💰 ${s.from?.name} claims they paid`
                                      : '⏳ Awaiting Confirmation'}
                                  </p>
                                  <p className="text-xs text-on-surface-variant mt-1">
                                    {iAmReceiver
                                      ? `Amount: ₹${s.amount?.toLocaleString('en-IN')}`
                                      : `Waiting for ${s.to?.name} to confirm ₹${s.amount?.toLocaleString('en-IN')}`}
                                  </p>
                                </div>
                                <span className="text-base font-black flex-shrink-0 text-[#fbbf24]">
                                  ₹{s.amount?.toLocaleString('en-IN')}
                                </span>
                              </div>

                              {s.transactionId && (
                                <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 bg-white/5 border border-white/5">
                                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant">receipt_long</span>
                                  <span className="text-xs font-mono text-on-surface-variant select-all">UTR: {s.transactionId}</span>
                                </div>
                              )}

                              {iAmPayer && (
                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                                  <span className="material-symbols-outlined text-[14px] animate-pulse text-[#fbbf24]">schedule</span>
                                  Submitted {new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                </div>
                              )}

                              {iAmReceiver && (
                                isDisputingThis ? (
                                  <div className="flex flex-col gap-3">
                                    <textarea
                                      value={disputeReason}
                                      onChange={e => setDisputeReason(e.target.value)}
                                      placeholder="Explain what went wrong... e.g. amount is wrong, or did not receive"
                                      rows={2}
                                      className="w-full rounded-xl px-4 py-3 text-sm bg-surface-container-low border border-outline-variant/30 outline-none resize-none text-white transition-all placeholder:text-outline-variant/60"
                                      onFocus={e => e.target.style.borderColor = '#f87171'}
                                      onBlur={e => e.target.style.borderColor = ''}
                                    />
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => { setDisputingId(null); setDisputeReason('') }}
                                        className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 text-on-surface-variant hover:bg-white/5 transition-all cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => handleDisputeSettlement(s._id)}
                                        disabled={!disputeReason.trim() || disputeActionLoading[`dispute-${s._id}`]}
                                        className="flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50 bg-[#f87171]/15 text-[#f87171] border border-[#f87171]/25 hover:bg-[#f87171]/25"
                                      >
                                        {disputeActionLoading[`dispute-${s._id}`]
                                          ? <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                                          : <span className="material-symbols-outlined text-[14px]">flag</span>}
                                        Confirm Dispute
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col sm:flex-row gap-2.5 border-t border-white/5 pt-3">
                                    <button
                                      onClick={() => handleConfirmSettlement(s._id)}
                                      disabled={disputeActionLoading[`confirm-${s._id}`]}
                                      className="flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50 bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
                                    >
                                      {disputeActionLoading[`confirm-${s._id}`]
                                        ? <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                                        : <span className="material-symbols-outlined text-[16px]">verified</span>}
                                      Accept Payment
                                    </button>
                                    <button
                                      onClick={() => { setDisputingId(s._id); setDisputeReason('') }}
                                      className="flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer bg-[#f87171]/10 text-[#f87171] border border-[#f87171]/20 hover:bg-[#f87171]/20"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">close</span>
                                      Dispute Payment
                                    </button>
                                  </div>
                                )
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* ── SECTION 2: Disputed ───────────────────────────────── */}
                    {disputes.disputed.length > 0 && (
                      <div className="flex flex-col gap-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1 flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-[#f87171]">gavel</span>
                          Disputed Settlements
                          <span className="px-2 py-0.5 rounded-full text-[9px] bg-[#f87171]/10 text-[#f87171] border border-[#f87171]/20 font-bold">
                            {disputes.disputed.length}
                          </span>
                        </p>
                        {disputes.disputed.map(s => {
                          const iAmPayer    = s.from?._id === user._id
                          const iAmReceiver = s.to?._id   === user._id
                          const hasEvidence = s.evidence?.utrNumber || s.evidence?.screenshotUrl
                          return (
                            <div key={s._id} className="rounded-2xl flex overflow-hidden border border-[#f87171]/20 shadow-md" style={{ background: 'rgba(248, 113, 113, 0.02)' }}>
                              <div className="w-1.5 flex-shrink-0 bg-[#f87171]" />
                              <div className="flex-1 p-5 flex flex-col gap-4">

                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#f87171]/10 border border-[#f87171]/25">
                                    <span className="material-symbols-outlined text-[20px] text-[#f87171]">gavel</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-extrabold text-sm text-white truncate">
                                      ⚠️ DISPUTED — ₹{s.amount?.toLocaleString('en-IN')}
                                    </p>
                                    <p className="text-xs text-[#f87171] mt-1 font-semibold">
                                      {iAmPayer
                                        ? `${s.to?.name} rejected your payment claim`
                                        : `${s.from?.name} claims they paid you`}
                                    </p>
                                  </div>
                                </div>

                                {/* Dispute reason */}
                                <div className="rounded-xl px-4 py-3 flex items-start gap-2.5 bg-[#f87171]/5 border border-[#f87171]/15">
                                  <span className="material-symbols-outlined text-[15px] mt-0.5 text-[#f87171]" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
                                  <div>
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#f87171] mb-0.5">
                                      {iAmPayer ? `${s.to?.name} says:` : 'You said:'}
                                    </p>
                                    <p className="text-xs text-white leading-normal">"{s.disputeReason || 'No reason provided'}"</p>
                                  </div>
                                </div>

                                {/* Payer view */}
                                {iAmPayer && (
                                  hasEvidence ? (
                                    <div className="rounded-xl px-4 py-3 flex items-center gap-2 bg-secondary/5 border border-secondary/15">
                                      <span className="material-symbols-outlined text-[16px] animate-pulse text-secondary">schedule</span>
                                      <p className="text-xs font-semibold text-on-surface-variant">
                                        Evidence submitted. Waiting for {s.to?.name} to review...
                                      </p>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setActiveDisputeEvidence(s)}
                                      className="w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer bg-secondary text-white shadow-md shadow-secondary/10 hover:brightness-110"
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
                                      <div className="rounded-xl p-4 flex flex-col gap-3 bg-white/5 border border-white/5">
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
                                          Proof submitted by {s.from?.name}
                                        </p>
                                        <div className="flex flex-col gap-2 pt-1">
                                          {s.evidence?.utrNumber && (
                                            <div className="flex items-center gap-2">
                                              <span className="material-symbols-outlined text-[14px] text-green-400">receipt_long</span>
                                              <span className="text-xs font-mono text-white select-all">UTR: {s.evidence.utrNumber}</span>
                                            </div>
                                          )}
                                          {s.evidence?.screenshotUrl && (
                                            <a
                                              href={`http://localhost:5000${s.evidence.screenshotUrl}`}
                                              target="_blank" rel="noopener noreferrer"
                                              className="flex items-center gap-1.5 text-xs font-bold text-secondary uppercase tracking-wider hover:underline"
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
                                            <span className="material-symbols-outlined text-[15px] mt-0.5 flex-shrink-0"
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
                                      <div className="rounded-xl px-4 py-3 flex items-center gap-2 bg-[#fbbf24]/5 border border-[#fbbf24]/15">
                                        <span className="material-symbols-outlined text-[16px] animate-pulse text-[#fbbf24]">hourglass_empty</span>
                                        <p className="text-xs font-semibold text-on-surface-variant">
                                          Waiting for {s.from?.name} to submit evidence...
                                        </p>
                                      </div>
                                    )}
                                    {hasEvidence && (
                                      <div className="flex flex-col sm:flex-row gap-2.5 border-t border-white/5 pt-3">
                                        <button
                                          onClick={() => handleResolveDispute(s._id, true)}
                                          disabled={disputeActionLoading[`resolve-${s._id}`]}
                                          className="flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50 bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
                                        >
                                          {disputeActionLoading[`resolve-${s._id}`]
                                            ? <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                                            : <span className="material-symbols-outlined text-[16px]">check_circle</span>}
                                          Accept & Confirm
                                        </button>
                                        <button
                                          onClick={() => handleResolveDispute(s._id, false)}
                                          disabled={disputeActionLoading[`resolve-${s._id}`]}
                                          className="flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50 bg-[#f87171]/10 text-[#f87171] border border-[#f87171]/20 hover:bg-[#f87171]/20"
                                        >
                                          {disputeActionLoading[`resolve-${s._id}`]
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
                    )}

                    {/* ── SECTION 3: Unresolved ─────────────────────────────── */}
                    {disputes.unresolved.length > 0 && (
                      <div className="flex flex-col gap-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1 flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-[#f59221]">report</span>
                          Unresolved Claims
                          <span className="px-2 py-0.5 rounded-full text-[9px] bg-[#f59221]/15 text-[#f59221] border border-[#f59221]/25 font-bold">
                            {disputes.unresolved.length}
                          </span>
                        </p>
                        {disputes.unresolved.map(s => {
                          const isMe = s.from?._id === user._id
                          return (
                            <div key={s._id} className="rounded-2xl flex overflow-hidden border border-[#f59221]/20 shadow-md" style={{ background: 'rgba(245, 146, 33, 0.02)' }}>
                              <div className="w-1.5 flex-shrink-0 bg-[#f59221]" />
                              <div className="flex-1 p-5 flex flex-col gap-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-extrabold text-sm text-white">
                                      ✕ UNRESOLVED
                                    </p>
                                    <p className="text-xs text-on-surface-variant mt-1 font-semibold">
                                      <span>{isMe ? 'You' : s.from?.name}</span>
                                      <span className="mx-2 font-normal">→</span>
                                      <span>{s.to?._id === user._id ? 'You' : s.to?.name}</span>
                                    </p>
                                  </div>
                                  <span className="text-base font-black flex-shrink-0 text-[#f59221]">
                                    ₹{s.amount?.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 rounded-xl px-3.5 py-3 bg-[#f59221]/5 border border-[#f59221]/15">
                                  <span className="material-symbols-outlined text-[16px] text-[#f59221]">warning</span>
                                  <p className="text-xs text-on-surface-variant leading-relaxed">
                                    Evidence rejected. Please resolve via cash or direct bank transfer.
                                  </p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Right column: Settlement widget + Members ──────────────────── */}
          <div className="lg:col-span-4 flex flex-col gap-6">

            {/* Smart Settlement Bento Card */}
            <div className="glass-card p-6 rounded-3xl relative overflow-hidden border border-white/10 glow-blue">
              {/* Background gradient orb */}
              <div className="absolute -right-12 -top-12 w-28 h-28 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
              <div className="absolute -left-12 -bottom-12 w-28 h-28 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
              
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-blue-400 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                <h3 className="text-base font-extrabold tracking-tight text-white">Smart Settlement</h3>
              </div>
              <p className="text-[11px] text-on-surface-variant font-medium leading-relaxed mb-5">
                Optimal transactions calculated dynamically to clear all balances.
              </p>

              {loadingSettlements ? (
                <div className="space-y-3">
                  <div className="h-12 bg-white/5 rounded-2xl animate-pulse" />
                  <div className="h-12 bg-white/5 rounded-2xl animate-pulse" />
                </div>
              ) : pendingTransactions.length === 0 ? (
                <div className="text-center py-6 bg-white/[0.02] rounded-2xl border border-white/5 flex flex-col items-center">
                  <span className="material-symbols-outlined text-3xl text-emerald-400 mb-2" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <p className="text-xs font-bold text-white uppercase tracking-wider">Settled Up! 🎉</p>
                  <p className="text-[10px] text-on-surface-variant mt-1">Everyone is completely even</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {pendingTransactions.map((t, index) => {
                    const isMe = t.from?._id === user._id
                    return (
                      <div key={index} className="flex justify-between items-center bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 p-3 rounded-2xl text-xs transition-all">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                            {t.from?.name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-white">{isMe ? 'You' : t.from?.name}</span>
                              <span className="material-symbols-outlined text-[12px] text-on-surface-variant">trending_flat</span>
                              <span className="font-semibold text-on-surface-variant">{t.to?._id === user._id ? 'you' : t.to?.name}</span>
                            </div>
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant/60 block mt-0.5">Clearing payment</span>
                          </div>
                        </div>
                        <span className="font-black text-blue-400 text-sm">₹{t.amount.toLocaleString('en-IN')}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {!loadingSettlements && (
                <div className="border-t border-white/5 pt-4 mt-5 flex justify-between items-center text-xs">
                  <span className="text-on-surface-variant font-semibold">Your Net Balance</span>
                  <span className={`font-black text-sm px-2.5 py-1 rounded-xl text-center flex items-center justify-center gap-1 ${
                    myGroupBalance > 0 
                      ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' 
                      : myGroupBalance < 0 
                        ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20' 
                        : 'text-white bg-white/5 border border-white/10'
                  }`}>
                    {myGroupBalance > 0 ? '+' : ''}₹{myGroupBalance.toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-card p-5 rounded-3xl border border-white/5 relative overflow-hidden">
                <div className="absolute -right-6 -bottom-6 w-14 h-14 rounded-full bg-blue-500/5 blur-lg" />
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-blue-400">payments</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Total Spent</span>
                </div>
                <div className="text-xl font-black text-white mt-2">₹{totalSpent.toLocaleString('en-IN')}</div>
              </div>
              
              <div className="glass-card p-5 rounded-3xl border border-white/5 relative overflow-hidden">
                <div className="absolute -right-6 -bottom-6 w-14 h-14 rounded-full bg-indigo-500/5 blur-lg" />
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px] text-indigo-400">pie_chart</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest">My Share</span>
                </div>
                <div className="text-xl font-black text-white mt-2">₹{myShareTotal.toLocaleString('en-IN')}</div>
              </div>
            </div>

            {/* Group Members */}
            <div className="glass-card p-6 rounded-3xl border border-white/5 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h4 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-blue-400 text-lg">group</span>
                  Group Members
                </h4>
                <div className="flex items-center gap-2">
                  {group?.members.find(m => m.user?._id === user._id)?.role === 'admin' && (
                    <button
                      onClick={() => setShowAddMember(true)}
                      className="text-blue-400 hover:text-blue-300 text-xs font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer hover:underline"
                    >
                      <span className="material-symbols-outlined text-[16px]">group_add</span>
                      Invite
                    </button>
                  )}
                  <span className="text-[10px] font-bold bg-white/5 border border-white/10 text-on-surface-variant px-2.5 py-0.5 rounded-xl">
                    {group?.members.length}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {group?.members.map((m) => {
                  const currentUserRole = group.members.find(me => me.user?._id === user._id)?.role
                  const isAdmin = currentUserRole === 'admin'
                  const isSelf  = m.user?._id === user._id
                  return (
                    <div key={m.user?._id} className="flex items-center justify-between text-xs p-2 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] border border-transparent hover:border-white/5 transition-all">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
                          {m.user?.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">
                            {isSelf ? `${m.user?.name} (You)` : m.user?.name}
                          </span>
                          <span className="text-[10px] text-on-surface-variant/70 block truncate">{m.user?.email}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {m.role === 'admin'
                          ? <span className="text-[8px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-lg uppercase">Admin</span>
                          : <span className="text-[8px] font-bold bg-white/5 text-on-surface-variant/60 border border-white/5 px-2 py-0.5 rounded-lg uppercase">Member</span>}
                        {isSelf && (
                          <button
                            onClick={() => { setLeaveError(''); setShowLeaveGroup(true) }}
                            className="w-7 h-7 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-amber-400 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 transition-all cursor-pointer"
                            title="Leave group"
                          >
                            <span className="material-symbols-outlined text-[15px]">logout</span>
                          </button>
                        )}
                        {isAdmin && !isSelf && (
                          <button
                            onClick={() => handleRemoveMember(m.user?._id)}
                            disabled={removingMemberId === m.user?._id}
                            className="w-7 h-7 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer disabled:opacity-40"
                            title={`Remove ${m.user?.name}`}
                          >
                            {removingMemberId === m.user?._id
                              ? <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>
                              : <span className="material-symbols-outlined text-[15px]">person_remove</span>}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {removeError && (
                <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl px-4 py-3 text-xs text-rose-400">
                  <span className="material-symbols-outlined text-[16px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                  <span className="font-semibold leading-normal flex-1">{removeError}</span>
                  <button onClick={() => setRemoveError('')} className="flex-shrink-0 opacity-60 hover:opacity-100 cursor-pointer">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              )}

              {/* Delete Group */}
              {group?.members.find(m => m.user?._id === user._id)?.role === 'admin' && (
                <div className="border-t border-white/5 pt-4 mt-1">
                  <button
                    onClick={() => setShowDeleteGroup(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-rose-500/25 hover:border-rose-500/40 text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 text-xs font-bold transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                    Delete Group
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── DisputeEvidenceModal ──────────────────────────────────────────────── */}
      {activeDisputeEvidence && (
        <DisputeEvidenceModal
          settlement={activeDisputeEvidence}
          onClose={() => setActiveDisputeEvidence(null)}
          onEvidenceSubmitted={() => { setActiveDisputeEvidence(null); fetchDisputes(); fetchSettlements() }}
        />
      )}

      {/* ── Delete Expense Modal ──────────────────────────────────────────────── */}
      {expenseToDelete && (() => {
        const { canDelete, label } = getTimeStatus(expenseToDelete.createdAt)
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="glass-card rounded-3xl max-w-sm w-full border border-rose-500/20 shadow-2xl p-6 animate-in zoom-in-95 duration-200 relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-rose-500/5 blur-xl pointer-events-none" />
              
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-rose-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>delete</span>
              </div>
              
              <h3 className="text-base font-extrabold text-white text-center">Delete Expense?</h3>
              
              <div className="mt-4 bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3 flex items-center justify-between text-xs">
                <span className="font-bold text-white truncate max-w-[60%]">{expenseToDelete.description}</span>
                <span className="font-black text-rose-400">₹{expenseToDelete.amount?.toLocaleString('en-IN')}</span>
              </div>
              
              <p className="text-[11px] text-on-surface-variant text-center mt-3 leading-relaxed font-semibold">
                This will permanently remove the expense and recalculate all balances. This action cannot be undone.
              </p>
              
              <div className={`flex items-center justify-center gap-1.5 mt-4 text-[10px] font-bold uppercase tracking-wider rounded-xl px-3 py-2 border ${
                canDelete 
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                <span className="material-symbols-outlined text-[13px]">{canDelete ? 'timer' : 'timer_off'}</span>
                {canDelete ? `Deletion allowed · ${label}` : 'Deletion window expired (2 hours)'}
              </div>
              
              {deleteExpenseError && (
                <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5 text-xs text-rose-400 mt-3 animate-in fade-in duration-200">
                  <span className="material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                  <span className="font-semibold leading-normal">{deleteExpenseError}</span>
                </div>
              )}
              
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setExpenseToDelete(null); setDeleteExpenseError('') }}
                  disabled={deletingExpense}
                  className="flex-1 py-3 border border-white/10 rounded-2xl text-white font-bold text-xs uppercase tracking-wider hover:bg-white/5 transition-all cursor-pointer disabled:opacity-50"
                >Cancel</button>
                <button
                  onClick={handleDeleteExpense}
                  disabled={deletingExpense || !canDelete}
                  className="flex-1 py-3 bg-rose-500 text-white rounded-2xl font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 shadow-md shadow-rose-500/10 border border-rose-500/20 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deletingExpense
                    ? <><span className="material-symbols-outlined text-[15px] animate-spin">sync</span> Deleting...</>
                    : <><span className="material-symbols-outlined text-[15px]">delete</span> Yes, Delete</>}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Add Expense Modal ─────────────────────────────────────────────────── */}
      {showAddExpense && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="glass-modal rounded-3xl max-w-2xl w-full border border-white/10 shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-200">
            {/* Left section: Category and Amount */}
            <div className="md:w-5/12 bg-white/[0.02] border-b md:border-b-0 md:border-r border-white/5 p-6 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-blue-500/5 blur-xl pointer-events-none" />
              
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <button onClick={() => setShowAddExpense(false)} className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-pointer text-white">
                    <span className="material-symbols-outlined text-white text-sm">close</span>
                  </button>
                  <h3 className="text-base font-extrabold text-white">Add Expense</h3>
                </div>
                
                <div className="space-y-5 mt-6">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">What was this for?</label>
                    <input
                      type="text" placeholder="Dinner, Movie, Rent..."
                      value={expenseForm.description}
                      onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                      className="w-full bg-transparent border-0 border-b border-white/10 focus:border-blue-500 focus:ring-0 text-white font-bold text-lg placeholder:text-white/20 transition-all p-0 pb-2 ml-1"
                      required
                    />
                  </div>
                  
                  <div className="space-y-1.5 pt-2">
                    <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">How much?</label>
                    <div className="flex items-center gap-1.5 ml-1">
                      <span className="font-black text-lg text-blue-400">₹</span>
                      <input
                        type="number" placeholder="0.00"
                        value={expenseForm.amount}
                        onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                        className="w-full bg-transparent border-0 border-b border-white/10 focus:border-blue-500 focus:ring-0 text-white font-bold text-lg placeholder:text-white/20 transition-all p-0 pb-2"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="pt-4">
                    <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">Select Category</p>
                    <div className="grid grid-cols-4 gap-2">
                      {(['food', 'travel', 'shopping', 'other']).map((cat) => {
                        const icons  = { food: 'restaurant', travel: 'flight', shopping: 'shopping_cart', other: 'receipt_long' }
                        const labels = { food: 'Food', travel: 'Travel', shopping: 'Shopping', other: 'Other' }
                        const isActive = expenseForm.category === cat
                        return (
                          <button key={cat} type="button"
                            onClick={() => setExpenseForm({ ...expenseForm, category: cat })}
                            className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl border transition-all cursor-pointer ${
                              isActive 
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-md shadow-blue-500/5' 
                                : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/5 text-white/50 hover:text-white/80'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: ` 'FILL' ${isActive ? 1 : 0}` }}>{icons[cat]}</span>
                            <span className="text-[9px] font-extrabold capitalize">{labels[cat]}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="hidden md:flex justify-center opacity-10 mt-6 pointer-events-none">
                <span className="material-symbols-outlined text-[80px]" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
              </div>
            </div>
            
            {/* Right section: Split and Save */}
            <form onSubmit={handleAddExpense} className="md:w-7/12 p-6 flex flex-col justify-between bg-transparent">
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Split Method</p>
                <div className="bg-white/5 border border-white/5 p-1 rounded-2xl flex gap-1 mb-5">
                  <button type="button" className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-white/10 text-white border border-white/5 shadow-sm">Split Equally</button>
                  <button type="button" disabled className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white/20 cursor-not-allowed">Exact Amount</button>
                </div>
                
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">Split with group members</p>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                  {group?.members.map((m) => (
                    <div key={m.user?._id} className="p-3 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-between text-xs transition-all">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white flex items-center justify-center font-bold text-[10px]">
                          {m.user?.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-white">{m.user?._id === user._id ? 'You' : m.user?.name}</p>
                          <p className="text-[9px] text-on-surface-variant/70 font-semibold">{m.user?._id === user._id ? 'Paid full amount' : 'Owes split'}</p>
                        </div>
                      </div>
                      <span className="font-bold text-white/80">
                        ₹{expenseForm.amount ? (parseFloat(expenseForm.amount) / group.members.length).toFixed(2) : '0.00'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="border-t border-white/5 pt-4 mt-6 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-on-surface-variant text-[11px] font-semibold">
                  <span className="material-symbols-outlined text-[16px] text-blue-400">event</span>
                  <span>Today</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowAddExpense(false)} className="px-4 py-2 border border-white/10 rounded-xl text-white font-bold text-xs uppercase tracking-wider hover:bg-white/5 transition-all cursor-pointer">Cancel</button>
                  <button type="submit" disabled={addingExpense} className="px-5 py-2 bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md shadow-blue-500/10 border border-blue-500/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50">
                    {addingExpense ? 'Saving...' : 'Save Expense'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Member Modal ──────────────────────────────────────────────────── */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="glass-card rounded-3xl max-w-md w-full border border-white/10 shadow-2xl p-6 animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-blue-500/5 blur-xl pointer-events-none" />
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-lg">group_add</span>
                Invite a Member
              </h3>
              <button onClick={() => { setShowAddMember(false); setAddMemberError(''); setMemberEmail('') }} className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-pointer text-white">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            
            <form onSubmit={handleAddMember} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">Member's Email</label>
                <input
                  type="email" placeholder="their@email.com"
                  value={memberEmail}
                  onChange={e => { setMemberEmail(e.target.value); setAddMemberError('') }}
                  className={`w-full px-4 py-3 bg-white/[0.02] border rounded-2xl text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all ${
                    addMemberError ? 'border-rose-500/50' : 'border-white/10'
                  }`}
                  required
                />
              </div>
              
              {addMemberError && (
                <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-2xl px-4 py-3 text-xs text-rose-400 animate-in fade-in duration-200">
                  <span className="material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                  <span className="font-semibold leading-normal">{addMemberError}</span>
                </div>
              )}
              
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={addingMember} className="flex-1 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider bg-blue-500 text-white shadow-md shadow-blue-500/10 border border-blue-500/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50">
                  {addingMember ? 'Adding...' : 'Invite'}
                </button>
                <button type="button" onClick={() => { setShowAddMember(false); setAddMemberError(''); setMemberEmail('') }} className="flex-1 py-3 border border-white/10 rounded-2xl text-white font-bold text-xs uppercase tracking-wider hover:bg-white/5 transition-all cursor-pointer">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Leave Group Modal ─────────────────────────────────────────────────── */}
      {showLeaveGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="glass-card rounded-3xl max-w-sm w-full border border-amber-500/20 shadow-2xl p-6 animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-amber-500/5 blur-xl pointer-events-none" />
            
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-amber-500 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>logout</span>
            </div>
            
            <h3 className="text-base font-extrabold text-white text-center">Leave Group?</h3>
            <p className="text-xs text-on-surface-variant text-center mt-3 leading-relaxed font-semibold">
              You will be removed from <span className="font-bold text-white">{group?.name}</span>. You can only leave if your balance is fully settled.
            </p>
            
            {leaveError && (
              <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5 text-xs text-rose-400 mt-4 animate-in fade-in duration-200">
                <span className="material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                <span className="font-semibold leading-normal">{leaveError}</span>
              </div>
            )}
            
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowLeaveGroup(false)} disabled={leavingGroup} className="flex-1 py-3 border border-white/10 rounded-2xl text-white font-bold text-xs uppercase tracking-wider hover:bg-white/5 transition-all cursor-pointer disabled:opacity-50">Cancel</button>
              <button onClick={handleLeaveGroup} disabled={leavingGroup} className="flex-1 py-3 bg-amber-500 text-white rounded-2xl font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 shadow-md shadow-amber-500/10 border border-amber-500/20 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                {leavingGroup ? <><span className="material-symbols-outlined text-[15px] animate-spin">sync</span> Leaving...</> : <><span className="material-symbols-outlined text-[15px]">logout</span> Yes, Leave</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Group Modal ────────────────────────────────────────────────── */}
      {showDeleteGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="glass-card rounded-3xl max-w-sm w-full border border-rose-500/20 shadow-2xl p-6 animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-rose-500/5 blur-xl pointer-events-none" />
            
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-rose-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>delete_forever</span>
            </div>
            
            <h3 className="text-base font-extrabold text-white text-center">Delete Group?</h3>
            <p className="text-xs text-on-surface-variant text-center mt-3 leading-relaxed font-semibold">
              This will permanently delete <span className="font-bold text-white">{group?.name}</span> and all its data. This action cannot be undone.
            </p>
            
            {deleteError && (
              <div className="flex flex-col gap-2 bg-rose-500/10 border border-rose-500/20 rounded-2xl px-3 py-3 text-xs text-rose-400 mt-4 animate-in fade-in duration-200">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                  <span className="font-semibold leading-normal">{deleteError}</span>
                </div>
                <button onClick={() => { setShowDeleteGroup(false); navigate(`/settle/${id}`) }} className="self-end text-[10px] font-bold text-rose-400 underline underline-offset-2 hover:opacity-80 cursor-pointer">
                  Go to Settle Up →
                </button>
              </div>
            )}
            
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowDeleteGroup(false); setDeleteError('') }} disabled={deletingGroup} className="flex-1 py-3 border border-white/10 rounded-2xl text-white font-bold text-xs uppercase tracking-wider hover:bg-white/5 transition-all cursor-pointer disabled:opacity-50">Cancel</button>
              <button onClick={handleDeleteGroup} disabled={deletingGroup || !!deleteError} className="flex-1 py-3 bg-rose-500 text-white rounded-2xl font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 shadow-md shadow-rose-500/10 border border-rose-500/20 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                {deletingGroup ? <><span className="material-symbols-outlined text-[15px] animate-spin">sync</span> Deleting...</> : <><span className="material-symbols-outlined text-[15px]">delete_forever</span> Yes, Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}