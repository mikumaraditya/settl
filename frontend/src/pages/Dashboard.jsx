import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from '../api/axios'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'

// ─── Fallback tips ────────────────────────────────────────────────────────────
const FALLBACK_TIPS = [
  { category: 'BUDGETING', emoji: '💡', headline: 'The 50/30/20 Rule', explanation: 'Split every salary: 50% needs, 30% wants, 20% savings. This one rule replaces every budgeting app.', didYouKnow: 'People who budget spend 18% less than those who don\'t.' },
  { category: 'INVESTING', emoji: '📈', headline: '₹500 SIP, 10 Years', explanation: '₹500/month in an index fund becomes ₹3.5 lakhs in 10 years at 12% returns. Time beats amount.', didYouKnow: 'Warren Buffett made 99% of his wealth after age 50 — thanks to compounding.' },
  { category: 'DEBT', emoji: '💳', headline: 'Never Pay Minimum Due', explanation: 'Paying minimum on a ₹50,000 credit card bill takes 4 years to clear at 36% interest. Pay in full.', didYouKnow: 'Credit card companies earn more from minimum payers than from defaulters.' },
  { category: 'INDIA FINANCE', emoji: '🏦', headline: 'Section 80C: Free Money', explanation: 'Invest ₹1.5 lakhs in PPF or ELSS and pay zero tax on that amount. Most people ignore this.', didYouKnow: 'Only 3% of Indians under 25 use their full 80C limit every year.' },
  { category: 'GROUP HABITS', emoji: '🤝', headline: 'Settle Within 7 Days', explanation: 'Financial stress between friends peaks at 7 unpaid days. Settle early to keep relationships healthy.', didYouKnow: 'Money is the #1 reason friendships end in the 20–30 age group.' },
  { category: 'BUDGETING', emoji: '💡', headline: 'Track Every ₹100', explanation: 'Most people lose ₹3,000–5,000 monthly to untracked small expenses. Check your UPI history tonight.', didYouKnow: 'Small daily expenses of ₹100 add up to ₹36,500 per year.' },
  { category: 'INVESTING', emoji: '📈', headline: 'Emergency Fund First', explanation: 'Save 3–6 months of expenses before investing anywhere. Without this, one crisis wipes all gains.', didYouKnow: '67% of Indians cannot handle a ₹10,000 emergency without borrowing.' },
  { category: 'DEBT', emoji: '💳', headline: 'CIBIL Score Is Wealth', explanation: 'A score above 750 gets you loans at 2–3% lower interest. One missed EMI drops it by 50–100 points.', didYouKnow: 'A 1% lower home loan rate saves ₹7 lakhs on a ₹50 lakh 20-year loan.' },
  { category: 'INDIA FINANCE', emoji: '🏦', headline: 'UPI Has Hidden Limits', explanation: 'Most UPI apps cap at ₹1 lakh per transaction. For larger payments use NEFT — it has no limit.', didYouKnow: 'India processes more UPI transactions daily than all US digital payments combined.' },
  { category: 'GROUP HABITS', emoji: '🤝', headline: 'Split Same Day Always', explanation: 'Add expenses the day they happen. Memory fades fast and disputes triple after 48 hours.', didYouKnow: 'Groups that split same-day have 80% fewer payment disputes.' },
]

