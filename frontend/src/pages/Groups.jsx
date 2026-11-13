import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from '../api/axios'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Math.abs(value || 0))

const groupIcon = (name = '') => {
  const value = name.toLowerCase()
  if (/trip|travel|goa|holiday/.test(value)) return 'flight_takeoff'
  if (/home|flat|room|rent|hostel/.test(value)) return 'apartment'
  if (/food|dinner|lunch|party/.test(value)) return 'restaurant'
  if (/college|class|campus/.test(value)) return 'school'
  return 'groups'
}

export default function Groups() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadGroups = async () => {
    setLoading(true)
    try {
      const { data } = await axios.get('/groups')
      setGroups(data)
      const results = await Promise.all(data.map(async group => {
        try {
          const { data: summary } = await axios.get(`/settlements/simplify/${group._id}`)
          let balance = 0
          ;(summary.transactions || []).forEach(transaction => {
            const fromId = transaction.from?._id?.toString?.() || transaction.from?._id
            const toId = transaction.to?._id?.toString?.() || transaction.to?._id
            if (fromId === user?._id) balance -= Number(transaction.amount || 0)
            if (toId === user?._id) balance += Number(transaction.amount || 0)
          })
          return [group._id, balance]
        } catch {
          return [group._id, 0]
        }
      }))
      setBalances(Object.fromEntries(results))
    } catch (err) {
      setError(err.response?.data?.message || 'We could not load your groups. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadGroups() }, [])

  const visibleGroups = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return groups
    return groups.filter(group => `${group.name} ${group.description || ''}`.toLowerCase().includes(query))
  }, [groups, search])

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError('')
    try {
      const { data } = await axios.post('/groups', { name: name.trim(), description: description.trim() })
      setShowCreate(false)
      setName('')
      setDescription('')
      navigate(`/group/${data._id}`)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create this group.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="app-page min-h-screen pt-14 pb-20 md:pt-0 md:pb-0 md:pl-64">
      <Navbar />
      <main className="app-main">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-8">
          <div>
            <p className="app-page-kicker mb-3">Your workspace</p>
            <h1 className="app-page-title">Groups</h1>
            <p className="app-page-subtitle">All the people and shared expenses you keep together.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => setShowJoin(true)} className="app-button-secondary">
              <span className="material-symbols-outlined text-[17px]">person_add</span> Join a group
            </button>
            <button onClick={() => { setError(''); setShowCreate(true) }} className="app-button-primary">
              <span className="material-symbols-outlined text-[18px]">add</span> Create group
            </button>
          </div>
        </div>

        <section className="app-card p-4 sm:p-5 mb-7">
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            <div className="flex-1 relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 app-muted text-[19px]">search</span>
              <input value={search} onChange={event => setSearch(event.target.value)} className="app-input pl-11" placeholder="Search groups by name or description" aria-label="Search groups"/>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2 text-xs app-muted px-1">
              <span className="font-semibold">{groups.length} {groups.length === 1 ? 'group' : 'groups'}</span>
              <span className="w-1 h-1 rounded-full bg-[var(--outline)]"/>
              <span>Personal workspace</span>
            </div>
          </div>
        </section>

        {error && !showCreate && (
          <div className="app-card p-4 mb-5 border-rose-200 text-sm text-rose-600 flex items-center justify-between gap-3">
            {error}
            <button onClick={loadGroups} className="font-bold underline">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1,2,3].map(item => <div key={item} className="app-card h-52 animate-pulse bg-[var(--surface-container-low)]"/>)}
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="app-empty-state px-6 py-16 text-center">
            <span className="app-icon-tile w-14 h-14 mx-auto rounded-2xl"><span className="material-symbols-outlined text-[26px]">{groups.length ? 'search_off' : 'groups'}</span></span>
            <h2 className="mt-5 text-lg font-bold">{groups.length ? 'No matching groups' : 'Your first group starts here'}</h2>
            <p className="app-muted text-sm max-w-md mx-auto mt-2 leading-relaxed">{groups.length ? 'Try another group name or clear your search.' : 'Create a space for your hostel friends, roommates, travel crew or family to share expenses clearly.'}</p>
            {!groups.length && <button onClick={() => setShowCreate(true)} className="app-button-primary mt-6"><span className="material-symbols-outlined text-[18px]">add</span>Create your first group</button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleGroups.map((group, index) => {
              const balance = balances[group._id] || 0
              const members = group.members || []
              return (
                <Link key={group._id} to={`/group/${group._id}`} className="app-card app-card-hover p-5 sm:p-6 flex flex-col min-h-[224px] group">
                  <div className="flex items-start justify-between">
                    <span className="app-icon-tile"><span className="material-symbols-outlined text-[21px]">{groupIcon(group.name)}</span></span>
                    <span className="text-[10px] font-bold text-[var(--app-muted)] bg-[var(--surface-container-low)] border border-[var(--app-border)] rounded-full px-3 py-1.5">{members.length} members</span>
                  </div>
                  <div className="mt-5">
                    <h2 className="text-[17px] font-bold tracking-tight truncate group-hover:text-[var(--secondary)] transition-colors">{group.name}</h2>
                    <p className="text-xs app-muted mt-1.5 min-h-8 leading-relaxed line-clamp-2">{group.description || 'Shared expenses and payments in one place.'}</p>
                  </div>
                  <div className="mt-auto pt-4 border-t app-divider flex items-end justify-between gap-3">
                    <div>
                      <p className="app-stat-label mb-1.5">Your position</p>
                      <p className={`text-sm font-bold tabular-nums ${balance > 0.005 ? 'app-balance-positive' : balance < -0.005 ? 'app-balance-negative' : ''}`}>
                        {balance > 0.005 ? `You are owed ${money(balance)}` : balance < -0.005 ? `You owe ${money(balance)}` : 'All settled'}
                      </p>
                    </div>
                    <div className="flex -space-x-2 shrink-0">
                      {members.slice(0,3).map((member, memberIndex) => (
                        <span key={member.user?._id || memberIndex} title={member.user?.name} className="w-8 h-8 rounded-full border-2 border-[var(--surface)] bg-[var(--app-blue-soft)] text-[var(--secondary)] flex items-center justify-center text-[10px] font-extrabold">
                          {(member.user?.name || 'M').charAt(0).toUpperCase()}
                        </span>
                      ))}
                      {members.length > 3 && <span className="w-8 h-8 rounded-full border-2 border-[var(--surface)] bg-[var(--surface-container)] flex items-center justify-center text-[9px] font-bold">+{members.length - 3}</span>}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 z-[70] glass-modal flex items-center justify-center p-4" onClick={event => event.target === event.currentTarget && setShowCreate(false)}>
            <form onSubmit={handleCreate} className="app-card w-full max-w-lg p-6 sm:p-7 shadow-2xl">
              <div className="flex items-start justify-between mb-6">
                <div><p className="app-page-kicker">New workspace</p><h2 className="text-xl font-bold mt-1">Create a group</h2><p className="app-muted text-xs mt-1.5">Give your shared expenses a home.</p></div>
                <button type="button" onClick={() => setShowCreate(false)} className="w-9 h-9 rounded-xl hover:bg-[var(--surface-container-low)] app-muted"><span className="material-symbols-outlined">close</span></button>
              </div>
              <label className="app-page-kicker block mb-2">Group name</label>
              <input autoFocus value={name} onChange={event => setName(event.target.value)} className="app-input mb-4" placeholder="e.g. Hostel Room 204" required maxLength={80}/>
              <label className="app-page-kicker block mb-2">Description <span className="normal-case tracking-normal font-medium">(optional)</span></label>
              <input value={description} onChange={event => setDescription(event.target.value)} className="app-input" placeholder="What is this group for?"/>
              {error && <p className="text-xs text-rose-500 mt-3">{error}</p>}
              <div className="flex justify-end gap-2 mt-7">
                <button type="button" onClick={() => setShowCreate(false)} className="app-button-secondary">Cancel</button>
                <button type="submit" disabled={creating || !name.trim()} className="app-button-primary">{creating ? 'Creating…' : 'Create group'}</button>
              </div>
            </form>
          </div>
        )}

        {showJoin && (
          <div className="fixed inset-0 z-[70] glass-modal flex items-center justify-center p-4" onClick={event => event.target === event.currentTarget && setShowJoin(false)}>
            <div className="app-card w-full max-w-md p-6 sm:p-7 shadow-2xl">
              <div className="flex justify-between items-start">
                <div><p className="app-page-kicker">Join a workspace</p><h2 className="text-xl font-bold mt-1">Get invited to a group</h2></div>
                <button onClick={() => setShowJoin(false)} className="w-9 h-9 rounded-xl hover:bg-[var(--surface-container-low)] app-muted"><span className="material-symbols-outlined">close</span></button>
              </div>
              <div className="app-card p-4 mt-5 bg-[var(--surface-container-low)] shadow-none">
                <p className="text-xs app-muted mb-1">Your Settl account email</p>
                <p className="text-sm font-bold break-all">{user?.email}</p>
              </div>
              <p className="text-sm leading-relaxed app-muted mt-4">Ask a group admin to add this email from the group's Members section. The group will appear here as soon as the invitation is completed.</p>
              <button onClick={() => { navigator.clipboard?.writeText(user?.email || '').catch(() => {}); setShowJoin(false) }} className="app-button-primary w-full mt-6"><span className="material-symbols-outlined text-[17px]">content_copy</span>Copy email & close</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
