import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from '../api/axios'
import Navbar from '../components/Navbar'
import { useNotifications } from '../context/NotificationContext'

const ACTIVITY_META = {
  expense_added: ['receipt_long', 'Expense added'],
  expense_deleted: ['delete_outline', 'Expense deleted'],
  settlement_requested: ['payments', 'Payment marked as paid'],
  settlement_confirmed: ['verified', 'Payment confirmed'],
  settlement_rejected: ['cancel', 'Payment rejected'],
  settlement_cancelled: ['undo', 'Payment cancelled'],
  settlement_expired: ['schedule', 'Payment expired'],
  schedule_proposed: ['event', 'Payment date proposed'],
  schedule_accepted: ['event_available', 'Payment date accepted'],
  schedule_rejected: ['event_busy', 'Payment date declined'],
  schedule_cancelled: ['event_busy', 'Payment schedule cancelled'],
  schedule_completed: ['task_alt', 'Payment schedule completed'],
  member_added: ['person_add', 'Member added'],
  member_removed: ['person_remove', 'Member removed'],
  member_left: ['logout', 'Member left'],
  group_created: ['groups', 'Group created'],
}

const dateLabel = (date) => {
  const value = new Date(date)
  const today = new Date()
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startDate = new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const days = Math.round((startToday - startDate) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return value.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

const timeLabel = (date) => new Date(date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

const describeActivity = (item) => {
  const actor = item.actor?.name || 'A group member'
  const meta = item.meta || {}
  switch (item.type) {
    case 'expense_added': return `${actor} added “${meta.description || 'an expense'}”`
    case 'expense_deleted': return `${actor} deleted “${meta.description || 'an expense'}”`
    case 'settlement_requested': return `${actor} marked a payment of ₹${Number(meta.amount || 0).toLocaleString('en-IN')} as paid`
    case 'settlement_confirmed': return `${actor} confirmed a payment of ₹${Number(meta.amount || 0).toLocaleString('en-IN')}`
    case 'settlement_rejected': return `${actor} rejected a payment request`
    case 'settlement_cancelled': return `${actor} cancelled a payment request`
    case 'settlement_expired': return `${actor} payment request expired`
    case 'schedule_proposed': return `${actor} proposed a payment date`
    case 'schedule_accepted': return `${actor} accepted a payment schedule`
    case 'schedule_rejected': return `${actor} declined a payment schedule`
    case 'schedule_cancelled': return `${actor} cancelled a payment schedule`
    case 'schedule_completed': return `${actor} completed a scheduled payment`
    case 'member_added': return `${actor} added a member to the group`
    case 'member_removed': return `${actor} removed a member from the group`
    case 'member_left': return `${actor} left the group`
    case 'group_created': return `${actor} created ${meta.groupName || 'the group'}`
    default: return `${actor} updated the group`
  }
}

export default function Activity() {
  const navigate = useNavigate()
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications()
  const [tab, setTab] = useState('notifications')
  const [groups, setGroups] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [groupFilter, setGroupFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('30')
  const [error, setError] = useState('')
  const [now, setNow] = useState(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (tab !== 'history') return
      setLoading(true)
      setError('')
      try {
        const { data: groupData } = await axios.get('/groups')
        if (cancelled) return
        setGroups(groupData)
        const results = await Promise.all(groupData.map(async group => {
          try {
            const { data } = await axios.get(`/settlements/group/${group._id}/activity?limit=100&skip=0`)
            return (data.logs || []).map(log => ({ ...log, groupName: group.name, groupId: group._id }))
          } catch {
            return []
          }
        }))
        if (!cancelled) setItems(results.flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Activity history could not be loaded.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [tab])

  const visibleItems = useMemo(() => {
    const cutoff = dateFilter === 'all' || now === null ? 0 : now - Number(dateFilter) * 86400000
    return items.filter(item => {
      if (groupFilter !== 'all' && item.groupId !== groupFilter) return false
      if (typeFilter !== 'all') {
        const type = item.type.startsWith('expense_') ? 'expenses'
          : item.type.startsWith('settlement_') || item.type.startsWith('schedule_') ? 'payments'
            : 'members'
        if (type !== typeFilter) return false
      }
      return new Date(item.createdAt).getTime() >= cutoff
    })
  }, [items, groupFilter, typeFilter, dateFilter, now]

  const groupedItems = useMemo(() => {
    const map = new Map()
    visibleItems.forEach(item => {
      const label = dateLabel(item.createdAt)
      if (!map.has(label)) map.set(label, [])
      map.get(label).push(item)
    })
    return Array.from(map.entries())
  }, [visibleItems])

  return (
    <div className="app-page min-h-screen pt-14 pb-20 md:pt-0 md:pb-0 md:pl-64">
      <Navbar />
      <main className="app-main">
        <div className="mb-8">
          <p className="app-page-kicker mb-3">Your updates</p>
          <h1 className="app-page-title">Activity</h1>
          <p className="app-page-subtitle">A clear view of what needs your attention and what has happened across your groups.</p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-container)] w-full sm:w-fit mb-6">
          <button onClick={() => setTab('notifications')} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${tab === 'notifications' ? 'bg-[var(--surface)] text-[var(--on-surface)] shadow-sm' : 'app-muted'}`}>
            <span className="material-symbols-outlined text-[17px]">notifications</span> Notifications
            {unreadCount > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-[var(--secondary)] text-white text-[10px] flex items-center justify-center">{unreadCount}</span>}
          </button>
          <button onClick={() => setTab('history')} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${tab === 'history' ? 'bg-[var(--surface)] text-[var(--on-surface)] shadow-sm' : 'app-muted'}`}>
            <span className="material-symbols-outlined text-[17px]">history</span> Activity history
          </button>
        </div>

        {tab === 'notifications' ? (
          <section className="app-card overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b app-divider flex items-center justify-between gap-3">
              <div><h2 className="font-bold text-sm">Notifications</h2><p className="app-muted text-xs mt-1">Payment requests, confirmations and group updates.</p></div>
              {notifications.length > 0 && <div className="flex items-center gap-3"><button onClick={markAllRead} className="text-xs font-bold text-[var(--secondary)] hover:underline">Mark all read</button><button onClick={clearAll} className="text-xs font-bold app-muted hover:text-rose-500">Clear all</button></div>}
            </div>
            {notifications.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <span className="app-icon-tile w-14 h-14 mx-auto rounded-2xl"><span className="material-symbols-outlined text-[26px]">notifications_none</span></span>
                <h3 className="font-bold mt-4">You're all caught up</h3>
                <p className="app-muted text-xs mt-2">New reminders and group updates will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--app-border)]">
                {notifications.map(notification => (
                  <button key={notification.id} onClick={() => {
                    markRead(notification.id)
                    if (notification.groupId) navigate(`/group/${notification.groupId}`)
                  }} className={`w-full text-left px-5 sm:px-6 py-4 flex items-start gap-3.5 hover:bg-[var(--surface-container-low)] ${!notification.read ? 'bg-[var(--app-blue-soft)]/50' : ''}`}>
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${notification.color || '#315cf5'}16`, color: notification.color || '#315cf5' }}>
                      <span className="material-symbols-outlined text-[19px]">{notification.icon || 'notifications'}</span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap gap-2 items-center"><span className="block text-sm font-bold">{notification.title}</span>{!notification.read && <span className="w-1.5 h-1.5 rounded-full bg-[var(--secondary)]"/>}</span>
                      <span className="block text-xs app-muted mt-1 leading-relaxed">{notification.body}</span>
                      <span className="block text-[10px] app-muted mt-2">{new Date(notification.time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    </span>
                    <span className="material-symbols-outlined app-muted text-[18px] mt-1">chevron_right</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="app-card p-4 sm:p-5 mb-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block"><span className="app-page-kicker block mb-2">Group</span>
                  <select className="app-input" value={groupFilter} onChange={event => setGroupFilter(event.target.value)}>
                    <option value="all">All groups</option>
                    {groups.map(group => <option key={group._id} value={group._id}>{group.name}</option>)}
                  </select>
                </label>
                <label className="block"><span className="app-page-kicker block mb-2">Activity type</span>
                  <select className="app-input" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
                    <option value="all">All activity</option><option value="expenses">Expenses</option><option value="payments">Payments & schedules</option><option value="members">Group members</option>
                  </select>
                </label>
                <label className="block"><span className="app-page-kicker block mb-2">Date range</span>
                  <select className="app-input" value={dateFilter} onChange={event => setDateFilter(event.target.value)}>
                    <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
                  </select>
                </label>
              </div>
              <div className="flex justify-between items-center mt-4 pt-3 border-t app-divider"><span className="text-xs app-muted">{visibleItems.length} events</span><button onClick={() => { setGroupFilter('all'); setTypeFilter('all'); setDateFilter('30') }} className="text-xs font-bold text-[var(--secondary)]">Reset filters</button></div>
            </section>

            {error && <div className="app-card p-4 text-sm text-rose-500">{error}</div>}
            {loading ? (
              <div className="space-y-4">{[1,2,3].map(value => <div key={value} className="app-card h-24 animate-pulse"/>)}</div>
            ) : groupedItems.length === 0 ? (
              <div className="app-empty-state px-6 py-16 text-center"><span className="app-icon-tile w-14 h-14 mx-auto rounded-2xl"><span className="material-symbols-outlined text-[26px]">history</span></span><h3 className="font-bold mt-4">No activity found</h3><p className="app-muted text-xs mt-2">Try a different group, type or date range.</p></div>
            ) : (
              <div className="space-y-7">
                {groupedItems.map(([label, dayItems]) => (
                  <section key={label}>
                    <h2 className="app-page-kicker mb-3">{label}</h2>
                    <div className="app-card overflow-hidden divide-y divide-[var(--app-border)]">
                      {dayItems.map(item => {
                        const [icon, fallback] = ACTIVITY_META[item.type] || ['info', 'Group update']
                        return (
                          <Link key={item._id} to={`/group/${item.groupId}`} className="flex items-start gap-3.5 px-5 py-4 hover:bg-[var(--surface-container-low)]">
                            <span className="app-icon-tile w-9 h-9 rounded-xl shrink-0"><span className="material-symbols-outlined text-[18px]">{icon}</span></span>
                            <span className="flex-1 min-w-0"><span className="block text-sm font-semibold">{describeActivity(item) || fallback}</span><span className="block text-xs app-muted mt-1">{item.groupName} · {timeLabel(item.createdAt)}</span></span>
                            <span className="material-symbols-outlined app-muted text-[18px]">chevron_right</span>
                          </Link>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
