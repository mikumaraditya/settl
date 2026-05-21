/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'
import axios from '../api/axios'

const NotificationContext = createContext()

// Generate a unique id for each notification
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// Load from localStorage
const loadStored = () => {
  try { return JSON.parse(localStorage.getItem('settl_notifications') || '[]') }
  catch { return [] }
}

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState(loadStored)
  const socketRef = useRef(null)
  const joinedGroups = useRef(new Set())

  // Persist to localStorage whenever notifications change
  useEffect(() => {
    const trimmed = notifications.slice(0, 10)
    localStorage.setItem('settl_notifications', JSON.stringify(trimmed))
  }, [notifications])

  // Clear on logout
  useEffect(() => {
    if (!user) {
      if (notifications.length > 0) {
        setTimeout(() => setNotifications([]), 0)
      }
      localStorage.removeItem('settl_notifications')
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        joinedGroups.current.clear()
      }
    }
  }, [user, notifications.length])

  // Setup socket + join all group rooms
  useEffect(() => {
    if (!user) return

    if (!socketRef.current) {
      socketRef.current = io('http://localhost:5000', { autoConnect: true })
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
    const myId = str(user._id)

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
    socket.on('settlement_disputed',           onSettlementDisputed)
    socket.on('settlement_resolved',           onSettlementResolved)
    socket.on('settlement_evidence_submitted', onEvidenceSubmitted)

    return () => {
      socket.off('connect',                      joinRooms)
      socket.off('expense_added',                onExpenseAdded)
      socket.off('settlement_requested',         onSettlementRequested)
      socket.off('settlement_done',              onSettlementDone)
      socket.off('settlement_disputed',          onSettlementDisputed)
      socket.off('settlement_resolved',          onSettlementResolved)
      socket.off('settlement_evidence_submitted', onEvidenceSubmitted)
    }
  }, [user])

  const unreadCount = notifications.filter(n => !n.read).length

  const markAllRead = () =>
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))

  const markRead = (id) =>
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))

  const clearAll = () => {
    setNotifications([])
    localStorage.removeItem('settl_notifications')
  }

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, markRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
