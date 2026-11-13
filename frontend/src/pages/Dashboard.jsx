import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from '../api/axios'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'

const currency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Math.abs(amount || 0))

const groupIcon = (name = '') => {
  const value = name.toLowerCase()
  if (/trip|travel|goa|holiday/.test(value)) return 'flight_takeoff'
  if (/home|flat|room|rent|hostel/.test(value)) return 'apartment'
  if (/food|dinner|lunch|party/.test(value)) return 'restaurant'
  if (/college|class|campus/.test(value)) return 'school'
  return 'groups'
}

const activityIcon = (category = 'other') => ({
  food: 'restaurant', travel: 'flight_takeoff', shopping: 'shopping_bag', rent: 'apartment',
  groceries: 'shopping_basket', entertainment: 'movie', medical: 'medical_services', fuel: 'local_gas_station',
}[category] || 'receipt_long')

const readRecentGroupIds = () => {
  try { return JSON.parse(localStorage.getItem('settl_recent_groups') || '[]') } catch { return [] }
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [groupBalances, setGroupBalances] = useState({})
  const [activities, setActivities] = useState([])
  const [totalOwed, setTotalOwed] = useState(0)
  const [totalOwe, setTotalOwe] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showExpensePicker, setShowExpensePicker] = useState(false)
  const [showSettlePicker, setShowSettlePicker] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  const firstName = (user?.name || 'there').trim().split(/\s+/)[0]
  const netBalance = totalOwed - totalOwe

  const fetchOverview = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: groupData } = await axios.get('/groups')
      setGroups(groupData)
      const [balanceResults, expenseResults] = await Promise.all([
        Promise.all(groupData.map(async group => {
          try {
            const { data } = await axios.get(`/settlements/simplify/${group._id}`)
            const transactions = data.transactions || []
            let owed = 0
            let owe = 0
            transactions.forEach(transaction => {
              const fromId = transaction.from?._id?.toString?.() || transaction.from?._id
              const toId = transaction.to?._id?.toString?.() || transaction.to?._id
              if (fromId === user?._id) owe += Number(transaction.amount || 0)
              if (toId === user?._id) owed += Number(transaction.amount || 0)
            })
            return { group, owed, owe, pending: (data.pendingRequests || []).length, schedules: data.scheduleRequests || [] }
          } catch {
            return { group, owed: 0, owe: 0, pending: 0, schedules: [] }
          }
        })),
        Promise.all(groupData.map(async group => {
          try {
            const { data } = await axios.get(`/expenses/group/${group._id}?months=1&page=1`)
            return (data.expenses || []).map(expense => ({ ...expense, groupId: group._id, groupName: group.name }))
          } catch { return [] }
        })),
      ])

      const balanceMap = {}
      let owed = 0
      let owe = 0
      let pending = 0
      balanceResults.forEach(result => {
        balanceMap[result.group._id] = { net: result.owed - result.owe, owed: result.owed, owe: result.owe, pending: result.pending, schedules: result.schedules }
        owed += result.owed
        owe += result.owe
        pending += result.pending
      })
      setGroupBalances(balanceMap)
      setTotalOwed(owed)
      setTotalOwe(owe)
      setPendingCount(pending)
      setActivities(expenseResults.flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6))
    } catch (err) {
      setError(err.response?.data?.message || 'Your overview could not be loaded. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [user?._id])

  useEffect(() => {
    const timer = window.setTimeout(() => fetchOverview(), 0)
    return () => window.clearTimeout(timer)
  }, [fetchOverview])

  const recentGroups = useMemo(() => {
    const ids = readRecentGroupIds()
    const byId = new Map(groups.map(group => [group._id, group]))
    const visited = ids.map(id => byId.get(id)).filter(Boolean)
    const fallback = [...groups].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    return [...visited, ...fallback.filter(group => !visited.some(item => item._id === group._id))].slice(0, 3)
  }, [groups])

  const handleResendVerification = async () => {
    setResending(true)
    setResendMessage('')
    try {
      await axios.post('/auth/resend-verification')
      setResendMessage('Verification email sent. Check your inbox.')
    } catch (err) {
      setResendMessage(err.response?.data?.message || 'Could not send the verification email.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="app-page min-h-screen pt-14 pb-20 md:pt-0 md:pb-0 md:pl-64">
      <Navbar />
      <main className="app-main">
        {!user?.isEmailVerified && !bannerDismissed && (
          <div className="app-card px-4 py-3 mb-6 border-amber-300/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0"><span className="material-symbols-outlined">mark_email_unread</span></span>
              <div className="min-w-0"><p className="text-xs font-bold">Verify your email address</p><p className="text-xs app-muted mt-0.5">{resendMessage || `We sent a verification link to ${user?.email}.`}</p></div>
            </div>
            <div className="flex items-center gap-2"><button onClick={handleResendVerification} disabled={resending} className="text-xs font-bold text-amber-700">{resending ? 'Sending…' : 'Resend email'}</button><button onClick={() => setBannerDismissed(true)} aria-label="Dismiss" className="w-8 h-8 rounded-lg hover:bg-[var(--surface-container-low)] app-muted"><span className="material-symbols-outlined text-[18px]">close</span></button></div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-8">
          <div><p className="app-page-kicker mb-3">Personal overview</p><h1 className="app-page-title">Good to see you, {firstName}.</h1><p className="app-page-subtitle">Here's where your shared money stands today.</p></div>
          <button onClick={() => navigate('/groups?create=1')} className="app-button-secondary self-start sm:self-auto"><span className="material-symbols-outlined text-[18px]">add</span> Create group</button>
        </div>

        {error && <div className="app-card p-4 mb-6 text-sm text-rose-500 flex items-center justify-between gap-3">{error}<button onClick={fetchOverview} className="font-bold underline">Retry</button></div>}

        <section className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-4 mb-7">
          <div className="rounded-[24px] bg-[#172544] text-white p-6 sm:p-8 relative overflow-hidden shadow-[0_18px_46px_rgba(22,39,73,.18)]">
            <div className="absolute -right-20 -top-28 w-80 h-80 rounded-full border border-white/10"/>
            <div className="absolute right-10 -bottom-28 w-72 h-72 rounded-full border border-white/10"/>
            <div className="absolute right-20 top-16 w-36 h-36 rounded-full bg-blue-500/20 blur-3xl"/>
            <div className="relative z-10">
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[.17em] text-white/55">Your net position</p><span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-white/70">Across {groups.length} {groups.length === 1 ? 'group' : 'groups'}</span></div>
              {loading ? <div className="h-12 w-48 bg-white/10 rounded-xl animate-pulse mt-4"/> : <p className="text-4xl sm:text-5xl font-extrabold tracking-[-.06em] tabular-nums mt-5">{netBalance < 0 ? '-' : netBalance > 0 ? '+' : ''}{currency(netBalance)}</p>}
              <p className="text-xs text-white/60 mt-3">{netBalance > 0.005 ? 'Overall, people owe you more than you owe.' : netBalance < -0.005 ? 'Overall, you owe more than people owe you.' : 'You are all settled across your groups.'}</p>
              <div className="flex flex-wrap gap-2 mt-7">
                <button onClick={() => setShowSettlePicker(true)} disabled={!groups.length || (totalOwed === 0 && totalOwe === 0)} className="min-h-10 px-4 rounded-xl bg-white text-[#172544] text-xs font-bold hover:bg-blue-50 disabled:opacity-50">Settle up <span aria-hidden>↗</span></button>
                <button onClick={() => setShowExpensePicker(true)} disabled={!groups.length} className="min-h-10 px-4 rounded-xl border border-white/20 bg-white/5 text-white text-xs font-bold hover:bg-white/10 disabled:opacity-50">Add an expense</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
            <div className="app-card p-5 flex items-center justify-between gap-3">
              <div><p className="app-stat-label mb-2">Owed to you</p>{loading ? <div className="w-24 h-7 rounded bg-[var(--surface-container)] animate-pulse"/> : <p className="app-stat-value app-balance-positive">{currency(totalOwed)}</p>}<p className="text-[11px] app-muted mt-2">Money others need to pay you</p></div>
              <span className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center"><span className="material-symbols-outlined">south_west</span></span>
            </div>
            <div className="app-card p-5 flex items-center justify-between gap-3">
              <div><p className="app-stat-label mb-2">You owe</p>{loading ? <div className="w-24 h-7 rounded bg-[var(--surface-container)] animate-pulse"/> : <p className="app-stat-value app-balance-negative">{currency(totalOwe)}</p>}<p className="text-[11px] app-muted mt-2">{pendingCount ? `${pendingCount} payment requests awaiting confirmation` : 'Your outstanding payments'}</p></div>
              <span className="w-11 h-11 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center"><span className="material-symbols-outlined">north_east</span></span>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1.35fr_.85fr] gap-7">
          <div>
            <div className="flex items-end justify-between gap-3 mb-4"><div><p className="app-page-kicker mb-2">Quick access</p><h2 className="text-lg font-bold tracking-tight">Recently visited groups</h2></div><Link to="/groups" className="text-xs font-bold text-[var(--secondary)] hover:underline whitespace-nowrap">View all groups <span aria-hidden>→</span></Link></div>
            {loading ? <div className="grid sm:grid-cols-2 gap-3">{[1,2].map(value => <div key={value} className="app-card h-40 animate-pulse"/>)}</div> : recentGroups.length === 0 ? (
              <div className="app-empty-state p-7 text-center"><span className="app-icon-tile w-12 h-12 rounded-2xl mx-auto"><span className="material-symbols-outlined">groups</span></span><h3 className="font-bold mt-4">Create your first group</h3><p className="app-muted text-xs mt-1">Bring your friends together to start splitting expenses.</p><button onClick={() => navigate('/groups?create=1')} className="app-button-primary mt-4">Create a group</button></div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {recentGroups.map(group => {
                  const balance = groupBalances[group._id]?.net || 0
                  return <Link key={group._id} to={`/group/${group._id}`} className="app-card app-card-hover p-4 flex items-center gap-3 group">
                    <span className="app-icon-tile shrink-0"><span className="material-symbols-outlined">{groupIcon(group.name)}</span></span>
                    <span className="flex-1 min-w-0"><span className="block text-sm font-bold truncate group-hover:text-[var(--secondary)]">{group.name}</span><span className="block text-[10px] app-muted mt-1">{group.members?.length || 0} members</span><span className={`block text-[11px] font-bold mt-2 ${balance > 0.005 ? 'app-balance-positive' : balance < -0.005 ? 'app-balance-negative' : 'app-muted'}`}>{balance > 0.005 ? `Owed ${currency(balance)}` : balance < -0.005 ? `You owe ${currency(balance)}` : 'All settled'}</span></span>
                    <span className="material-symbols-outlined app-muted text-[18px]">arrow_outward</span>
                  </Link>
                })}
                {groups.length > 3 && <Link to="/groups" className="app-empty-state p-4 flex items-center justify-center text-xs font-bold text-[var(--secondary)]">Explore {groups.length - 3} more groups <span className="material-symbols-outlined text-[16px] ml-1">arrow_forward</span></Link>}
              </div>
            )}

            <div className="flex items-end justify-between gap-3 mt-8 mb-4"><div><p className="app-page-kicker mb-2">Latest updates</p><h2 className="text-lg font-bold tracking-tight">Recent expenses</h2></div>{groups.length > 0 && <Link to="/groups" className="text-xs font-bold text-[var(--secondary)] hover:underline">Browse groups</Link>}</div>
            <div className="app-card overflow-hidden">
              {loading ? <div className="p-5 space-y-4">{[1,2,3].map(value => <div key={value} className="h-12 bg-[var(--surface-container-low)] rounded-xl animate-pulse"/>)}</div> : activities.length === 0 ? <div className="p-8 text-center"><span className="app-icon-tile w-11 h-11 mx-auto"><span className="material-symbols-outlined">receipt_long</span></span><p className="font-bold text-sm mt-3">No expenses yet</p><p className="app-muted text-xs mt-1">Your latest group expenses will show up here.</p></div> : activities.map(expense => <button key={expense._id} onClick={() => navigate(`/group/${expense.groupId}`)} className="w-full flex items-center gap-3.5 px-4 sm:px-5 py-4 text-left border-b last:border-0 app-divider hover:bg-[var(--surface-container-low)]">
                <span className="app-icon-tile w-10 h-10 rounded-xl shrink-0"><span className="material-symbols-outlined text-[19px]">{activityIcon(expense.category)}</span></span>
                <span className="flex-1 min-w-0"><span className="block text-xs font-bold truncate">{expense.description}</span><span className="block text-[10px] app-muted mt-1 truncate">{expense.groupName} · {new Date(expense.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></span>
                <span className="text-sm font-bold tabular-nums whitespace-nowrap">{currency(expense.amount)}</span>
              </button>)}
            </div>
          </div>

          <aside className="space-y-4">
            <div><p className="app-page-kicker mb-2">Shortcuts</p><h2 className="text-lg font-bold tracking-tight mb-4">Keep things moving</h2></div>
            <button onClick={() => setShowExpensePicker(true)} className="app-card app-card-hover p-4 w-full flex items-center gap-3 text-left"><span className="app-icon-tile"><span className="material-symbols-outlined">add_card</span></span><span className="flex-1"><span className="block text-sm font-bold">Add an expense</span><span className="block text-[11px] app-muted mt-1">Record a shared payment</span></span><span className="material-symbols-outlined app-muted">chevron_right</span></button>
            <button onClick={() => setShowSettlePicker(true)} className="app-card app-card-hover p-4 w-full flex items-center gap-3 text-left"><span className="app-icon-tile"><span className="material-symbols-outlined">payments</span></span><span className="flex-1"><span className="block text-sm font-bold">Settle up</span><span className="block text-[11px] app-muted mt-1">Clear outstanding balances</span></span><span className="material-symbols-outlined app-muted">chevron_right</span></button>
            <Link to="/groups" className="app-card app-card-hover p-4 flex items-center gap-3"><span className="app-icon-tile"><span className="material-symbols-outlined">group_add</span></span><span className="flex-1"><span className="block text-sm font-bold">Explore groups</span><span className="block text-[11px] app-muted mt-1">Manage your group spaces</span></span><span className="material-symbols-outlined app-muted">chevron_right</span></Link>
            <div className="rounded-[20px] bg-[var(--app-blue-soft)] border border-[color-mix(in_srgb,var(--secondary)_12%,transparent)] p-5 mt-3">
              <span className="w-9 h-9 rounded-xl bg-[var(--surface)] text-[var(--secondary)] flex items-center justify-center"><span className="material-symbols-outlined">lightbulb</span></span>
              <h3 className="text-sm font-bold mt-4">A small habit that helps</h3>
              <p className="text-xs leading-relaxed text-[var(--on-secondary-container)] mt-2">Add shared expenses on the day they happen. Everyone sees the same numbers, and settling up stays straightforward.</p>
            </div>
          </aside>
        </section>
      </main>

      {showExpensePicker && (
        <div className="fixed inset-0 z-[70] glass-modal flex items-center justify-center p-4" onClick={event => event.target === event.currentTarget && setShowExpensePicker(false)}>
          <div className="app-card w-full max-w-md p-5 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-5"><div><p className="app-page-kicker">New expense</p><h2 className="text-lg font-bold mt-1">Choose a group</h2><p className="app-muted text-xs mt-1">Where should this expense be recorded?</p></div><button onClick={() => setShowExpensePicker(false)} className="w-9 h-9 rounded-xl hover:bg-[var(--surface-container-low)] app-muted"><span className="material-symbols-outlined">close</span></button></div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">{groups.map(group => <button key={group._id} onClick={() => navigate(`/group/${group._id}?action=add-expense`)} className="w-full flex items-center gap-3 p-3 rounded-xl border app-divider hover:bg-[var(--surface-container-low)] text-left"><span className="app-icon-tile w-9 h-9 rounded-xl"><span className="material-symbols-outlined">{groupIcon(group.name)}</span></span><span className="flex-1 min-w-0"><span className="block text-xs font-bold truncate">{group.name}</span><span className="block text-[10px] app-muted">{group.members?.length || 0} members</span></span><span className="material-symbols-outlined app-muted text-[18px]">arrow_forward</span></button>)}</div>
          </div>
        </div>
      )}

      {showSettlePicker && (
        <div className="fixed inset-0 z-[70] glass-modal flex items-center justify-center p-4" onClick={event => event.target === event.currentTarget && setShowSettlePicker(false)}>
          <div className="app-card w-full max-w-md p-5 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-5"><div><p className="app-page-kicker">Settle up</p><h2 className="text-lg font-bold mt-1">Choose a group</h2><p className="app-muted text-xs mt-1">Open the group balance and payment details.</p></div><button onClick={() => setShowSettlePicker(false)} className="w-9 h-9 rounded-xl hover:bg-[var(--surface-container-low)] app-muted"><span className="material-symbols-outlined">close</span></button></div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">{groups.map(group => <button key={group._id} onClick={() => navigate(`/settle/${group._id}`)} className="w-full flex items-center gap-3 p-3 rounded-xl border app-divider hover:bg-[var(--surface-container-low)] text-left"><span className="app-icon-tile w-9 h-9 rounded-xl"><span className="material-symbols-outlined">payments</span></span><span className="flex-1 min-w-0 text-xs font-bold truncate">{group.name}</span><span className="material-symbols-outlined app-muted text-[18px]">arrow_forward</span></button>)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
