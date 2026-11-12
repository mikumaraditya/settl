import express from 'express';
import Expense from '../models/Expense.js';
import Group from '../models/Group.js';
import Settlement from '../models/Settlement.js';
import SettlementSchedule from '../models/SettlementSchedule.js';
import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import protect from '../middleware/auth.js';
import requireVerified from '../middleware/requireVerified.js';
import simplifyDebts from '../utils/debtSimplify.js';
import { getIO } from '../socket.js';
const safeEmit = (room, event, payload) => { try { getIO()?.to(room)?.emit(event, payload); } catch { /* ignore */ } };
const safeEmitUser = (userId, event, payload) => {
  try { if (userId) getIO()?.to(`user:${userId}`)?.emit(event, payload); } catch { /* ignore */ }
};
const safeEmitSchedule = (schedule, event) => {
  if (!schedule) return;
  const groupId = schedule.group?._id?.toString?.() || schedule.group?.toString?.();
  const fromId = schedule.from?._id?.toString?.() || schedule.from?.toString?.();
  const toId = schedule.to?._id?.toString?.() || schedule.to?.toString?.();
  if (groupId) safeEmit(groupId, event, { group: groupId, scheduleId: schedule._id?.toString?.() });
  safeEmitUser(fromId, event, schedule);
  safeEmitUser(toId, event, schedule);
};
import { clearInsightCaches } from './insights.js';

const router = express.Router();

router.use(protect, requireVerified);