export default function Dashboard() {
  const { user } = useAuth()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [creating, setCreating] = useState(false)

  // Overall statistics states
  const [balances, setBalances] = useState({}) // { groupId: { balance: Number, status: String } }
  const [overallBalance, setOverallBalance] = useState(0)
  const [owedPeople, setOwedPeople] = useState(0)
  const [owePeople, setOwePeople] = useState(0)
  const [activities, setActivities] = useState([])
  const [loadingStats, setLoadingStats] = useState(true)

  // Email verification banner
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMsg, setResendMsg] = useState('')
  const showVerifyBanner = !user?.isEmailVerified && !bannerDismissed

  // Settle Up group-picker modal
  const [showSettleModal, setShowSettleModal] = useState(false)

  // Financial tip card
  const [tip, setTip]           = useState(null)
  const [tipLoading, setTipLoading] = useState(true)
  const [tipVisible, setTipVisible] = useState(false)

  const handleResendVerification = async () => {
    setResendLoading(true)
    setResendMsg('')
    try {
      await axios.post('/auth/resend-verification')
      setResendMsg('Verification email sent! Check your inbox.')
    } catch (err) {
      setResendMsg(err.response?.data?.message || 'Failed to resend. Try again.')
    } finally {
      setResendLoading(false)
    }
  }

  const navigate = useNavigate()


  const fetchTip = async () => {
    // Advance index
    const stored = parseInt(sessionStorage.getItem('settl_tip_index') ?? '-1', 10)
    const next   = stored >= 9 || stored < 0 ? 0 : stored + 1
    sessionStorage.setItem('settl_tip_index', String(next))

    // Use cached tips if available
    const cached = sessionStorage.getItem('settl_tips')
    if (cached) {
      try {
        const arr = JSON.parse(cached)
        setTip(arr[next] ?? arr[0])
        setTipLoading(false)
        setTimeout(() => setTipVisible(true), 100)
        return
      } catch { /* fall through */ }
    }

    // Call Gemini
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    const prompt = `You are a financial educator for young Indians aged 18-25. Generate exactly 10 unique, powerful financial tips. Use exactly 2 tips from each: BUDGETING, INVESTING, DEBT, INDIA FINANCE, GROUP HABITS. Use India context: ₹, SIP, PPF, UPI, 80C, CIBIL. Headline max 5 words. Explanation exactly 2 lines. Shuffle categories randomly. Return ONLY a raw JSON array, no markdown, no backticks: [{"category":"BUDGETING","emoji":"💡","headline":"...","explanation":"...","didYouKnow":"..."}]`
    
    const callGemini = async (model) => {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, maxOutputTokens: 2048 } }),
      })
      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`Model ${model} failed with status ${res.status}: ${errBody}`)
      }
      return res
    }

    try {
      let res
      try {
        res = await callGemini('gemini-2.5-flash')
      } catch (err) {
        console.warn('gemini-2.5-flash failed, falling back to gemini-3.5-flash:', err.message)
        res = await callGemini('gemini-3.5-flash')
      }
      const json = await res.json()
      let raw    = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
      const arr  = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length > 0) {
        sessionStorage.setItem('settl_tips', JSON.stringify(arr))
        setTip(arr[next] ?? arr[0])
      } else throw new Error('empty')
    } catch {
      setTip(FALLBACK_TIPS[next])
    } finally {
      setTipLoading(false)
      setTimeout(() => setTipVisible(true), 100)
    }
  }

  const fetchGroups = async () => {
    try {
      setLoading(true)
      const { data } = await axios.get('/groups')
      setGroups(data)
      // Once groups are loaded, fetch details in parallel
      fetchStatsAndActivities(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchStatsAndActivities = async (loadedGroups) => {
    if (loadedGroups.length === 0) {
      setOverallBalance(0)
      setOwedPeople(0)
      setOwePeople(0)
      setActivities([])
      setLoadingStats(false)
      return
    }

    try {
      setLoadingStats(true)
      const balancePromises = loadedGroups.map(async (g) => {
        try {
          const { data } = await axios.get(`/settlements/simplify/${g._id}`)
          const groupTransactions = data.transactions || []

          let netBalance = 0
          let userOwes = false
          let userIsOwed = false

          groupTransactions.forEach(t => {
            const fromId = t.from?._id?.toString?.() || t.from?._id || ''
            const toId   = t.to?._id?.toString?.()   || t.to?._id   || ''
            if (fromId === user._id) {
              netBalance -= t.amount
              userOwes = true
            } else if (toId === user._id) {
              netBalance += t.amount
              userIsOwed = true
            }
          })

          return {
            groupId: g._id,
            balance: netBalance,
            userOwes,
            userIsOwed
          }
        } catch (e) {
          console.error(e)
          return { groupId: g._id, balance: 0, userOwes: false, userIsOwed: false }
        }
      })

      const expensePromises = loadedGroups.map(async (g) => {
        try {
          const { data } = await axios.get(`/expenses/group/${g._id}?months=1&page=1`)
          return (data.expenses || []).map(exp => ({ ...exp, groupName: g.name }))
        } catch (e) {
          console.error(e)
          return []
        }
      })

      const balanceResults = await Promise.all(balancePromises)
      const expenseResults = await Promise.all(expensePromises)

      // Process balances
      let sum = 0
      let owedCount = 0
      let oweCount = 0
      const balancesMap = {}

      balanceResults.forEach(res => {
        sum += res.balance
        if (res.balance > 0) owedCount++
        if (res.balance < 0) oweCount++
        balancesMap[res.groupId] = {
          balance: res.balance,
          status: res.balance > 0 ? 'owed' : res.balance < 0 ? 'owe' : 'settled'
        }
      })

      setBalances(balancesMap)
      setOverallBalance(sum)
      setOwedPeople(owedCount)
      setOwePeople(oweCount)

      // Process activities (flatten & sort by date)
      const allExpenses = expenseResults.flat()
      allExpenses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      setActivities(allExpenses.slice(0, 5)) // show top 5 recent activities

    } catch (err) {
      console.error(err)
    } finally {
      setLoadingStats(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      const { data } = await axios.post('/groups', form)
      const newGroups = [data, ...groups]
      setGroups(newGroups)
      setForm({ name: '', description: '' })
      setShowCreate(false)
      fetchStatsAndActivities(newGroups)
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    setTimeout(() => {
      fetchGroups()
      fetchTip()
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Get nice icons for categories
  const getGroupIcon = (name) => {
    const lowerName = name.toLowerCase()
    if (lowerName.includes('trip') || lowerName.includes('travel') || lowerName.includes('goa')) return 'beach_access'
    if (lowerName.includes('home') || lowerName.includes('flat') || lowerName.includes('room') || lowerName.includes('rent')) return 'home'
    if (lowerName.includes('food') || lowerName.includes('dinner') || lowerName.includes('party')) return 'restaurant'
    return 'group'
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:pl-20 lg:pl-64 pb-20 md:pb-0 pt-14 md:pt-0">
      <Navbar />

      {/* ── Email Verification Warning Banner ── */}
      {showVerifyBanner && (
        <div className="w-full bg-[#fbbf24]/5 border-b border-[#fbbf24]/20 px-4 py-3.5 animate-in slide-in-from-top-2 duration-300">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#fbbf24]/10 flex items-center justify-center flex-shrink-0 border border-[#fbbf24]/20">
                <span className="material-symbols-outlined text-[#fbbf24] text-[18px] flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
                  warning
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white uppercase tracking-wider">
                  Please verify your email address
                </p>
                {resendMsg ? (
                  <p className="text-[11px] text-[#fbbf24] mt-0.5 font-medium">{resendMsg}</p>
                ) : (
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-normal">
                    We sent a verification link to <span className="font-semibold text-white">{user?.email}</span>. Please check your inbox.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                id="resend-verification-btn"
                onClick={handleResendVerification}
                disabled={resendLoading}
                className="text-[10px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-lg bg-[#fbbf24]/10 text-[#fbbf24] hover:bg-[#fbbf24]/20 active:scale-95 transition-all border border-[#fbbf24]/20 cursor-pointer disabled:opacity-60 disabled:pointer-events-none"
              >
                {resendLoading ? 'Sending…' : 'Resend Email'}
              </button>
              <button
                id="dismiss-verify-banner-btn"
                onClick={() => setBannerDismissed(true)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors cursor-pointer text-on-surface-variant"
                aria-label="Dismiss banner"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>
        </div>
      )}

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-5 sm:gap-6">
        
        {!user?.upiId && (
          <div className="glass-card p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 flex items-center gap-3.5 shadow-lg shadow-amber-500/5 animate-in slide-in-from-top-4 duration-300">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
              <span className="material-symbols-outlined">warning</span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-black text-white uppercase tracking-wider">UPI ID missing</h4>
              <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">Please add your UPI ID in your <Link to="/profile" className="text-secondary hover:underline font-bold">Profile Settings</Link> to enable seamless peer-to-peer payments.</p>
            </div>
          </div>
        )}

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Overview</h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mt-1">Manage your groups and balances</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex w-full sm:w-auto justify-center items-center gap-2 bg-gradient-to-r from-secondary to-blue-600 text-white px-5 py-3 rounded-xl font-bold uppercase tracking-wider shadow-lg shadow-secondary/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            <span className="material-symbols-outlined text-[18px] font-bold">add</span>
            Create New Group
          </button>
        </div>

        {/* Overall Balance Hero Card */}
        <section className={`rounded-3xl p-5 sm:p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden transition-all duration-300 border animate-in fade-in slide-in-from-top-4 duration-300 ${
          overallBalance > 0 
            ? 'bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 glow-emerald' 
            : overallBalance < 0 
              ? 'bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20 glow-red' 
              : 'glass-card'
        }`}>
          {/* Subtle Grid Backdrop decoration */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />
          
          <div className="z-10">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">
              Overall Balance
            </span>
            {loadingStats ? (
              <div className="h-10 w-48 bg-white/5 rounded-xl animate-pulse"></div>
            ) : (
              <>
                <h2 className={`text-3xl font-black tracking-tight ${
                  overallBalance > 0 ? 'text-emerald-400' : overallBalance < 0 ? 'text-[#f87171]' : 'text-white'
                }`}>
                  {overallBalance > 0 ? '+' : ''}₹{overallBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </h2>
                <p className="text-xs font-semibold text-on-surface-variant mt-2 tracking-wide uppercase">
                  {overallBalance > 0 
                    ? `You are owed in ${owedPeople} group${owedPeople > 1 ? 's' : ''}` 
                    : overallBalance < 0 
                      ? `You owe in ${owePeople} group${owePeople > 1 ? 's' : ''}` 
                      : 'You are completely settled up!'}
                </p>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 sm:flex gap-3 z-10">
            <button
              onClick={() => {
                const groupsWithBalance = Object.keys(balances).filter(id => balances[id].balance !== 0)
                if (groupsWithBalance.length === 1) {
                  navigate(`/group/${groupsWithBalance[0]}`)
                } else if (groupsWithBalance.length > 1) {
                  setShowSettleModal(true)
                }
              }}
              disabled={overallBalance === 0}
              className="px-4 sm:px-5 py-3 bg-gradient-to-r from-secondary to-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-secondary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none"
            >
              Settle Up
            </button>
            <button
              onClick={() => window.print()}
              className="px-4 sm:px-5 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-white/10 active:scale-[0.98] transition-colors cursor-pointer"
            >
              Print Summary
            </button>
          </div>
        </section>

        {/* Bento Grid */}
        <div className="bento-grid gap-5 sm:gap-6">
          
          {/* Active Groups (8 columns) */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1">Active Groups</h3>
            
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="glass-card p-6 rounded-2xl h-48 animate-pulse"></div>
                ))}
              </div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/30 rounded-2xl p-12 bg-white/5 text-center animate-in fade-in duration-200">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3">group</span>
                <h4 className="text-sm font-bold text-white mb-1">No groups yet</h4>
                <p className="text-xs text-on-surface-variant text-center max-w-[240px] leading-relaxed mb-4">
                  Create a group to start splitting bills with friends.
                </p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="px-4 py-2 border border-outline-variant/30 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Create Group
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groups.map(group => {
                  const gBal = balances[group._id] || { balance: 0, status: 'settled' }
                  const groupIcon = getGroupIcon(group.name)
                  
                  return (
                    <div
                      key={group._id}
                      onClick={() => navigate(`/group/${group._id}`)}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigate(`/group/${group._id}`) }}
                      role="button"
                      tabIndex={0}
                      className="glass-card p-5 sm:p-6 rounded-2xl shadow-lg hover:shadow-xl hover:scale-[1.01] hover:border-secondary/30 focus-visible:border-secondary focus-visible:outline-none transition-all duration-200 group cursor-pointer relative flex flex-col justify-between h-48 animate-in fade-in zoom-in-95 duration-200"
                    >
                      <div className="flex justify-between items-start">
                        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shadow-md transition-transform group-hover:scale-105 duration-200 ${
                          groupIcon === 'beach_access' 
                            ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' 
                            : groupIcon === 'home' 
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                              : 'bg-secondary/10 text-secondary border border-secondary/20'
                        }`}>
                          <span className="material-symbols-outlined text-xl">{groupIcon}</span>
                        </div>
                        
                        {/* Mini Sparkline Chart */}
                        <div className="mini-chart opacity-50 group-hover:opacity-80 transition-opacity">
                          <div className="chart-bar h-4"></div>
                          <div className="chart-bar h-8"></div>
                          <div className="chart-bar h-6"></div>
                          <div className="chart-bar h-10 active"></div>
                          <div className="chart-bar h-5"></div>
                        </div>
                      </div>

                      <div className="mt-2.5">
                        <h4 className="font-extrabold text-sm text-white group-hover:text-secondary transition-colors truncate">
                          {group.name}
                        </h4>
                        {group.description && (
                          <p className="text-xs text-on-surface-variant truncate mt-1">
                            {group.description}
                          </p>
                        )}
                      </div>

                      <div className="flex justify-between items-center py-2.5 border-t border-white/5 mt-auto">
                        {loadingStats ? (
                          <div className="h-4 w-24 bg-white/5 rounded animate-pulse"></div>
                        ) : (
                          <span className={`text-[11px] font-bold uppercase tracking-wider ${
                            gBal.status === 'owed' 
                              ? 'text-emerald-400' 
                              : gBal.status === 'owe' 
                                ? 'text-[#f87171]' 
                                : 'text-on-surface-variant'
                          }`}>
                            {gBal.status === 'owed' 
                              ? `You are owed ₹${gBal.balance.toLocaleString('en-IN')}` 
                              : gBal.status === 'owe' 
                                ? `You owe ₹${Math.abs(gBal.balance).toLocaleString('en-IN')}` 
                                : 'All settled up'}
                          </span>
                        )}
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-white/5 border border-white/5 px-2 py-1 rounded-md text-on-surface-variant ml-2">
                          {group.members.length} members
                        </span>
                      </div>
                    </div>
                  )
                })}

                {/* Add New Group Dash Card */}
                <button
                  onClick={() => setShowCreate(true)}
                  className="border-2 border-dashed border-outline-variant/20 rounded-2xl p-6 flex flex-col items-center justify-center gap-2.5 text-on-surface-variant hover:bg-white/5 hover:border-secondary/40 hover:text-white transition-all group cursor-pointer h-48"
                >
                  <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:scale-105 transition-transform group-hover:border-secondary/20">
                    <span className="material-symbols-outlined text-xl text-outline group-hover:text-secondary">
                      add
                    </span>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider">Add New Group</span>
                </button>
              </div>
            )}
          </div>

          {/* Recent Activity (4 columns) */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1">Recent Activity</h3>
            
              <div className="glass-card rounded-3xl p-5 sm:p-6 shadow-lg flex flex-col gap-5">
              {loadingStats ? (
                [1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3.5 items-center animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex-shrink-0"></div>
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-white/5 rounded w-3/4"></div>
                      <div className="h-2 bg-white/5 rounded w-1/2"></div>
                    </div>
                  </div>
                ))
              ) : activities.length === 0 ? (
                <div className="text-center py-10 text-on-surface-variant flex flex-col items-center">
                  <span className="material-symbols-outlined text-3xl opacity-30">receipt_long</span>
                  <p className="text-xs font-semibold mt-2.5">No recent activity</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {activities.map((act) => {
                    const isMe = act.paidBy?._id === user._id
                    return (
                      <div key={act._id} className="flex gap-3 items-start border-b border-white/5 last:border-0 pb-3 last:pb-0">
                        <div className={`h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                          isMe ? 'bg-secondary/15 text-secondary border border-secondary/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                        }`}>
                          <span className="material-symbols-outlined text-sm">
                            {act.category === 'food' ? 'restaurant' : act.category === 'travel' ? 'directions_bus' : 'receipt'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white leading-normal">
                            <span className="font-bold">{isMe ? 'You' : act.paidBy?.name}</span> paid <span className="font-bold text-secondary">₹{act.amount}</span> for "{act.description}" in <span className="font-semibold text-white">{act.groupName}</span>
                          </p>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant mt-1">
                            {new Date(act.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short'
                            })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── AI Financial Tip Card ── */}
            <div
              className="rounded-2xl overflow-hidden relative cursor-pointer shadow-lg hover:scale-[1.01] transition-transform duration-300 ai-tip-card"
              style={{
                minHeight: 160,
                opacity: tipVisible ? 1 : 0,
                transform: tipVisible ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 400ms ease-out, transform 400ms ease-out, scale 200ms ease',
              }}
            >
              {tipLoading ? (
                <div className="p-5 flex flex-col gap-3">
                  <div className="w-[35%] h-2.5 rounded bg-white/10 animate-pulse" />
                  <div className="w-[75%] h-4.5 rounded bg-white/15 animate-pulse" />
                  <div className="w-[95%] h-3 rounded bg-white/5 animate-pulse" />
                  <div className="w-[80%] h-3 rounded bg-white/5 animate-pulse" />
                </div>
              ) : tip ? (
                <div className="p-5 flex flex-col gap-3 h-full">
                  {/* Label row */}
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">
                      Settl Tips
                    </p>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-white/5 text-white/60 border border-white/10">
                      {tip.emoji} {tip.category}
                    </span>
                  </div>

                  {/* Headline */}
                  <h5 className="font-extrabold text-white leading-snug" style={{ fontSize: 16 }}>
                    {tip.headline}
                  </h5>

                  {/* Explanation */}
                  <p className="text-xs leading-relaxed text-white/60">
                    {tip.explanation}
                  </p>

                  {/* Did You Know */}
                  {tip.didYouKnow && (
                    <div className="rounded-xl px-3.5 py-2.5 mt-2 bg-white/5 border border-white/5">
                      <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5 text-white/40">💡 Did you know?</p>
                      <p className="text-[11px] leading-relaxed text-white/50">{tip.didYouKnow}</p>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Decorative icon */}
              <div className="absolute -right-3 -bottom-3 opacity-5 pointer-events-none">
                <span className="material-symbols-outlined text-white" style={{ fontSize: 90 }}>insights</span>
              </div>
            </div>

          </div>

        </div>

      </main>

      {/* Settle Up — Group Picker Modal */}
      {showSettleModal && (() => {
        const groupsWithBalance = Object.keys(balances)
          .filter(gid => balances[gid].balance !== 0)
          .map(gid => ({ group: groups.find(g => g._id === gid), balance: balances[gid] }))
          .filter(item => item.group)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-modal animate-in fade-in duration-200">
            <div className="glass-card rounded-3xl max-w-sm w-full shadow-2xl p-6 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="text-base font-bold text-white uppercase tracking-wider">Settle Up</h3>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">Select a group to settle balances</p>
                </div>
                <button
                  onClick={() => setShowSettleModal(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors cursor-pointer text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="flex flex-col gap-2.5">
                {groupsWithBalance.map(({ group: g, balance: b }) => (
                  <button
                    key={g._id}
                    onClick={() => { setShowSettleModal(false); navigate(`/group/${g._id}`) }}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-secondary/20 active:scale-[0.98] transition-all cursor-pointer text-left group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                        b.status === 'owed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-[#f87171] border-red-500/20'
                      }`}>
                        <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-white truncate group-hover:text-secondary transition-colors">{g.name}</p>
                        <p className="text-[10px] text-on-surface-variant">{g.members.length} members</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                       <span className={`font-black text-sm block ${
                        b.status === 'owed' ? 'text-emerald-400' : 'text-[#f87171]'
                      }`}>
                        {b.status === 'owed' ? '+' : '-'}₹{Math.abs(b.balance).toLocaleString('en-IN')}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
                        {b.status === 'owed' ? 'Owed' : 'Owe'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Create Group Modal Overlay */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-modal animate-in fade-in duration-200">
          <div className="glass-card rounded-3xl max-w-md w-full shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-base font-bold text-white uppercase tracking-wider">Create Group</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors cursor-pointer text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block ml-1">Group Name</label>
                <input
                  type="text"
                  placeholder="e.g. Goa Trip 2026, Flat Rent"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm text-primary outline-none transition-all placeholder:text-outline-variant/60"
                  required
                  onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)' }}
                  onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = 'none' }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block ml-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Shared expenses for summer vacation"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm text-primary outline-none transition-all placeholder:text-outline-variant/60"
                  onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)' }}
                  onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = 'none' }}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-secondary to-blue-600 text-white shadow-lg shadow-secondary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create Group'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-3.5 border border-outline-variant/30 rounded-xl text-primary font-bold text-xs uppercase tracking-wider hover:bg-white/5 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
