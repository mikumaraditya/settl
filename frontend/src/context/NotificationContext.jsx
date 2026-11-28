/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'
import axios, { SOCKET_URL } from '../api/axios'

const NotificationContext = createContext()

// Generate a unique id for each notification
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// Transient UI notifications are cached per account. Server-backed reminders
// stay authoritative in MongoDB and are never persisted to browser storage.
const storageKeyFor = (userId) => `settl_notifications:${userId}`

const loadStored = (userId) => {
  if (!userId) return []
  try {
    const stored = JSON.parse(localStorage.getItem(storageKeyFor(userId)) || '[]')
    return Array.isArray(stored) ? stored.filter(notification => !notification.persistent) : []
  } catch {
    return []
  }
}

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const notificationUserId = user?._id?.toString?.() || null
  const [notificationState, setNotificationState] = useState(() => ({
    userId: notificationUserId,
    items: loadStored(notificationUserId),
  }))
  // A different account's state is never rendered while the new account loads.
  const notifications = notificationState.userId === notificationUserId
    ? notificationState.items
    : loadStored(notificationUserId)
  const socketRef = useRef(null)
  const joinedGroups = useRef(new Set())

  const setNotifications = useCallback((updater) => {
    setNotificationState(previous => {
      const current = previous.userId === notificationUserId
        ? previous.items
        : loadStored(notificationUserId)
      const next = typeof updater === 'function' ? updater(current) : updater
      return { userId: notificationUserId, items: next }
    })
  }, [notificationUserId])

  // Persist only transient notifications, scoped to the signed-in account.
  useEffect(() => {
    if (!notificationUserId) return
    const current = notificationState.userId === notificationUserId
      ? notificationState.items
      : loadStored(notificationUserId)
    const transient = current
      .filter(notification => !notification.persistent)
      .slice(0, 10)
    localStorage.setItem(storageKeyFor(notificationUserId), JSON.stringify(transient))
  }, [notificationUserId, notificationState])

  // Fetch durable reminders on login and refresh them whenever the app regains focus.
  useEffect(() => {
    if (!notificationUserId) return undefined

    let disposed = false
    const loadPersistentNotifications = async () => {
      try {
        const { data } = await axios.get('/notifications')
        if (disposed) return
        const serverNotifications = data.notifications || []
        setServerUnreadCount(Number.isFinite(data.unreadCount) ? data.unreadCount : serverNotifications.filter(n => !n.read).length)
        setNotificationState(previous => {
          const current = previous.userId === notificationUserId ? previous.items : []
          const transient = current.filter(notification => !notification.persistent)
          const unique = new Map()
          ;[...serverNotifications, ...transient].forEach(notification => unique.set(notification.id, notification))
          const merged = [...unique.values()].sort((a, b) => b.time - a.time).slice(0, 30)
          return { userId: notificationUserId, items: merged }
        })
      } catch {
        // Preserve locally cached activity when the API is temporarily unavailable.
      }
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadPersistentNotifications()
    }

    loadPersistentNotifications()
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      disposed = true
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [notificationUserId])

  // Disconnect the previous socket session on logout.
  useEffect(() => {
    if (!notificationUserId && socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
      joinedGroups.current.clear()
    }
  }, [notificationUserId])

  // Setup socket + join all group rooms
  useEffect(() => {
    if (!notificationUserId) return

    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, { autoConnect: true, withCredentials: true })
    }
    const socket = socketRef.current

    // Join every group room so we receive events from all groups
    const joinRooms = async () => {
      try {
        const { data: groups } = await axios.get('/groups')
        groups.forEach(g => {
          socket.emit('join_group', g._id)
          joinedGroups.current.add(g._id.toString())
        })
      } catch { /* silent */ }
    }

    // Join on connect and on every reconnect
    socket.on('connect', joinRooms)
    joinRooms()

    // ── Safe id-to-string helper ──────────────────────────────────────────
    const str = (id) => id?.toString?.() ?? ''
    const myId = str(notificationUserId)

    // ── Push a new notification ───────────────────────────────────────────
    const push = (type, icon, color, title, body, groupId) => {
      const n = {
        id: uid(), type, icon, color, title, body,
        groupId: str(groupId),
        read: false,
        time: Date.now(),
      }
      setNotifications(prev => [n, ...prev].slice(0, 10))
    }

    // ── Handlers ──────────────────────────────────────────────────────────
    const onExpenseAdded = (expense) => {
      // Don't notify the person who added the expense
      if (str(expense?.paidBy?._id) === myId) return
      push(
        'expense', 'receipt_long', '#2563eb',
        `${expense.paidBy?.name} added an expense`,
        `"${expense.description}" — ₹${Number(expense.amount).toLocaleString('en-IN')}`,
        expense.group
      )
    }

    const onSettlementRequested = (settlement) => {
      // Only the receiver should be notified
      if (str(settlement?.to?._id) !== myId) return
      push(
        'payment', 'payments', '#4ade80',
        `${settlement.from?.name} marked payment done`,
        `₹${Number(settlement.amount).toLocaleString('en-IN')} — awaiting your confirmation`,
        settlement.group
      )
    }

    const onSettlementDone = (settlement) => {
      // Only the payer should be notified that payment was confirmed
      if (str(settlement?.from?._id) !== myId) return
      push(
        'confirmed', 'check_circle', '#4ade80',
        `${settlement.to?.name} confirmed your payment`,
        `₹${Number(settlement.amount).toLocaleString('en-IN')} — all settled!`,
        settlement.group
      )
    }

    const onScheduleProposed = (schedule) => {
      if (str(schedule?.to?._id) !== myId) return
      const date = schedule.dueDate ? new Date(schedule.dueDate).toLocaleDateString('en-IN') : 'a proposed date'
      push(
        'schedule', 'event', '#22d3ee',
        `${schedule.from?.name} proposed a payment date`,
        `₹${Number(schedule.amount).toLocaleString('en-IN')} — proposed for ${date}. Review in Settle Up.`,
        schedule.group
      )
    }

    const onScheduleAccepted = (schedule) => {
      if (str(schedule?.from?._id) !== myId) return
      const date = schedule.dueDate ? new Date(schedule.dueDate).toLocaleDateString('en-IN') : 'the agreed date'
      push(
        'schedule', 'event_available', '#4ade80',
        `${schedule.to?.name} accepted your payment date`,
        `₹${Number(schedule.amount).toLocaleString('en-IN')} — due ${date}.`,
        schedule.group
      )
    }

    const onScheduleRejected = (schedule) => {
      if (str(schedule?.from?._id) !== myId) return
      push(
        'schedule', 'event_busy', '#f87171',
        `${schedule.to?.name} declined your payment date`,
        `₹${Number(schedule.amount).toLocaleString('en-IN')} — propose another date or cancel the plan.`,
        schedule.group
      )
    }

    const onNotificationCreated = (notification) => {
      if (!notification?.id) return
      setNotifications(prev => {
        if (prev.some(item => item.id === notification.id)) return prev
        return [notification, ...prev].slice(0, 30)
      })
      if (!notification.read) setServerUnreadCount(prev => prev + 1)
    }

    const onScheduleCancelled = (schedule) => {
      const involved = str(schedule?.from?._id) === myId || str(schedule?.to?._id) === myId
      if (!involved) return
      push(
        'schedule', 'event_busy', '#fbbf24',
        'Payment schedule cancelled',
        `₹${Number(schedule.amount).toLocaleString('en-IN')} payment schedule is no longer active.`,
        schedule.group
      )
    }

    const onSettlementDisputed = ({ settlement }) => {
      if (!settlement) return
      // Only the payer should be notified of a dispute
      if (str(settlement?.from?._id) !== myId) return
      push(
        'dispute', 'gavel', '#f87171',
        `${settlement.to?.name} disputed your payment`,
        `₹${Number(settlement.amount).toLocaleString('en-IN')} — submit proof to resolve`,
        settlement.group
      )
    }

    const onSettlementResolved = (settlement) => {
      if (!settlement) return
      const involved = str(settlement?.from?._id) === myId || str(settlement?.to?._id) === myId
      if (!involved) return
      push(
        'resolved', 'verified', '#4ade80',
        'Dispute resolved',
        `₹${Number(settlement.amount).toLocaleString('en-IN')} payment dispute has been closed`,
        settlement.group
      )
    }

    const onEvidenceSubmitted = ({ settlement }) => {
      if (!settlement) return
      // Only the receiver should be notified of evidence
      if (str(settlement?.to?._id) !== myId) return
      push(
        'evidence', 'upload_file', '#fbbf24',
        `${settlement.from?.name} submitted payment proof`,
        `Review evidence for ₹${Number(settlement.amount).toLocaleString('en-IN')}`,
        settlement.group
      )
    }

    socket.on('expense_added',                 onExpenseAdded)
    socket.on('settlement_requested',          onSettlementRequested)
    socket.on('settlement_done',               onSettlementDone)
    socket.on('schedule_proposed',             onScheduleProposed)
    socket.on('schedule_accepted',             onScheduleAccepted)
    socket.on('schedule_rejected',             onScheduleRejected)
    socket.on('schedule_cancelled',            onScheduleCancelled)
    socket.on('notification_created',          onNotificationCreated)
    socket.on('settlement_disputed',           onSettlementDisputed)
    socket.on('settlement_resolved',           onSettlementResolved)
    socket.on('settlement_evidence_submitted', onEvidenceSubmitted)

    return () => {
      socket.off('connect',                      joinRooms)
      socket.off('expense_added',                onExpenseAdded)
      socket.off('settlement_requested',         onSettlementRequested)
      socket.off('settlement_done',              onSettlementDone)
      socket.off('schedule_proposed',            onScheduleProposed)
      socket.off('schedule_accepted',            onScheduleAccepted)
      socket.off('schedule_rejected',            onScheduleRejected)
      socket.off('schedule_cancelled',           onScheduleCancelled)
      socket.off('notification_created',         onNotificationCreated)
      socket.off('settlement_disputed',          onSettlementDisputed)
      socket.off('settlement_resolved',          onSettlementResolved)
      socket.off('settlement_evidence_submitted', onEvidenceSubmitted)
    }
  }, [notificationUserId, setNotifications])

  const [serverUnreadCount, setServerUnreadCount] = useState(0)
  const unreadCount = serverUnreadCount + notifications.filter(n => !n.persistent && !n.read).length

  const markAllRead = () => {
    setNotifications(prev => prev.map(notification => ({ ...notification, read: true })))
    setServerUnreadCount(0)
    axios.patch('/notifications/read-all').catch(() => {})
  }

  const markRead = (id) => {
    const notification = notifications.find(item => item.id === id)
    setNotifications(prev => prev.map(item => item.id === id ? { ...item, read: true } : item))
    if (notification?.persistent) {
      if (!notification.read) setServerUnreadCount(prev => Math.max(0, prev - 1))
      axios.patch(`/notifications/${id}/read`).catch(() => {})
    }
  }

  const clearAll = () => {
    setNotifications([])
    if (notificationUserId) {
      localStorage.removeItem(storageKeyFor(notificationUserId))
      axios.delete('/notifications').catch(() => {})
    }
  }

  const joinGroup = (groupId) => {
    if (socketRef.current && groupId) {
      const gStr = groupId.toString()
      if (!joinedGroups.current.has(gStr)) {
        socketRef.current.emit('join_group', gStr)
        joinedGroups.current.add(gStr)
      }
    }
  }

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, markRead, clearAll, joinGroup }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