export async function autoExpirePendingSettlements(groupId = null) {
  try {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const thresholdDate = new Date(Date.now() - SEVEN_DAYS_MS);

    const query = {
      status: "pending",
      createdAt: { $lt: thresholdDate },
    };
    if (groupId) {
      query.group = groupId;
    }

    const expiredItems = await Settlement.find(query);
    if (expiredItems.length === 0) return 0;

    for (const item of expiredItems) {
      item.status = "expired";
      await item.save();

      // A payment attempt that expires was never confirmed; restore its
      // accepted schedule so the payer can retry without renegotiating.
      await SettlementSchedule.updateOne(
        { paymentSettlement: item._id, status: "payment_pending", active: true },
        { $set: { status: "accepted", paymentSettlement: null } },
      );

      await ActivityLog.create({
        group: item.group,
        actor: item.from,
        type: "settlement_expired",
        meta: {
          amount: item.amount,
          fromId: item.from,
          toId: item.to,
          reason: "Auto-expired after 7 days",
        },
      });

      clearInsightCaches([item.from?.toString(), item.to?.toString()]);
    }
    return expiredItems.length;
  } catch (err) {
    console.error("Error auto-expiring pending settlements:", err);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// GET SIMPLIFIED DEBTS FOR A GROUP
// ─────────────────────────────────────────────────────────────────────────────
router.get("/simplify/:groupId", protect, async (req, res) => {
  try {
    await autoExpirePendingSettlements(req.params.groupId);

    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isMember = group.members.some(
      (member) => member.user?.toString() === req.user.id,
    );
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const [expenses, allSettlements, scheduleRequests] = await Promise.all([
      Expense.find({ group: req.params.groupId })
        .populate("paidBy", "name email upiId")
        .populate("splits.user", "name email upiId"),
      Settlement.find({ group: req.params.groupId })
        .populate("from", "name email upiId")
        .populate("to",   "name email upiId"),
      SettlementSchedule.find({
        group: req.params.groupId,
        active: true,
        $or: [{ from: req.user.id }, { to: req.user.id }],
      })
        .populate("from", "name email upiId")
        .populate("to", "name email upiId")
        .sort({ dueDate: 1 }),
    ]);

    // Deliver a single in-app reminder when a participant opens the group
    // on the due date or the day before. This is request-driven, not a
    // background push scheduler; no notifications are emitted for old dates.
    const today = new Date().toISOString().slice(0, 10);
    const todayUtc = Date.parse(`${today}T00:00:00.000Z`);
    await Promise.all(scheduleRequests.map(async (schedule) => {
      if (schedule.status !== "accepted") return;
      const isPayer = schedule.from?._id?.toString() === req.user.id;
      const reminderField = isPayer ? "fromReminderSentAt" : "toReminderSentAt";
      if (schedule[reminderField]) return;
      const dueDateOnly = schedule.dueDate.toISOString().slice(0, 10);
      const daysUntilDue = (Date.parse(`${dueDateOnly}T00:00:00.000Z`) - todayUtc) / (24 * 60 * 60 * 1000);
      if (daysUntilDue < 0 || daysUntilDue > 1) return;

      const reminder = await SettlementSchedule.findOneAndUpdate(
        {
          _id: schedule._id,
          status: "accepted",
          active: true,
          [reminderField]: null,
        },
        { $set: { [reminderField]: new Date() } },
        { new: true },
      ).populate("from to", "name email upiId");
      if (reminder) safeEmitUser(req.user.id, "schedule_reminder", reminder);
    }));

    // Separate by status (legacy settlements have no status and should be treated as confirmed)
    const confirmedSettlements  = allSettlements.filter((s) => !s.status || s.status === "confirmed");
    const pendingRequests       = allSettlements.filter((s) => s.status === "pending");

    if (expenses.length === 0) {
      return res.json({
        transactions: [],
        confirmedSettlements,
        pendingRequests,
        scheduleRequests,
      });
    }

    // Only confirmed settlements reduce the remaining debt
    const rawTransactions = simplifyDebts(expenses, confirmedSettlements);

    const members  = group.members.map((m) => m.user.toString());
    const allUsers = await User.find({ _id: { $in: members } }).select(
      "name email upiId",
    );

    const getUserDetails = (userId) =>
      allUsers.find((u) => u._id.toString() === userId);

    const transactions = rawTransactions
      .map((t) => {
        const fromUser = getUserDetails(t.from);
        const toUser   = getUserDetails(t.to);
        const fromId   = fromUser?._id?.toString();
        const toId     = toUser?._id?.toString();

        if (!fromId || !toId) {
          return {
            from:   fromUser,
            to:     toUser,
            amount: t.amount,
          };
        }

        // Sum up pending settlements from this user to that user
        const activePendingSum = pendingRequests
          .filter((p) => p.from?._id?.toString() === fromId && p.to?._id?.toString() === toId)
          .reduce((sum, p) => sum + p.amount, 0);

        const remainingAmount = Math.max(0, t.amount - activePendingSum);

        return {
          from:   fromUser,
          to:     toUser,
          amount: remainingAmount,
        };
      })
      .filter((t) => t.amount > 0);

    res.json({
      transactions,
      confirmedSettlements,
      pendingRequests,
      scheduleRequests,
    });
  } catch (error) {
    console.error("Error fetching settlements/transactions:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST SETTLEMENT (payer marks as paid — awaits receiver confirmation)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/settle", protect, async (req, res) => {
  try {
    const { groupId, toUserId, scheduleId } = req.body;
    await autoExpirePendingSettlements(groupId);

    const amount = Math.round(Number(req.body.amount) * 100) / 100;

    if (!groupId || !toUserId || req.body.amount === undefined) {
      return res.status(400).json({ message: 'groupId, toUserId and amount are required' })
    }
    if (!Number.isFinite(req.body.amount) || amount <= 0 || req.body.amount !== amount) {
      return res.status(400).json({ message: 'Amount must be positive and have at most two decimal places' })
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    const isMember = group.members.some(m => m.user.toString() === req.user.id);
    if (!isMember) return res.status(403).json({ message: 'Not a member of this group' });
    if (toUserId === req.user.id) {
      return res.status(400).json({ message: 'You cannot settle a payment with yourself' });
    }
    const recipientIsMember = group.members.some(m => m.user.toString() === toUserId);
    if (!recipientIsMember) {
      return res.status(400).json({ message: 'Settlement recipient must be a member of this group' });
    }

    // Require a simplified-debt edge from req.user.id to toUserId
    const [expenses, allSettlements] = await Promise.all([
      Expense.find({ group: groupId }),
      Settlement.find({ group: groupId }),
    ]);

    const confirmedSettlements = allSettlements.filter(s => !s.status || s.status === 'confirmed');
    const pendingBetweenUs = allSettlements.filter(
      s => s.status === 'pending' && s.from?.toString() === req.user.id && s.to?.toString() === toUserId
    );

    const simplified = simplifyDebts(expenses, confirmedSettlements);
    const debtEdge = simplified.find(t => t.from === req.user.id && t.to === toUserId);

    if (!debtEdge || debtEdge.amount <= 0) {
      const myEdge = simplified.find(t => t.from === req.user.id && t.amount > 0);
      if (myEdge) {
        const intendedUser = group.members.find(m => m.user.toString() === myEdge.to);
        const intendedUserObj = intendedUser ? await User.findById(myEdge.to).select("name").lean() : null;
        const recipientName = intendedUserObj?.name || "another member";
        return res.status(400).json({ message: `Invalid settlement recipient: simplified debts require you to pay ${recipientName} (₹${myEdge.amount}) instead of this member` });
      }
      return res.status(400).json({ message: 'Invalid settlement direction: you do not owe money in this group' });
    }

    const otherPendingSum = pendingBetweenUs.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
    const edgeAmountPaise = Math.round(debtEdge.amount * 100);
    const maxAllowedPaise = edgeAmountPaise - otherPendingSum;
    const amountInPaise = Math.round(amount * 100);

    if (amountInPaise > maxAllowedPaise || maxAllowedPaise <= 0) {
      return res.status(400).json({ message: 'Settlement amount exceeds the outstanding debt to this member' });
    }

    // Block only if there's already an active (pending) settlement
    const existing = await Settlement.findOne({
      group: groupId,
      from: req.user.id,
      to: toUserId,
      status: 'pending',
    });

    if (existing) {
      return res.status(400).json({
        message: 'Settlement request already sent. Waiting for receiver to confirm.',
      });
    }

    const activeSchedule = await SettlementSchedule.findOne({
      group: groupId,
      from: req.user.id,
      to: toUserId,
      active: true,
    });
    if (activeSchedule && activeSchedule.status === "proposed") {
      return res.status(409).json({
        message: "This payment schedule is awaiting the receiver's response. Cancel it before making an immediate payment.",
      });
    }
    if (activeSchedule && activeSchedule.status === "accepted" && !scheduleId) {
      return res.status(409).json({
        message: "Use the accepted payment schedule to record this payment.",
      });
    }
    if (activeSchedule && scheduleId && activeSchedule._id.toString() !== String(scheduleId)) {
      return res.status(409).json({ message: "The active payment schedule does not match this payment." });
    }

    let linkedSchedule = null;
    if (scheduleId) {
      if (!activeSchedule || activeSchedule._id.toString() !== String(scheduleId) || activeSchedule.status !== "accepted") {
        return res.status(409).json({ message: "This payment schedule is not available for payment." });
      }
      if (Math.round(activeSchedule.amount * 100) !== amountInPaise) {
        return res.status(400).json({
          message: "Payment amount must exactly match the accepted schedule amount. Update or cancel the schedule first.",
        });
      }
      linkedSchedule = await SettlementSchedule.findOneAndUpdate(
        { _id: scheduleId, group: groupId, from: req.user.id, to: toUserId, status: "accepted", active: true },
        { $set: { status: "payment_pending" } },
        { new: true },
      );
      if (!linkedSchedule) {
        return res.status(409).json({ message: "This payment schedule has already been used or changed." });
      }
    }

    const defaultDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    let settlement;
    try {
      settlement = await Settlement.create({
        group: groupId,
        from: req.user.id,
        to: toUserId,
        amount,
        status: "pending",
        dueDate: defaultDueDate,
      });
      if (linkedSchedule) {
        linkedSchedule.paymentSettlement = settlement._id;
        await linkedSchedule.save();
      }
    } catch (createError) {
      if (linkedSchedule) {
        await SettlementSchedule.updateOne(
          { _id: linkedSchedule._id, status: "payment_pending", paymentSettlement: null },
          { $set: { status: "accepted" } },
        );
      }
      throw createError;
    }

    const populated = await Settlement.findById(settlement._id)
      .populate("from", "name email upiId")
      .populate("to", "name email upiId");

    safeEmit(groupId, 'settlement_requested', populated);

    // Log activity
    await ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: 'settlement_requested',
      meta: { amount, toName: populated.to?.name, toId: toUserId },
    });

    res.status(201).json(populated);

    // Bust the payer's cached trust score — a new pending settlement
    // changes their repayment-reliability picture immediately.
    clearInsightCaches([req.user.id]);
  } catch (error) {
    console.error("Error creating settlement request:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM SETTLEMENT (receiver confirms they received the payment)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/confirm", protect, async (req, res) => {
  try {
    const { groupId, fromUserId } = req.body;

    // Atomic update from pending -> confirmed
    const settlement = await Settlement.findOneAndUpdate(
      {
        group: groupId,
        from: fromUserId,
        to: req.user.id,   // only receiver can confirm
        status: "pending",
      },
      { $set: { status: "confirmed" } },
      { new: true }
    );

    if (!settlement) {
      return res.status(404).json({ message: "No pending settlement request found or already confirmed" });
    }

    const group = await Group.findById(groupId);
    const payerIsMember = group?.members.some((member) => member.user.toString() === fromUserId);
    const receiverIsMember = group?.members.some((member) => member.user.toString() === req.user.id);
    if (!payerIsMember || !receiverIsMember) {
      return res.status(400).json({ message: "Both users must still be members of this group" });
    }

    const linkedSchedule = await SettlementSchedule.findOneAndUpdate(
      { paymentSettlement: settlement._id, status: "payment_pending", active: true },
      { $set: { status: "completed", active: false, completedAt: new Date() } },
      { new: true },
    );
    if (linkedSchedule) {
      await ActivityLog.create({
        group: linkedSchedule.group,
        actor: req.user.id,
        type: "schedule_completed",
        meta: { amount: linkedSchedule.amount, fromId: fromUserId, toId: req.user.id },
      });
    }

    const populated = await Settlement.findById(settlement._id)
      .populate("from", "name email upiId")
      .populate("to", "name email upiId");

    safeEmit(groupId, 'settlement_done', populated);

    // Log activity
    await ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: 'settlement_confirmed',
      meta: { amount: settlement.amount, fromName: populated.from?.name, fromId: populated.from?._id },
    });

    res.json(populated);

    // Bust the payer's cached score — confirmation changes their
    // confirmed-on-time rate, which feeds repayment reliability.
    clearInsightCaches([fromUserId]);
  } catch (error) {
    console.error("Error confirming settlement:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL / UNDO SETTLEMENT REQUEST (payer only, only while still pending)
// ─────────────────────────────────────────────────────────────────────────────
const handlePayerCancel = async (req, res) => {
  try {
    const { groupId, toUserId } = req.body;
    await autoExpirePendingSettlements(groupId);

    const settlement = await Settlement.findOne({
      group: groupId,
      from: req.user.id,
      to: toUserId,
      status: "pending",   // can only undo a pending request
    });

    if (!settlement) {
      return res.status(404).json({
        message: "No pending settlement request found to cancel",
      });
    }

    settlement.status = "cancelled";
    await settlement.save();

    await SettlementSchedule.updateOne(
      { paymentSettlement: settlement._id, status: "payment_pending", active: true },
      { $set: { status: "accepted", paymentSettlement: null } },
    );

    // Log activity
    await ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: "settlement_cancelled",
      meta: { amount: settlement.amount, toId: toUserId },
    });

    // Notify group
    safeEmit(groupId, "settlement_undone", {
      fromId: req.user.id,
      toId: toUserId,
    });

    clearInsightCaches([req.user.id, toUserId]);

    res.json({ message: "Settlement request cancelled successfully", settlement });
  } catch (error) {
    console.error("Error cancelling settlement request:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

router.delete("/settle", protect, handlePayerCancel);
router.post("/cancel", protect, handlePayerCancel);

// ─────────────────────────────────────────────────────────────────────────────
// REJECT SETTLEMENT REQUEST (receiver only, only while still pending)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/reject", protect, async (req, res) => {
  try {
    const { groupId, fromUserId, reason } = req.body;
    await autoExpirePendingSettlements(groupId);

    const settlement = await Settlement.findOne({
      group: groupId,
      from: fromUserId,
      to: req.user.id,
      status: "pending",
    }).populate("from", "name");

    if (!settlement) {
      return res.status(404).json({
        message: "No pending settlement request found to reject",
      });
    }

    // Preserve the settlement record with status 'rejected' for audit integrity
    settlement.status = "rejected";
    settlement.rejectionReason = reason || "Payment not received or amount mismatch";
    await settlement.save();

    await SettlementSchedule.updateOne(
      { paymentSettlement: settlement._id, status: "payment_pending", active: true },
      { $set: { status: "accepted", paymentSettlement: null } },
    );

    // Notify group
    safeEmit(groupId, "settlement_undone", {
      fromId: fromUserId,
      toId: req.user.id,
    });

    // Log activity
    await ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: 'settlement_rejected',
      meta: {
        amount: settlement.amount,
        fromId: fromUserId,
        fromName: settlement.from?.name,
        reason: settlement.rejectionReason,
      },
    });

    res.json({ message: "Settlement request rejected", settlement });

    // Bust the payer and receiver cached scores immediately
    clearInsightCaches([fromUserId, req.user.id]);
  } catch (error) {
    console.error("Error rejecting settlement request:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT SCHEDULES (a future repayment agreement; does not clear debt)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/schedules/:groupId", async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    const isMember = group.members.some((member) => member.user?.toString() === req.user.id);
    if (!isMember) return res.status(403).json({ message: "You are not a member of this group" });

    const schedules = await SettlementSchedule.find({
      group: req.params.groupId,
      active: true,
      $or: [{ from: req.user.id }, { to: req.user.id }],
    })
      .populate("from", "name email upiId")
      .populate("to", "name email upiId")
      .sort({ dueDate: 1, createdAt: -1 });

    const today = new Date().toISOString().slice(0, 10);
    res.json({
      schedules: schedules.map((schedule) => {
        const dueDateOnly = schedule.dueDate.toISOString().slice(0, 10);
        return {
          ...schedule.toObject(),
          dueDateOnly,
          dueStatus: dueDateOnly < today ? "overdue" : dueDateOnly === today ? "due_today" : "upcoming",
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching payment schedules:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/schedule", async (req, res) => {
  try {
    const { groupId, toUserId, dueDate } = req.body;
    const amount = Number(req.body.amount);
    if (!groupId || !toUserId || req.body.amount === undefined || !dueDate) {
      return res.status(400).json({ message: "groupId, toUserId, amount and dueDate are required" });
    }
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
      return res.status(400).json({ message: "Amount must be positive and have at most two decimal places" });
    }
    if (typeof dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res.status(400).json({ message: "Due date must use YYYY-MM-DD format" });
    }
    const parsedDueDate = new Date(`${dueDate}T12:00:00.000Z`);
    if (Number.isNaN(parsedDueDate.getTime()) || parsedDueDate.toISOString().slice(0, 10) !== dueDate) {
      return res.status(400).json({ message: "Please provide a valid calendar date" });
    }
    if (dueDate < new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ message: "Due date cannot be in the past" });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    const isMember = group.members.some((member) => member.user?.toString() === req.user.id);
    if (!isMember) return res.status(403).json({ message: "Not a member of this group" });
    if (toUserId === req.user.id) {
      return res.status(400).json({ message: "You cannot schedule a payment to yourself" });
    }
    const recipientIsMember = group.members.some((member) => member.user?.toString() === toUserId);
    if (!recipientIsMember) {
      return res.status(400).json({ message: "Schedule recipient must be a member of this group" });
    }

    const [existingPayment, existingSchedule] = await Promise.all([
      Settlement.findOne({
        group: groupId, from: req.user.id, to: toUserId, status: "pending",
      }),
      SettlementSchedule.findOne({
        group: groupId, from: req.user.id, to: toUserId, active: true,
      }),
    ]);
    if (existingPayment) {
      return res.status(409).json({ message: "A payment is already awaiting confirmation for this member" });
    }
    if (existingSchedule) {
      return res.status(409).json({ message: "An active payment schedule already exists for this member" });
    }

    const [expenses, allSettlements] = await Promise.all([
      Expense.find({ group: groupId }),
      Settlement.find({ group: groupId }),
    ]);
    const confirmedSettlements = allSettlements.filter((item) => !item.status || item.status === "confirmed");
    const pendingBetweenUs = allSettlements.filter(
      (item) => item.status === "pending" && item.from?.toString() === req.user.id && item.to?.toString() === toUserId,
    );
    const debtEdge = simplifyDebts(expenses, confirmedSettlements)
      .find((item) => item.from === req.user.id && item.to === toUserId);
    if (!debtEdge || debtEdge.amount <= 0) {
      return res.status(400).json({ message: "You do not currently owe this member in the group's simplified balances" });
    }

    const pendingPaise = pendingBetweenUs.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
    const availablePaise = Math.round(debtEdge.amount * 100) - pendingPaise;
    const requestedPaise = Math.round(amount * 100);
    if (requestedPaise > availablePaise || availablePaise <= 0) {
      return res.status(400).json({ message: "Schedule amount exceeds the outstanding debt available to this member" });
    }

    const schedule = await SettlementSchedule.create({
      group: groupId, from: req.user.id, to: toUserId, amount,
      dueDate: parsedDueDate, status: "proposed", active: true,
    });
    const populated = await SettlementSchedule.findById(schedule._id)
      .populate("from", "name email upiId")
      .populate("to", "name email upiId");

    safeEmitSchedule(populated, "schedule_proposed");
    await ActivityLog.create({
      group: groupId, actor: req.user.id, type: "schedule_proposed",
      meta: { amount, toId: toUserId, dueDate },
    });
    res.status(201).json(populated);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "An active payment schedule already exists for this member" });
    }
    console.error("Error creating payment schedule:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/schedule/:scheduleId/respond", async (req, res) => {
  try {
    const { action, reason } = req.body;
    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ message: "Action must be accept or reject" });
    }
    const proposedSchedule = await SettlementSchedule.findOne({
      _id: req.params.scheduleId, to: req.user.id, status: "proposed", active: true,
    });
    if (!proposedSchedule) {
      return res.status(404).json({ message: "No proposed payment schedule found for you to respond to" });
    }
    const group = await Group.findById(proposedSchedule.group);
    const bothParticipantsAreMembers = group?.members.some((member) => member.user.toString() === proposedSchedule.from.toString())
      && group?.members.some((member) => member.user.toString() === proposedSchedule.to.toString());
    if (!bothParticipantsAreMembers) {
      return res.status(403).json({ message: "Both participants must remain members of this group" });
    }

    const update = action === "accept"
      ? { $set: { status: "accepted", respondedAt: new Date() } }
      : { $set: { status: "rejected", active: false, respondedAt: new Date(), responseReason: String(reason || "Declined").slice(0, 240) } };
    const schedule = await SettlementSchedule.findOneAndUpdate(
      { _id: proposedSchedule._id, to: req.user.id, status: "proposed", active: true },
      update,
      { new: true },
    ).populate("from to", "name email upiId");
    if (!schedule) {
      return res.status(404).json({ message: "No proposed payment schedule found for you to respond to" });
    }

    safeEmitSchedule(schedule, action === "accept" ? "schedule_accepted" : "schedule_rejected");
    await ActivityLog.create({
      group: schedule.group, actor: req.user.id,
      type: action === "accept" ? "schedule_accepted" : "schedule_rejected",
      meta: { amount: schedule.amount, fromId: schedule.from?._id, toId: schedule.to?._id, dueDate: schedule.dueDate.toISOString().slice(0, 10) },
    });
    res.json(schedule);
  } catch (error) {
    console.error("Error responding to payment schedule:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/schedule/:scheduleId/cancel", async (req, res) => {
  try {
    const cancellableSchedule = await SettlementSchedule.findOne({
      _id: req.params.scheduleId,
      $or: [{ from: req.user.id }, { to: req.user.id }],
      active: true,
      status: { $in: ["proposed", "accepted"] },
    });
    if (!cancellableSchedule) {
      return res.status(404).json({ message: "No cancellable payment schedule found" });
    }
    const group = await Group.findById(cancellableSchedule.group);
    const bothParticipantsAreMembers = group?.members.some((member) => member.user.toString() === cancellableSchedule.from.toString())
      && group?.members.some((member) => member.user.toString() === cancellableSchedule.to.toString());
    if (!bothParticipantsAreMembers) {
      return res.status(403).json({ message: "Both participants must remain members of this group" });
    }

    const schedule = await SettlementSchedule.findOneAndUpdate(
      { _id: cancellableSchedule._id, active: true, status: { $in: ["proposed", "accepted"] } },
      { $set: { status: "cancelled", active: false, respondedAt: new Date() } },
      { new: true },
    ).populate("from to", "name email upiId");
    if (!schedule) return res.status(404).json({ message: "No cancellable payment schedule found" });

    safeEmitSchedule(schedule, "schedule_cancelled");
    await ActivityLog.create({
      group: schedule.group, actor: req.user.id, type: "schedule_cancelled",
      meta: { amount: schedule.amount, fromId: schedule.from?._id, toId: schedule.to?._id },
    });
    res.json(schedule);
  } catch (error) {
    console.error("Error cancelling payment schedule:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET ACTIVITY LOG FOR A GROUP
// ─────────────────────────────────────────────────────────────────────────────
router.get('/group/:groupId/activity', protect, async (req, res) => {
  try {
    const { groupId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const skip  = parseInt(req.query.skip) || 0;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some(m => m.user.toString() === req.user.id);
    if (!isMember) return res.status(403).json({ message: 'Not a member of this group' });

    const [logs, total] = await Promise.all([
      ActivityLog.find({ group: groupId })
        .populate('actor', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ActivityLog.countDocuments({ group: groupId }),
    ]);

    res.json({ logs, total, hasMore: skip + limit < total });
  } catch (error) {
    console.error("Error fetching activity log:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
