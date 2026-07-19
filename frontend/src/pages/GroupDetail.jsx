import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios, { SOCKET_URL } from '../api/axios'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { io } from 'socket.io-client'
import { useNotifications } from '../context/NotificationContext'

const getInitialsBg = (name) => {
  const colors = [
    'bg-blue-500/80 border-blue-400/30',
    'bg-purple-500/80 border-purple-400/30',
    'bg-indigo-500/80 border-indigo-400/30',
    'bg-violet-500/80 border-violet-400/30',
    'bg-fuchsia-500/80 border-fuchsia-400/30',
    'bg-pink-500/80 border-pink-400/30',
    'bg-emerald-500/80 border-emerald-400/30',
    'bg-teal-500/80 border-teal-400/30',
    'bg-cyan-500/80 border-cyan-400/30',
    'bg-sky-500/80 border-sky-400/30'
  ];
  if (!name) return colors[0];
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  return colors[sum % colors.length];
};

const formatTimeAgo = (date) => {
  if (!date) return 'just now';
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const generateOptimisticId = () => `optimistic-${Date.now()}`;

export default function GroupDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { joinGroup } = useNotifications()
  const navigate = useNavigate()

  // ── Core state ──────────────────────────────────────────────────────────────
  const [group, setGroup]     = useState(null)
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading]   = useState(true)

  // ── Pagination state ─────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage]       = useState(1)
  const [hasMore, setHasMore]               = useState(false)
  const [totalMonths, setTotalMonths]       = useState(1)
  const [loadingMore, setLoadingMore]       = useState(false)

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('expenses')
  const [messages, setMessages] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [unreadChat, setUnreadChat] = useState(false)
  const chatContainerRef = useRef(null)
  const chatInputRef = useRef(null)
  const prevMessageLengthRef = useRef(0)
  const activeTabRef = useRef(activeTab)

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  // ── Activity log state ────────────────────────────────────────────────────────
  const [activityLogs, setActivityLogs]       = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityFetched, setActivityFetched] = useState(false)
  const [activityHasMore, setActivityHasMore] = useState(false)
  const [activityTotal, setActivityTotal]     = useState(0)
  const [activityFilter, setActivityFilter]   = useState('all')

  const groupLogsByDay = (logs) => {
    const groupsMap = new Map();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    logs.forEach(log => {
      const logDate = new Date(log.createdAt);
      const compareDate = new Date(logDate);
      compareDate.setHours(0, 0, 0, 0);

      let label;
      if (compareDate.getTime() === today.getTime()) {
        label = 'Today';
      } else if (compareDate.getTime() === yesterday.getTime()) {
        label = 'Yesterday';
      } else {
        label = logDate.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }

      if (!groupsMap.has(label)) {
        groupsMap.set(label, []);
      }
      groupsMap.get(label).push(log);
    });

    return Array.from(groupsMap.entries()).map(([dateLabel, items]) => ({
      dateLabel,
      items
    }));
  };

  const categoryIconMap = {
    food: 'restaurant',
    travel: 'directions_car',
    shopping: 'shopping_bag',
    rent: 'home',
    entertainment: 'sports_esports',
    fuel: 'local_gas_station',
    groceries: 'local_grocery_store',
    medical: 'medical_services',
    utilities: 'bolt',
  };

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
  const [splitPercentages, setSplitPercentages] = useState({})
  const [exactAmounts, setExactAmounts] = useState({})

  const handleExactAmountChange = (userId, value) => {
    setExactAmounts(prev => {
      const next = { ...prev, [userId]: value }
      
      if (group?.members && group.members.length > 0) {
        const lastMemberId = group.members[group.members.length - 1].user?._id
        
        if (userId !== lastMemberId) {
          const totalAmount = parseFloat(expenseForm.amount) || 0
          if (totalAmount > 0) {
            let sumOthers = 0
            group.members.slice(0, -1).forEach(m => {
              const mId = m.user?._id
              const val = mId === userId ? parseFloat(value) : parseFloat(prev[mId])
              sumOthers += val || 0
            })
            const remaining = totalAmount - sumOthers
            next[lastMemberId] = remaining >= 0 ? remaining.toFixed(2) : '0.00'
          } else {
            next[lastMemberId] = ''
          }
        }
      }
      return next
    })
  }

  useEffect(() => {
    if (expenseForm.splitType !== 'exact' || !group?.members || group.members.length === 0) return

    const totalAmount = parseFloat(expenseForm.amount) || 0
    const lastMemberId = group.members[group.members.length - 1].user?._id

    if (totalAmount <= 0) {
      setTimeout(() => {
        setExactAmounts(prev => {
          if (prev[lastMemberId] === '') return prev
          return { ...prev, [lastMemberId]: '' }
        })
      }, 0)
      return
    }

    setTimeout(() => {
      setExactAmounts(prev => {
        let sumOthers = 0
        group.members.slice(0, -1).forEach(m => {
          sumOthers += parseFloat(prev[m.user?._id]) || 0
        })
        const remaining = totalAmount - sumOthers
        const autoFilledVal = remaining >= 0 ? remaining.toFixed(2) : '0.00'

        if (prev[lastMemberId] === autoFilledVal) return prev
        return { ...prev, [lastMemberId]: autoFilledVal }
      })
    }, 0)
  }, [expenseForm.amount, expenseForm.splitType, group?.members])

  const openAddExpenseModal = () => {
    if (group?.members?.length > 0) {
      const equalShare = 100 / group.members.length;
      const initial = {};
      const initialExact = {};
      group.members.forEach(m => {
        initial[m.user?._id] = equalShare;
        initialExact[m.user?._id] = '';
      });
      setSplitPercentages(initial);
      setExactAmounts(initialExact);
    }
    setShowAddExpense(true);
  };

  const handleSliderChange = (changedUserId, newValue) => {
    setSplitPercentages(prev => {
      const otherIds = Object.keys(prev).filter(id => id !== changedUserId);
      if (otherIds.length === 0) return { [changedUserId]: 100 };
      
      const newPrev = { ...prev, [changedUserId]: parseFloat(newValue) };
      const remainingPercentage = 100 - parseFloat(newValue);
      
      const oldTotalOthers = otherIds.reduce((sum, id) => sum + prev[id], 0);
      
      if (oldTotalOthers === 0) {
        const equalShare = remainingPercentage / otherIds.length;
        otherIds.forEach(id => newPrev[id] = equalShare);
      } else {
        otherIds.forEach(id => {
          newPrev[id] = (prev[id] / oldTotalOthers) * remainingPercentage;
        });
      }
      return newPrev;
    });
  };
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
  const [confirmedSettlements, setConfirmedSettlements] = useState([])
  const [now]                                       = useState(() => Date.now())
  const [loadingSettlements, setLoadingSettlements] = useState(true)
  const [memberScores, setMemberScores]             = useState({})

  // Fetch trust scores for group members in parallel
  useEffect(() => {
    if (!group?.members) return;

    const fetchScores = async () => {
      const promises = group.members
        .map(m => m.user?._id)
        .filter(id => id && !memberScores[id])
        .map(async (id) => {
          try {
            const { data } = await axios.get(`/insights/trust-score/${id}`);
            return { id, data };
          } catch {
            return { id, data: { status: "error", scoreBand: "N/A", score: null } };
          }
        });

      if (promises.length === 0) return;

      const results = await Promise.all(promises);
      setMemberScores(prev => {
        const next = { ...prev };
        results.forEach(({ id, data }) => {
          next[id] = data;
        });
        return next;
      });
    };

    fetchScores();
  }, [group?.members, memberScores]);

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
      setConfirmedSettlements(data.confirmedSettlements || [])
      setMemberScores({})
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingSettlements(false)
    }
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'chat') {
      setUnreadChat(false)
      if (messages.length === 0) fetchMessages()
    }
    if (tab === 'activity' && !activityFetched) fetchActivity()
  }

  const fetchMessages = async () => {
    try {
      setChatLoading(true)
      const { data } = await axios.get(`/messages/group/${id}`)
      setMessages(data)
    } finally { setChatLoading(false) }
  }

  const sendMessage = async (event) => {
    if (event) event.preventDefault()
    const text = messageText.trim();
    if (!text) return;

    const tempId = generateOptimisticId();
    const optimisticMsg = {
      _id: tempId,
      content: text,
      sender: {
        _id: user._id,
        name: user.name
      },
      createdAt: new Date().toISOString(),
      isOptimistic: true
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setMessageText('');

    if (chatInputRef.current) {
      chatInputRef.current.focus();
    }

    try {
      setSendingMessage(true);
      const { data } = await axios.post('/messages', { groupId: id, content: text });
      setMessages(prev => {
        const idx = prev.findIndex(m => m._id === tempId);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = data;
          return updated;
        }
        return prev;
      });
    } catch (err) {
      console.error("Failed to send message:", err);
      setMessages(prev => {
        const idx = prev.findIndex(m => m._id === tempId);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = { ...prev[idx], isOptimistic: false, isFailed: true, rawText: text };
          return updated;
        }
        return prev;
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const retrySendMessage = async (failedMsg) => {
    const text = failedMsg.rawText || failedMsg.content;

    setMessages(prev => prev.filter(m => m._id !== failedMsg._id));

    const tempId = generateOptimisticId();
    const optimisticMsg = {
      _id: tempId,
      content: text,
      sender: {
        _id: user._id,
        name: user.name
      },
      createdAt: new Date().toISOString(),
      isOptimistic: true
    };

    setMessages(prev => [...prev, optimisticMsg]);

    try {
      setSendingMessage(true);
      const { data } = await axios.post('/messages', { groupId: id, content: text });
      setMessages(prev => {
        const idx = prev.findIndex(m => m._id === tempId);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = data;
          return updated;
        }
        return prev;
      });
    } catch (err) {
      console.error("Failed to retry message:", err);
      setMessages(prev => {
        const idx = prev.findIndex(m => m._id === tempId);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = { ...prev[idx], isOptimistic: false, isFailed: true, rawText: text };
          return updated;
        }
        return prev;
      });
    } finally {
      setSendingMessage(false);
    }
  };

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

  // ── Expense helpers ───────────────────────────────────────────────────────────
  const handleAddExpense = async (e) => {
    e.preventDefault()
    const parsedAmount = parseFloat(expenseForm.amount)
    if (!expenseForm.description || !expenseForm.amount) return
    if (isNaN(parsedAmount) || parsedAmount <= 0) return
    setAddingExpense(true)
    try {
      const payload = { ...expenseForm, amount: parsedAmount, groupId: id }
      if (expenseForm.splitType === 'percentage') {
        payload.splits = Object.entries(splitPercentages).map(([userId, pct]) => ({
          user: userId,
          percentage: pct
        }));
      } else if (expenseForm.splitType === 'exact') {
        payload.splits = Object.entries(exactAmounts).map(([userId, amt]) => ({
          user: userId,
          amount: parseFloat(amt) || 0
        }));
      }
      await axios.post('/expenses', payload)
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
    rent: 'home', entertainment: 'theaters', fuel: 'local_gas_station',
    groceries: 'shopping_basket', medical: 'medical_services', other: 'receipt_long'
  }
  const categoryColors = {
    food:          { bg: 'bg-orange-500/15', text: 'text-orange-400' },
    travel:        { bg: 'bg-sky-500/15',    text: 'text-sky-400'    },
    shopping:      { bg: 'bg-violet-500/15', text: 'text-violet-400' },
    rent:          { bg: 'bg-indigo-500/15', text: 'text-indigo-400' },
    entertainment: { bg: 'bg-pink-500/15',   text: 'text-pink-400'   },
    fuel:          { bg: 'bg-amber-500/15',  text: 'text-amber-400'  },
    groceries:     { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
    medical:       { bg: 'bg-rose-500/15',   text: 'text-rose-400'   },
    other:         { bg: 'bg-slate-500/15',  text: 'text-slate-400'  }
  }

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, { autoConnect: true, withCredentials: true })
    }
    const socket = socketRef.current

    setTimeout(() => {
      fetchData()
      fetchSettlements()
    }, 0)
    socket.emit('join_group', id)
    joinGroup(id)

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
    const onMessageCreated = (message) => {
      setMessages(prev => {
        if (prev.some(m => m._id === message._id)) return prev;
        if (message.sender?._id === user._id) {
          const idx = prev.findIndex(m => m.isOptimistic && m.content === message.content);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = message;
            return updated;
          }
        }
        return [...prev, message];
      });
      if (activeTabRef.current !== 'chat') {
        setUnreadChat(true);
      }
    };

    socket.on('expense_added',                onExpenseAdded)
    socket.on('expense_deleted',              onExpenseDeleted)
    socket.on('settlement_done',              onSettlementDone)
    socket.on('settlement_undone',            onSettlementUndone)
    socket.on('settlement_requested',         onSettlementRequested)
    socket.on('message_created',              onMessageCreated)

    return () => {
      socket.emit('leave_group', id)
      socket.off('expense_added',                onExpenseAdded)
      socket.off('expense_deleted',              onExpenseDeleted)
      socket.off('settlement_done',              onSettlementDone)
      socket.off('settlement_undone',            onSettlementUndone)
      socket.off('settlement_requested',         onSettlementRequested)
      socket.off('message_created',              onMessageCreated)
      socket.disconnect()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Auto-scroll logic for Chat Tab
  useEffect(() => {
    if (activeTab !== 'chat' || !chatContainerRef.current) return;
    const container = chatContainerRef.current;
    
    if (messages.length > prevMessageLengthRef.current || prevMessageLengthRef.current === 0) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      const lastMsg = messages[messages.length - 1];
      const isMyMsg = lastMsg?.sender?._id === user._id || lastMsg?.isOptimistic;
      
      if (isNearBottom || isMyMsg || prevMessageLengthRef.current === 0) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight;
        }, 50);
      }
    }
    prevMessageLengthRef.current = messages.length;
  }, [messages, activeTab, user._id]);

  useEffect(() => {
    if (activeTab === 'chat' && chatContainerRef.current) {
      const container = chatContainerRef.current;
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 50);
    }
  }, [activeTab]);

  // ── Loading screen ────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-background flex flex-col md:pl-20 lg:pl-64 pb-20 md:pb-0 pt-14 md:pt-0">
      <Navbar />
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 md:px-8 py-8 flex flex-col gap-6 md:gap-8">
        {/* Back navigation skeleton */}
        <div className="h-4 bg-white/5 rounded w-20 animate-pulse" />
        
        {/* Hero Header Card skeleton */}
        <div className="glass-card p-6 md:p-8 rounded-2xl shadow-lg relative overflow-hidden animate-pulse flex flex-col gap-4">
          <div className="space-y-2">
            <div className="h-3 bg-white/5 rounded w-16" />
            <div className="h-8 bg-white/10 rounded w-1/3" />
            <div className="h-4 bg-white/5 rounded w-1/2" />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full bg-white/5 border border-[#0d1326]" />
              <div className="w-8 h-8 rounded-full bg-white/5 border border-[#0d1326]" />
              <div className="w-8 h-8 rounded-full bg-white/5 border border-[#0d1326]" />
            </div>
            <div className="h-3 bg-white/5 rounded w-16" />
          </div>
        </div>

        {/* Smart Settlement Card skeleton */}
        <div className="glass-card p-6 rounded-2xl animate-pulse flex flex-col gap-4">
          <div className="h-4 bg-white/10 rounded w-32" />
          <div className="grid md:grid-cols-2 gap-4">
            <div className="h-24 bg-white/5 border border-white/5 rounded-2xl" />
            <div className="h-24 bg-white/5 border border-white/5 rounded-2xl" />
          </div>
        </div>

        {/* Tab selector skeleton */}
        <div className="flex border-b border-white/5 gap-2 animate-pulse">
          <div className="h-9 w-24 bg-white/10 rounded-t-xl" />
          <div className="h-9 w-24 bg-white/5 rounded-t-xl" />
          <div className="h-9 w-24 bg-white/5 rounded-t-xl" />
        </div>

        {/* Expenses list skeleton */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2 animate-pulse">
            <div className="h-4 w-4 bg-white/10 rounded-full" />
            <div className="h-4 bg-white/10 rounded w-24" />
          </div>
          <div className="flex flex-col gap-3.5">
            {[1, 2].map(n => (
              <div key={n} className="glass-card p-5 rounded-2xl flex flex-col gap-4 animate-pulse">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="h-11 w-11 rounded-xl bg-white/5 border border-white/5 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-white/10 rounded w-2/3" />
                      <div className="h-2.5 bg-white/5 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="h-4 bg-white/10 rounded w-16 ml-auto" />
                    <div className="h-3 bg-white/5 rounded w-20 mt-2 ml-auto" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )


  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col md:pl-20 lg:pl-64 pb-20 md:pb-0 pt-14 md:pt-0">
      <Navbar />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-5 sm:gap-6">

        {/* Back navigation */}
        <button
          onClick={() => navigate('/dashboard')}
          className="text-on-surface-variant hover:text-primary text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-start rounded-lg px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to Dashboard
        </button>

        {/* Hero Header Card */}
        <section className="glass-card p-5 sm:p-6 md:p-8 rounded-3xl shadow-lg relative overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 border border-white/10">
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
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{group?.name}</h2>
              {group?.description && (
                <p className="text-xs text-on-surface-variant font-medium">{group.description}</p>
              )}
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

            <div className="grid grid-cols-2 gap-3 self-stretch md:flex md:self-auto justify-end">
              <button
                onClick={openAddExpenseModal}
                className="bg-gradient-to-r from-secondary to-blue-600 text-white px-4 sm:px-5 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider shadow-lg shadow-secondary/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                <span className="material-symbols-outlined text-[18px] font-bold">add</span> Add Expense
              </button>
              <button
                onClick={() => navigate(`/settle/${id}`)}
                className="bg-white/5 border border-white/10 text-white px-4 sm:px-5 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider hover:bg-white/10 active:scale-95 transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                <span className="material-symbols-outlined text-[18px]">payments</span> Settle Up
              </button>
            </div>
          </div>
        </section>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── Left column: Tabs + Content ─────────────────────────────────── */}
          <div className="lg:col-span-8 flex flex-col gap-4 order-2 lg:order-1">

            {/* Tab bar */}
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/5 overflow-x-auto hide-scrollbar flex-nowrap w-full bg-background/90 backdrop-blur-xl rounded-t-2xl px-1">
              {/* Expenses tab */}
              <button
                onClick={() => handleTabChange('expenses')}
                className={`px-5 py-3.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer -mb-px flex-shrink-0 ${
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

              <button
                onClick={() => handleTabChange('chat')}
                className={`px-5 py-3.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer -mb-px flex-shrink-0 ${activeTab === 'chat' ? 'border-cyan-400 text-cyan-300 bg-cyan-400/5 rounded-t-xl' : 'border-transparent text-on-surface-variant hover:text-white'}`}
              >
                <span className="material-symbols-outlined text-[18px]">forum</span> Chat
                {unreadChat && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
                )}
              </button>

              {/* Activity tab */}
              <button
                onClick={() => handleTabChange('activity')}
                className={`px-5 py-3.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer -mb-px flex-shrink-0 ${
                  activeTab === 'activity'
                    ? 'border-[#a78bfa] text-[#a78bfa] bg-[#a78bfa]/5 rounded-t-xl'
                    : 'border-transparent text-on-surface-variant hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">history</span>
                Activity
              </button>

              {/* History tab */}
              <button
                onClick={() => handleTabChange('history')}
                className={`px-5 py-3.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer -mb-px flex-shrink-0 ${
                  activeTab === 'history'
                    ? 'border-[#10b981] text-[#10b981] bg-[#10b981]/5 rounded-t-xl'
                    : 'border-transparent text-on-surface-variant hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">history_edu</span>
                History
                {confirmedSettlements.length > 0 && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    activeTab === 'history' ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/25' : 'bg-white/5 text-on-surface-variant'
                  }`}>
                    {confirmedSettlements.length}
                  </span>
                )}
              </button>
            </div>

            {/* ── EXPENSES TAB ─────────────────────────────────────────────── */}
            {activeTab === 'expenses' && (
              <div className="flex flex-col gap-6 animate-in fade-in duration-200">

                {expenses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/20 rounded-2xl p-12 bg-white/5 text-center animate-in fade-in duration-200">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3">payments</span>
                    <h4 className="text-sm font-bold text-white mb-1">No expenses yet</h4>
                    <p className="text-xs text-on-surface-variant text-center max-w-[240px] leading-relaxed mb-4">
                      Add an expense to start splitting bills with the group.
                    </p>
                    <button
                      onClick={openAddExpenseModal}
                      className="px-4 py-2 border border-outline-variant/30 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Add Expense
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
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
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
                                            isPayer ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/5 text-on-surface-variant'
                                          }`}>
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] ${
                                              isPayer ? 'bg-emerald-500 text-white' : 'bg-primary-container text-white'
                                            }`}>
                                              {split.user?.name?.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-[11px] font-medium">
                                              <span className={isPayer ? 'text-emerald-400 font-bold' : 'text-on-surface-variant'}>
                                                {split.user?._id === user._id ? 'You' : split.user?.name}
                                              </span>
                                              {isPayer && <span className="text-emerald-400 text-[8px] ml-1 font-bold uppercase tracking-wider">(paid)</span>}:
                                              {' '}<span className={`font-bold ${isPayer ? 'text-emerald-400' : 'text-white'}`}>₹{split.amount.toLocaleString('en-IN')}</span>
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
                                        className="absolute bottom-3.5 right-3.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-[#f87171] opacity-75 hover:opacity-100 active:scale-95 transition-all cursor-pointer p-1 rounded-lg border border-transparent hover:bg-white/5 hover:border-white/5"
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

                    {loadingMore && (
                      <div className="flex flex-col gap-3.5 animate-in fade-in duration-200 mt-4">
                        {/* Month header skeleton */}
                        <div className="flex items-center justify-between px-1 animate-pulse">
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 bg-white/5 rounded-full" />
                            <div className="h-4 bg-white/5 rounded w-24" />
                            <div className="h-4 bg-white/5 rounded w-16" />
                          </div>
                          <div className="h-4 bg-white/5 rounded w-20" />
                        </div>
                        
                        {/* 2 Skeleton Cards */}
                        <div className="flex flex-col gap-3.5">
                          {[1, 2].map(n => (
                            <div key={n} className="glass-card p-5 rounded-2xl flex flex-col gap-4 animate-pulse">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                  <div className="h-11 w-11 rounded-xl bg-white/5 border border-white/5 flex-shrink-0" />
                                  <div className="flex-1 space-y-2">
                                    <div className="h-3.5 bg-white/10 rounded w-2/3" />
                                    <div className="h-2.5 bg-white/5 rounded w-1/2" />
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="h-4 bg-white/10 rounded w-16 ml-auto" />
                                  <div className="h-3 bg-white/5 rounded w-20 mt-2 ml-auto" />
                                </div>
                              </div>
                              <div className="border-t border-white/5 pt-3.5 space-y-2">
                                <div className="h-2 bg-white/5 rounded w-16" />
                                <div className="flex gap-2">
                                  <div className="h-7 bg-white/5 border border-white/5 rounded-xl w-24" />
                                  <div className="h-7 bg-white/5 border border-white/5 rounded-xl w-28" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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
            {activeTab === 'activity' && (() => {
              const filteredLogs = activityLogs.filter(log => {
                if (activityFilter === 'all') return true;
                if (activityFilter === 'expenses') {
                  return log.type === 'expense_added' || log.type === 'expense_deleted';
                }
                if (activityFilter === 'settlements') {
                  return log.type === 'settlement_requested' || 
                         log.type === 'settlement_confirmed' || 
                         log.type === 'settlement_rejected';
                }
                if (activityFilter === 'members') {
                  return log.type === 'member_added' || 
                         log.type === 'member_removed' || 
                         log.type === 'member_left' || 
                         log.type === 'group_created';
                }
                return true;
              });

              const groupedLogs = groupLogsByDay(filteredLogs);

              return (
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
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/20 rounded-2xl p-12 bg-white/5 text-center animate-in fade-in duration-200">
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3">history</span>
                      <h4 className="text-sm font-bold text-white mb-1">No activity yet</h4>
                      <p className="text-xs text-on-surface-variant text-center max-w-[240px] leading-relaxed">
                        Events will appear here as the group is used.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Type Filter Pills */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {[
                          { id: 'all', label: 'All' },
                          { id: 'expenses', label: 'Expenses' },
                          { id: 'settlements', label: 'Settlements' },
                          { id: 'members', label: 'Members' }
                        ].map((filterOption) => (
                          <button
                            key={filterOption.id}
                            onClick={() => setActivityFilter(filterOption.id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                              activityFilter === filterOption.id
                                ? 'bg-[#a78bfa]/15 text-[#a78bfa] border border-[#a78bfa]/25'
                                : 'bg-white/5 text-on-surface-variant/75 hover:text-white border border-transparent'
                            }`}
                          >
                            {filterOption.label}
                          </button>
                        ))}
                      </div>

                      {filteredLogs.length === 0 ? (
                        <div className="text-center py-12 border border-dashed border-outline-variant/10 rounded-2xl bg-white/5 flex flex-col items-center">
                          <span className="material-symbols-outlined text-3xl text-outline-variant/40 mb-2">filter_alt_off</span>
                          <p className="text-on-surface-variant text-xs font-semibold">No matching activity</p>
                          <p className="text-[11px] text-on-surface-variant/50 mt-1">Try selecting a different filter</p>
                        </div>
                      ) : (
                        <div className="relative">
                          {/* Vertical line */}
                          <div className="absolute left-[15px] top-4 bottom-4 w-px bg-white/5" />

                          <div className="flex flex-col">
                            {groupedLogs.map((group) => (
                              <div key={group.dateLabel} className="mb-4 last:mb-0">
                                {/* Date Header aligned with the timeline */}
                                <div className="flex items-center gap-3 py-2">
                                  <div className="w-8 flex-shrink-0 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white/20 z-10" />
                                  </div>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
                                    {group.dateLabel}
                                  </span>
                                </div>

                                <div className="flex flex-col">
                                  {group.items.map((log) => {
                                    const isActorCurrentUser = (log.actor?._id || log.actor) === user._id;
                                    const actorName = isActorCurrentUser ? 'You' : (log.actor?.name ?? 'Someone');

                                    const cfg = {
                                      group_created: { 
                                        icon: 'group_add', 
                                        color: '#a78bfa', 
                                        label: () => `created this group` 
                                      },
                                      expense_added: { 
                                        icon: (l) => categoryIconMap[l.meta?.category] || 'receipt_long', 
                                        color: '#2563eb', 
                                        label: (l) => `added "${l.meta?.description}" — ₹${Number(l.meta?.amount).toLocaleString('en-IN')}` 
                                      },
                                      expense_deleted: { 
                                        icon: 'delete', 
                                        color: '#f87171', 
                                        label: (l) => `deleted expense "${l.meta?.description}" — ₹${Number(l.meta?.amount).toLocaleString('en-IN')}` 
                                      },
                                      settlement_requested: { 
                                        icon: 'payments', 
                                        color: (l) => (l.meta?.toId === user._id ? '#4ade80' : (isActorCurrentUser ? '#f87171' : '#4ade80')), 
                                        label: (l) => {
                                          const isTargetMe = l.meta?.toId === user._id;
                                          return `sent ₹${Number(l.meta?.amount).toLocaleString('en-IN')} to ${isTargetMe ? 'you' : (l.meta?.toName || 'someone')}`;
                                        } 
                                      },
                                      settlement_confirmed: { 
                                        icon: 'check_circle', 
                                        color: (l) => (isActorCurrentUser ? '#4ade80' : (l.meta?.fromId === user._id ? '#f87171' : '#4ade80')), 
                                        label: (l) => {
                                          const isTargetMe = l.meta?.fromId === user._id;
                                          return `confirmed ₹${Number(l.meta?.amount).toLocaleString('en-IN')} from ${isTargetMe ? 'you' : (l.meta?.fromName || 'someone')}`;
                                        } 
                                      },
                                      settlement_rejected: { 
                                        icon: 'cancel', 
                                        color: '#f87171', 
                                        label: (l) => {
                                          const isTargetMe = l.meta?.fromId === user._id;
                                          return `rejected the ₹${Number(l.meta?.amount).toLocaleString('en-IN')} settlement from ${isTargetMe ? 'you' : (l.meta?.fromName || 'someone')}`;
                                        } 
                                      },
                                      member_added: { 
                                        icon: 'person_add', 
                                        color: '#60a5fa', 
                                        label: (l) => {
                                          const isTargetMe = l.meta?.memberEmail === user.email;
                                          return `added ${isTargetMe ? 'you' : (l.meta?.memberName || 'someone')} to the group`;
                                        } 
                                      },
                                      member_removed: { 
                                        icon: 'person_remove', 
                                        color: '#f87171', 
                                        label: () => `removed a member from the group` 
                                      },
                                      member_left: { 
                                        icon: 'exit_to_app', 
                                        color: '#94a3b8', 
                                        label: () => `left the group` 
                                      },
                                    }[log.type] || { icon: 'info', color: '#475569', label: () => log.type };

                                    const iconName = typeof cfg.icon === 'function' ? cfg.icon(log) : cfg.icon;
                                    const itemColor = typeof cfg.color === 'function' ? cfg.color(log) : cfg.color;

                                    const timeAgo = (date) => {
                                      const diff = now - new Date(date).getTime();
                                      if (diff < 60000) return 'just now';
                                      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                                      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
                                      return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                                    };

                                    return (
                                      <div key={log._id} className="flex items-start gap-3 py-3 px-1 border-b border-white/5 last:border-b-0">
                                        {/* Icon */}
                                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 z-10"
                                          style={{ backgroundColor: `${itemColor}10`, border: `1.5px solid ${itemColor}25` }}>
                                          <span className="material-symbols-outlined text-[14px]" style={{ color: itemColor, fontVariationSettings: "'FILL' 1" }}>{iconName}</span>
                                        </div>

                                        {/* Text */}
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs text-white leading-snug">
                                            <span className="font-bold text-white">{actorName}</span>{' '}
                                            <span className="text-on-surface-variant font-medium">{cfg.label(log)}</span>
                                          </p>
                                          <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40 mt-1">{timeAgo(log.createdAt)}</p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>

                          {activityHasMore && (
                            <button
                              onClick={() => fetchActivity(true)}
                              disabled={activityLoading}
                              className="w-full mt-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant border border-outline-variant/30 rounded-xl hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center"
                            >
                              {activityLoading ? (
                                <>
                                  <span className="material-symbols-outlined text-[18px] animate-spin mr-2">sync</span>
                                  Loading...
                                </>
                              ) : (
                                <>
                                  <span className="material-symbols-outlined text-[18px] mr-2">expand_more</span>
                                  Load more · {activityTotal - activityLogs.length} remaining
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* ── HISTORY TAB ───────────────────────────────────────────────── */}
            {activeTab === 'chat' && (
              <div className="glass-card rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[500px]">
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-cyan-400 text-[18px]">forum</span>
                    Group Chat
                  </h3>
                  {messages.length > 0 && (
                    <span className="text-[10px] text-on-surface-variant/60 font-bold uppercase tracking-wider">
                      {messages.length} messages
                    </span>
                  )}
                </div>
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">
                  {chatLoading ? (
                    <div className="flex flex-col items-center justify-center pt-24 gap-3">
                      <span className="material-symbols-outlined text-cyan-400 animate-spin text-[32px]">sync</span>
                      <p className="text-on-surface-variant text-sm font-semibold">Loading conversation...</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center pt-24 flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 text-xl shadow-lg shadow-cyan-400/5">
                        <span className="material-symbols-outlined">chat_bubble</span>
                      </div>
                      <p className="text-on-surface-variant text-sm font-bold">No messages yet</p>
                      <p className="text-on-surface-variant/60 text-xs max-w-[200px]">Send a message to start the conversation with the group.</p>
                    </div>
                  ) : (
                    messages.map((message, i) => {
                      const mine = message.sender?._id === user._id
                      const isConsecutive = i > 0 && 
                        messages[i-1].sender?._id === message.sender?._id &&
                        Math.abs(new Date(message.createdAt || 0) - new Date(messages[i-1].createdAt || 0)) < 5 * 60 * 1000

                      const senderName = mine ? 'You' : message.sender?.name || 'Member'
                      const initials = (message.sender?.name || 'M').charAt(0).toUpperCase()

                      return (
                        <div key={message._id || i} className={`flex gap-3 items-start ${mine ? 'flex-row-reverse justify-start' : 'justify-start'} ${isConsecutive ? 'mt-0.5' : 'mt-4'}`}>
                          {/* Avatar Initials Circle */}
                          {!mine && (
                            <div className="w-8 h-8 flex-shrink-0 select-none">
                              {!isConsecutive && (
                                <div className={`w-8 h-8 rounded-full ${getInitialsBg(message.sender?.name)} text-white flex items-center justify-center font-extrabold text-xs border shadow-md transition-all`}>
                                  {initials}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Bubble + Metadata Column */}
                          <div className={`flex flex-col max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
                            {!isConsecutive && (
                              <div className="flex items-center gap-1.5 mb-1 px-1 select-none">
                                <span className="text-[10px] font-extrabold text-slate-200">{senderName}</span>
                                <span className="text-[8px] text-on-surface-variant/40">•</span>
                                <span className="text-[9px] text-on-surface-variant/50 font-bold">
                                  {formatTimeAgo(message.createdAt)}
                                </span>
                              </div>
                            )}

                            <div className="relative group flex items-center gap-2">
                              <p className={`px-4 py-2 rounded-2xl text-sm leading-relaxed ${
                                mine 
                                  ? `bg-secondary text-white ${isConsecutive ? 'rounded-r-2xl rounded-l-2xl' : 'rounded-tr-sm'}` 
                                  : `bg-white/10 text-white ${isConsecutive ? 'rounded-l-2xl rounded-r-2xl' : 'rounded-tl-sm'}`
                              } ${message.isOptimistic ? 'opacity-40 italic' : ''} ${message.isFailed ? 'border border-rose-500/30 bg-rose-500/10' : ''}`}>
                                {message.content}
                              </p>

                              {message.isFailed && (
                                <button 
                                  type="button" 
                                  onClick={() => retrySendMessage(message)} 
                                  className="w-6 h-6 rounded-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/35 flex items-center justify-center text-rose-400 cursor-pointer transition-all hover:scale-105 active:scale-95"
                                  title="Failed to send. Click to retry."
                                >
                                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
                <form onSubmit={sendMessage} className="flex gap-2 p-3 border-t border-white/5 bg-black/[0.08]">
                  <input 
                    ref={chatInputRef}
                    value={messageText} 
                    onChange={event => setMessageText(event.target.value)} 
                    maxLength={1000} 
                    placeholder="Write a message..." 
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-cyan-500/40 focus:bg-white/[0.08] transition-all" 
                  />
                  <button 
                    disabled={!messageText.trim() && !sendingMessage} 
                    className="px-4 py-2.5 rounded-xl bg-secondary text-white disabled:opacity-40 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">send</span>
                  </button>
                </form>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="flex flex-col gap-6 animate-in fade-in duration-200">
                {confirmedSettlements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/20 rounded-2xl p-12 bg-white/5 text-center animate-in fade-in duration-200">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3">history_edu</span>
                    <h4 className="text-sm font-bold text-white mb-1">No history yet</h4>
                    <p className="text-xs text-on-surface-variant text-center max-w-[240px] leading-relaxed">
                      When members confirm settlements via the Settle Up page, they will show up here.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-8">
                    {Object.entries(
                      [...confirmedSettlements]
                        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                        .reduce((groups, s) => {
                          const date = new Date(s.createdAt)
                          const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' })
                          if (!groups[monthYear]) groups[monthYear] = []
                          groups[monthYear].push(s)
                          return groups
                        }, {})
                    ).map(([month, list]) => (
                      <div key={month} className="flex flex-col gap-3.5">
                        {/* Month Header */}
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1 flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-emerald-400">calendar_month</span>
                          {month}
                          <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-bold">
                            {list.length}
                          </span>
                        </p>

                        {/* List of payments */}
                        <div className="flex flex-col gap-3">
                          {list.map((s, index) => {
                            const isSent = s.from?._id === user._id
                            const isReceived = s.to?._id === user._id
                            
                            let themeClass = 'text-slate-400'
                            let badgeClass = 'text-slate-400/80 bg-slate-500/10 border-slate-500/20'
                            let badgeText = 'Settled'
                            let avatarClass = 'from-slate-600 to-slate-500'
                            let sign = ''

                            if (isReceived) {
                              themeClass = 'text-emerald-400'
                              badgeClass = 'text-emerald-400/80 bg-emerald-500/10 border-emerald-500/20'
                              badgeText = 'Received'
                              avatarClass = 'from-emerald-600 to-teal-600'
                              sign = '+'
                            } else if (isSent) {
                              themeClass = 'text-rose-400'
                              badgeClass = 'text-rose-400/80 bg-rose-500/10 border-rose-500/20'
                              badgeText = 'Sent'
                              avatarClass = 'from-rose-600 to-red-500'
                              sign = '-'
                            }

                            return (
                              <div key={s._id || index} className="glass-card border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:border-white/10 transition-all">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${avatarClass} text-white border border-white/10 flex items-center justify-center font-bold text-xs`}>
                                    {s.from?.name?.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-white">
                                      <span>{isSent ? 'You' : s.from?.name}</span>
                                      <span className="text-on-surface-variant font-medium mx-2">settled with</span>
                                      <span>{isReceived ? 'You' : s.to?.name}</span>
                                    </p>
                                    <p className="text-[10px] text-on-surface-variant mt-0.5 font-semibold">
                                      {new Date(s.createdAt).toLocaleDateString('en-IN', {
                                        day: 'numeric',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right flex items-center sm:flex-col sm:items-end justify-between sm:justify-start gap-3 sm:gap-1">
                                  <span className={`${themeClass} font-extrabold text-sm block`}>
                                    {sign}₹{s.amount?.toLocaleString('en-IN')}
                                  </span>
                                  <span className={`text-[8px] font-bold uppercase tracking-wider ${badgeClass} px-2 py-0.5 rounded-lg inline-block`}>
                                    {badgeText}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── Right column: Settlement widget + Members ──────────────────── */}
          <div className="lg:col-span-4 flex flex-col gap-5 sm:gap-6 order-1 lg:order-2 lg:sticky lg:top-6 lg:self-start">

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
                    <div key={m.user?._id} className="flex items-center justify-between text-xs p-2 pb-3 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] border border-transparent hover:border-white/5 transition-all">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
                          {m.user?.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">
                            {isSelf ? `${m.user?.name} (You)` : m.user?.name}
                          </span>
                          <span className="text-[10px] text-on-surface-variant/70 block truncate mb-1">{m.user?.email}</span>
                          <div className="mt-1.5">
                            {(() => {
                              const scoreData = memberScores[m.user?._id];
                              if (scoreData && (scoreData.status === "ready" || scoreData.status === "new")) {
                                return (
                                  <span className={`inline-flex items-center text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-lg border whitespace-nowrap ${
                                    scoreData.scoreBand === 'Excellent' || scoreData.scoreBand === 'Good'
                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                      : scoreData.scoreBand === 'New'
                                      ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                                      : scoreData.scoreBand === 'Needs Attention'
                                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                  }`} title="Trust Score">
                                    {scoreData.scoreBand === 'New' ? 'Trust Score: New Member' : `Trust Score: ${scoreData.score} (${scoreData.scoreBand})`}
                                  </span>
                                );
                              } else if (scoreData && scoreData.status === "not_enough_data") {
                                return (
                                  <span className="inline-flex items-center text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-lg border bg-white/5 border-white/10 text-slate-400 whitespace-nowrap" title="Not enough activity to compute score">
                                    Trust Score: N/A
                                  </span>
                                );
                              } else {
                                return (
                                  <span className="inline-flex items-center text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-lg border bg-white/5 border-white/10 text-slate-500 animate-pulse whitespace-nowrap">
                                    Trust Score: --
                                  </span>
                                );
                              }
                            })()}
                          </div>
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



      {/* ── Delete Expense Modal ──────────────────────────────────────────────── */}
      {expenseToDelete && (() => {
        const { canDelete, label } = getTimeStatus(expenseToDelete.createdAt)
        return (
          <div className="modal-overlay bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
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
        <div className="modal-overlay bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) setShowAddExpense(false) }}>
          <div className="glass-modal rounded-3xl max-w-2xl w-full border border-white/10 shadow-2xl overflow-y-auto md:overflow-hidden max-h-[90vh] md:max-h-[none] flex flex-col md:flex-row animate-in zoom-in-95 duration-200 hide-scrollbar">
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
                    <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-2.5 ml-1">Select Category</p>
                    
                    {/* Mobile Dropdown View */}
                    <div className="block md:hidden ml-1">
                      <select
                        value={expenseForm.category}
                        onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                        className="group-category-select w-full bg-[#131b2e] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-blue-500 transition-all font-semibold cursor-pointer"
                      >
                        <option value="food">🍽️ Food</option>
                        <option value="travel">✈️ Travel</option>
                        <option value="shopping">🛍️ Shopping</option>
                        <option value="rent">🏠 Rent</option>
                        <option value="entertainment">🎬 Entertainment</option>
                        <option value="fuel">⛽ Fuel</option>
                        <option value="groceries">🛒 Groceries</option>
                        <option value="medical">🏥 Medical</option>
                        <option value="other">📝 Other</option>
                      </select>
                    </div>

                    {/* Desktop Grid View */}
                    <div className="hidden md:grid grid-cols-3 gap-2">
                      {(['food', 'travel', 'shopping', 'rent', 'entertainment', 'fuel', 'groceries', 'medical', 'other']).map((cat) => {
                        const icons  = {
                          food: 'restaurant',
                          travel: 'flight',
                          shopping: 'shopping_cart',
                          rent: 'home',
                          entertainment: 'theaters',
                          fuel: 'local_gas_station',
                          groceries: 'shopping_basket',
                          medical: 'medical_services',
                          other: 'receipt_long'
                        }
                        const labels = {
                          food: 'Food',
                          travel: 'Travel',
                          shopping: 'Shopping',
                          rent: 'Rent',
                          entertainment: 'Entertainment',
                          fuel: 'Fuel',
                          groceries: 'Groceries',
                          medical: 'Medical',
                          other: 'Other'
                        }
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
                  <button type="button" onClick={() => setExpenseForm({...expenseForm, splitType: 'equal'})} className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${expenseForm.splitType === 'equal' ? 'bg-white/10 text-white border border-white/5 shadow-sm' : 'text-white/50 hover:text-white/80'}`}>Split Equally</button>
                  <button type="button" onClick={() => setExpenseForm({...expenseForm, splitType: 'percentage'})} className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${expenseForm.splitType === 'percentage' ? 'bg-white/10 text-white border border-white/5 shadow-sm' : 'text-white/50 hover:text-white/80'}`}>Uneven Split</button>
                  <button type="button" onClick={() => setExpenseForm({...expenseForm, splitType: 'exact'})} className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${expenseForm.splitType === 'exact' ? 'bg-white/10 text-white border border-white/5 shadow-sm' : 'text-white/50 hover:text-white/80'}`}>Exact Amount</button>
                </div>
                
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Split with group members</p>
                  {(() => {
                    if (expenseForm.splitType !== 'exact' || !group?.members || group.members.length === 0) return null;
                    const total = parseFloat(expenseForm.amount) || 0;
                    let sumOthers = 0;
                    group.members.slice(0, -1).forEach(m => {
                      sumOthers += parseFloat(exactAmounts[m.user?._id]) || 0;
                    });
                    if (sumOthers > total) {
                      const diff = sumOthers - total;
                      return (
                        <span className="text-[9px] text-rose-400 font-bold flex items-center gap-1 animate-in fade-in duration-200 uppercase tracking-wide">
                          <span className="material-symbols-outlined text-[12px] flex-shrink-0">warning</span>
                          Exceeds total by ₹{diff.toLocaleString('en-IN')}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                  {group?.members.map((m, index) => {
                    const pct = splitPercentages[m.user?._id] || 0;
                    const amount = expenseForm.amount ? parseFloat(expenseForm.amount) : 0;
                    const calculatedShare = expenseForm.splitType === 'percentage' 
                      ? (amount * (pct / 100)) 
                      : expenseForm.splitType === 'exact'
                        ? (parseFloat(exactAmounts[m.user?._id]) || 0)
                        : (amount / group.members.length);
                    const isLastMember = index === group.members.length - 1;
                      
                    return (
                    <div key={m.user?._id} className="p-3 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 rounded-2xl flex flex-col gap-2 text-xs transition-all">
                      <div className="flex items-center justify-between">
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
                          ₹{calculatedShare.toFixed(2)}
                        </span>
                      </div>
                      
                      {expenseForm.splitType === 'percentage' && (
                        <div className="flex items-center gap-3 mt-1">
                          <input 
                            type="range" 
                            min="0" max="100" step="1"
                            value={pct}
                            onChange={(e) => handleSliderChange(m.user?._id, e.target.value)}
                            className="flex-1 accent-blue-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                          />
                          <span className="text-[10px] font-bold text-blue-400 w-8 text-right">{Math.round(pct)}%</span>
                        </div>
                      )}
                      
                      {expenseForm.splitType === 'exact' && (
                        <div className="flex items-center gap-3 mt-1 relative">
                          <span className="text-[12px] font-bold text-white/50">₹</span>
                          <input 
                            type="number" 
                            min="0" step="0.01"
                            value={exactAmounts[m.user?._id] || ''}
                            onChange={(e) => handleExactAmountChange(m.user?._id, e.target.value)}
                            className={`flex-1 bg-transparent border-b focus:border-blue-500 focus:ring-0 font-bold text-xs p-1 outline-none transition-all ${
                              isLastMember && expenseForm.amount && parseFloat(expenseForm.amount) > 0
                                ? 'text-cyan-400 border-cyan-400/20' 
                                : 'text-white border-white/10'
                            }`}
                            placeholder="0.00"
                          />
                          {isLastMember && expenseForm.amount && parseFloat(expenseForm.amount) > 0 && (
                            <span className="absolute right-1 top-1.5 text-[8px] font-bold uppercase tracking-wider bg-cyan-400/10 text-cyan-300 border border-cyan-400/25 px-1.5 py-0.5 rounded-md pointer-events-none select-none">
                              auto
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )})}
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
        <div className="modal-overlay bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) { setShowAddMember(false); setAddMemberError(''); setMemberEmail('') } }}>
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
        <div className="modal-overlay bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
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
        <div className="modal-overlay bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
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
