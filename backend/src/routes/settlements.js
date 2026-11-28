import express from 'express';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import Expense from '../models/Expense.js';
import Group from '../models/Group.js';
import Settlement from '../models/Settlement.js';
import SettlementSchedule from '../models/SettlementSchedule.js';
import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import protect from '../middleware/auth.js';
import requireVerified from '../middleware/requireVerified.js';
import simplifyDebts from '../utils/debtSimplify.js';
import getExpenseSourceIds from "../utils/expenseSourceLinks.js";
import { getIO } from '../socket.js';
import { reserveGroupMutation, releaseGroupMutation } from '../utils/groupMutation.js';
const safeEmit = (room, event, payload) => { try { getIO()?.to(room)?.emit(event, payload); } catch { /* ignore */ } };

const reserveGroupWrite = async (groupId, userId) => {
  const reservation = await reserveGroupMutation(groupId, userId);
  if (!reservation) return null;
  reservation.group.$locals.financialMutationToken = reservation.token;
  return reservation.group;
};

const releaseGroupWrite = async (groupId, token) => {
  await releaseGroupMutation(groupId, token);
};

const groupWriteFailure = async (groupId, userId) => {
  const group = await Group.findById(groupId).select(
    "isDeleting membershipMutation membershipMutationExpiresAt financialMutationId financialMutationExpiresAt activeMutations mutationExpiresAt members.user",
  );
  if (!group) return { status: 404, message: "Group not found" };
  if (group.isDeleting) {
    return { status: 409, message: "This group is being deleted and cannot accept payment changes" };
  }
  if (group.membershipMutation || group.financialMutationId) {
    return { status: 409, message: "This group is being updated. Please try again in a moment." };
  }
  if (!group.members.some(member => member.user.toString() === userId)) {
    return { status: 403, message: "Not a member of this group" };
  }
  return { status: 409, message: "This group is being updated. Please try again in a moment." };
};
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

const completeLinkedSchedule = async (settlement, actorId) => {
  const linkedSchedule = await SettlementSchedule.findOneAndUpdate(
    { paymentSettlement: settlement._id, status: "payment_pending", active: true },
    { $set: { status: "completed", active: false, completedAt: new Date() } },
    { new: true },
  );
  if (linkedSchedule) {
    const fromId = settlement.from?._id?.toString?.() || settlement.from?.toString?.();
    const toId = settlement.to?._id?.toString?.() || settlement.to?.toString?.();
    await ActivityLog.create({
      group: linkedSchedule.group,
      actor: actorId,
      type: "schedule_completed",
      meta: {
        amount: linkedSchedule.amount,
        fromId,
        toId,
      },
    }).catch(error => console.error("Could not record schedule-completed activity:", error));
  }
  return linkedSchedule;
};

const restoreLinkedSchedule = async (settlementId) => SettlementSchedule.updateOne(
  { paymentSettlement: settlementId, status: "payment_pending", active: true },
  { $set: { status: "accepted", paymentSettlement: null } },
);
const getDateInTimeZone = (timeZone) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: typeof timeZone === "string" && timeZone.length <= 64 ? timeZone : "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};
const addDaysToDateOnly = (dateOnly, days) => {
  const date = new Date(`${dateOnly}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const addMonthsToDateOnly = (dateOnly, months) => {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
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

    const expiredItems = await Settlement.find(query).select("_id");
    if (expiredItems.length === 0) return 0;

    let expiredCount = 0;
    for (const item of expiredItems) {
      // Compare-and-set the lifecycle state. A receiver may confirm or reject
      // this payment after the initial query, so never save a stale document.
      const expired = await Settlement.findOneAndUpdate(
        { _id: item._id, status: "pending", createdAt: { $lt: thresholdDate } },
        { $set: { status: "expired" } },
        { new: true },
      );
      if (!expired) continue;
      expiredCount += 1;

      // A payment attempt that expires was never confirmed; restore its
      // accepted schedule so the payer can retry without renegotiating.
      await SettlementSchedule.updateOne(
        { paymentSettlement: expired._id, status: "payment_pending", active: true },
        { $set: { status: "accepted", paymentSettlement: null } },
      );

      await ActivityLog.create({
        group: expired.group,
        actor: expired.from,
        type: "settlement_expired",
        meta: {
          amount: expired.amount,
          fromId: expired.from,
          toId: expired.to,
          reason: "Auto-expired after 7 days",
        },
      }).catch(error => console.error("Could not record settlement-expired activity:", error));

      clearInsightCaches([expired.from?.toString(), expired.to?.toString()]);
    }
    return expiredCount;
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

    // Keep date labels consistent with the viewer's calendar without emitting
    // reminders from a read request; the background worker owns delivery.
    const today = getDateInTimeZone(req.query.timeZone);
    const tomorrow = addDaysToDateOnly(today, 1);
    const scheduleRequestsWithStatus = scheduleRequests.map((schedule) => {
      const dueDateOnly = schedule.dueDate.toISOString().slice(0, 10);
      const dueStatus = dueDateOnly < today
        ? "overdue"
        : dueDateOnly === today
          ? "due_today"
          : dueDateOnly === tomorrow
            ? "due_tomorrow"
            : "upcoming";
      return { ...schedule.toObject(), dueDateOnly, dueStatus };
    });

    // Keep payer-provided UPI references visible only to the two participants.
    // Other group members still receive pending amounts/status for debt context.
    const settlementsForViewer = allSettlements.map((settlement) => {
      const payerId = settlement.from?._id?.toString();
      const receiverId = settlement.to?._id?.toString();
      if (payerId === req.user.id || receiverId === req.user.id) return settlement;

      const safeSettlement = settlement.toObject();
      delete safeSettlement.upiReference;
      return safeSettlement;
    });

    // Separate by status (legacy settlements have no status and should be treated as confirmed)
    const confirmedSettlements = settlementsForViewer.filter((s) => !s.status || s.status === "confirmed");
    const pendingRequests = settlementsForViewer.filter((s) => s.status === "pending");

    if (expenses.length === 0) {
      return res.json({
        transactions: [],
        confirmedSettlements,
        pendingRequests,
        scheduleRequests: scheduleRequestsWithStatus,
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
      scheduleRequests: scheduleRequestsWithStatus,
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
  let reservedGroupId = null;
  let reservedMutationToken = null;
  try {
    const body = req.body || {};
    const { groupId, toUserId, scheduleId } = body;
    const rawIdempotencyKey = req.get("Idempotency-Key");
    const idempotencyKey = typeof rawIdempotencyKey === "string"
      ? rawIdempotencyKey.trim()
      : null;
    if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({ message: "Invalid settlement idempotency key" });
    }

    let upiReference = null;
    if (body.upiReference !== undefined && body.upiReference !== null) {
      if (typeof body.upiReference !== "string") {
        return res.status(400).json({ message: "UPI reference must be text." });
      }
      upiReference = body.upiReference.trim();
      if (upiReference && !/^[A-Za-z0-9][A-Za-z0-9/_-]{5,63}$/.test(upiReference)) {
        return res.status(400).json({
          message: "UPI reference must be 6–64 characters and contain only letters, numbers, /, _ or -.",
        });
      }
      if (!upiReference) upiReference = null;
    }

    if (!groupId || !toUserId || body.amount === undefined) {
      return res.status(400).json({ message: 'groupId, toUserId and amount are required' });
    }
    if (!mongoose.isValidObjectId(groupId) || !mongoose.isValidObjectId(toUserId)) {
      return res.status(400).json({ message: 'Invalid group or recipient id' });
    }
    if (scheduleId !== undefined && scheduleId !== null && !mongoose.isValidObjectId(scheduleId)) {
      return res.status(400).json({ message: "Invalid payment schedule id" });
    }

    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!Number.isFinite(body.amount) || amount <= 0 || body.amount !== amount) {
      return res.status(400).json({ message: 'Amount must be positive and have at most two decimal places' });
    }

    const amountInPaise = Math.round(amount * 100);
    const idempotencyHash = idempotencyKey
      ? createHash("sha256").update(JSON.stringify({
        groupId: groupId.toString(),
        from: req.user.id,
        to: toUserId.toString(),
        amountPaise: amountInPaise,
        scheduleId: scheduleId ? scheduleId.toString() : null,
      })).digest("hex")
      : null;

    const group = await reserveGroupWrite(groupId, req.user.id);
    if (!group) {
      const failure = await groupWriteFailure(groupId, req.user.id);
      return res.status(failure.status).json({ message: failure.message });
    }
    reservedGroupId = group._id;
    reservedMutationToken = group.$locals.financialMutationToken;

    if (toUserId === req.user.id) {
      return res.status(400).json({ message: 'You cannot settle a payment with yourself' });
    }
    const recipientIsMember = group.members.some(m => m.user.toString() === toUserId);
    if (!recipientIsMember) {
      return res.status(400).json({ message: 'Settlement recipient must be a member of this group' });
    }

    const respondWithExistingSettlement = async (existingSettlement) => {
      if (existingSettlement.idempotencyHash !== idempotencyHash) {
        return res.status(409).json({
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "This settlement request key was already used for different payment details.",
        });
      }
      // Allow a retry to attach its optional UTR if the original attempt did not.
      if (upiReference && !existingSettlement.upiReference) {
        await Settlement.updateOne(
          { _id: existingSettlement._id, from: req.user.id, upiReference: null },
          { $set: { upiReference } },
        );
      }
      const replayed = await Settlement.findById(existingSettlement._id)
        .populate("from", "name email upiId")
        .populate("to", "name email upiId");
      return res.status(200).json(replayed || existingSettlement);
    };

    // Replay before expiry, debt and active-schedule checks: a successful first
    // request may already have changed those states.
    if (idempotencyKey) {
      const existingSettlement = await Settlement.findOne({
        from: req.user.id,
        idempotencyKey,
      });
      if (existingSettlement) {
        return await respondWithExistingSettlement(existingSettlement);
      }
    }

    await autoExpirePendingSettlements(groupId);

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
        upiReference,
        // Preserve the accepted schedule's ledger snapshot and include any
        // additional group ledger rows present when this payment is recorded.
        sourceExpenseIds: [...new Set([
          ...(scheduleId && Array.isArray(activeSchedule?.sourceExpenseIds)
            ? activeSchedule.sourceExpenseIds
            : []),
          ...getExpenseSourceIds(expenses),
        ].map((expenseId) => expenseId.toString()))],
        ...(idempotencyKey ? { idempotencyKey, idempotencyHash } : {}),
      });
      if (linkedSchedule) {
        linkedSchedule.paymentSettlement = settlement._id;
        await linkedSchedule.save();
      }
    } catch (createError) {
      // If the settlement row was created but linking the schedule failed,
      // remove that uncommitted pending row before restoring the agreement.
      if (settlement?._id) {
        await Settlement.deleteOne({ _id: settlement._id, status: "pending" });
      }
      if (linkedSchedule) {
        await SettlementSchedule.updateOne(
          { _id: linkedSchedule._id, status: "payment_pending", paymentSettlement: null },
          { $set: { status: "accepted" } },
        );
      }
      if (idempotencyKey && createError.code === 11000) {
        const existingSettlement = await Settlement.findOne({
          from: req.user.id,
          idempotencyKey,
        });
        if (existingSettlement) {
          return await respondWithExistingSettlement(existingSettlement);
        }
      }
      throw createError;
    }

    const populated = await Settlement.findById(settlement._id)
      .populate("from", "name email upiId")
      .populate("to", "name email upiId");

    // Broadcast status only; participants fetch their own view for the UPI reference.
    const settlementEvent = populated.toObject();
    delete settlementEvent.upiReference;
    safeEmit(groupId, 'settlement_requested', settlementEvent);

    // Log activity
    ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: 'settlement_requested',
      meta: { amount, toName: populated.to?.name, toId: toUserId },
    }).catch(error => console.error("Could not record settlement-requested activity:", error));

    res.status(201).json(populated);

    // Bust the payer's cached trust score — a new pending settlement
    // changes their repayment-reliability picture immediately.
    clearInsightCaches([req.user.id]);
    await releaseGroupWrite(reservedGroupId, reservedMutationToken);
    reservedGroupId = null;
  } catch (error) {
    console.error("Error creating settlement request:", error);
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Settlement request already sent. Waiting for receiver to confirm." });
    }
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({ message: "Please check the settlement details and try again" });
    }
    return res.status(500).json({ message: "We could not create this payment request. Please try again." });
  } finally {
    if (reservedGroupId) {
      try {
        await releaseGroupWrite(reservedGroupId, reservedMutationToken);
      } catch (releaseError) {
        console.error("Could not release settlement group write reservation:", releaseError);
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM SETTLEMENT (receiver confirms they received the payment)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/confirm", protect, async (req, res) => {
  let reservedGroupId = null;
  let reservedMutationToken = null;
  try {
    const { groupId, settlementId } = req.body || {};
    if (!mongoose.isValidObjectId(groupId) || !mongoose.isValidObjectId(settlementId)) {
      return res.status(400).json({ message: "Invalid group or settlement id" });
    }

    const group = await reserveGroupWrite(groupId, req.user.id);
    if (!group) {
      const failure = await groupWriteFailure(groupId, req.user.id);
      return res.status(failure.status).json({ message: failure.message });
    }
    reservedGroupId = group._id;
    reservedMutationToken = group.$locals.financialMutationToken;

    // Expire overdue requests before a receiver can confirm them. A retry
    // below is scoped to this exact settlement, never another payment by
    // the same payer in the same group.
    await autoExpirePendingSettlements(groupId);

    const targetSettlement = await Settlement.findOne({
      _id: settlementId,
      group: groupId,
      to: req.user.id,
    }).select("from");
    if (!targetSettlement) {
      return res.status(404).json({ message: "Settlement request not found for this receiver" });
    }

    const fromUserId = targetSettlement.from.toString();
    const payerIsMember = group.members.some(member => member.user.toString() === fromUserId);
    if (!payerIsMember) {
      return res.status(400).json({ message: "Both users must still be members of this group" });
    }

    // Compare-and-set prevents confirm, reject, cancel, or expiry from
    // overwriting one another. Repeating a completed confirmation returns
    // the same record and cannot confirm a later request from this payer.
    const settlement = await Settlement.findOneAndUpdate(
      {
        _id: settlementId,
        group: groupId,
        from: fromUserId,
        to: req.user.id,
        status: "pending",
      },
      { $set: { status: "confirmed" } },
      { new: true },
    );

    if (!settlement) {
      const current = await Settlement.findOne({
        _id: settlementId,
        group: groupId,
        from: fromUserId,
        to: req.user.id,
      })
        .populate("from", "name email upiId")
        .populate("to", "name email upiId");
      if (current?.status === "confirmed") {
        // Repair the linked schedule if the previous request stopped after
        // confirming the settlement but before completing the schedule.
        await completeLinkedSchedule(current, req.user.id);
        clearInsightCaches([fromUserId]);
        return res.json(current);
      }
      return res.status(409).json({ message: "This settlement is no longer pending and cannot be confirmed" });
    }

    await completeLinkedSchedule(settlement, req.user.id);

    const populated = await Settlement.findById(settlement._id)
      .populate("from", "name email upiId")
      .populate("to", "name email upiId");

    // Keep payer-provided references out of group-wide socket broadcasts.
    const settlementEvent = populated.toObject();
    delete settlementEvent.upiReference;
    safeEmit(groupId, "settlement_done", settlementEvent);
    await ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: "settlement_confirmed",
      meta: { amount: settlement.amount, fromName: populated.from?.name, fromId: populated.from?._id },
    }).catch(error => console.error("Could not record settlement-confirmed activity:", error));

    clearInsightCaches([fromUserId]);
    return res.json(populated);
  } catch (error) {
    console.error("Error confirming settlement:", error);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    if (reservedGroupId) {
      try {
        await releaseGroupWrite(reservedGroupId, reservedMutationToken);
      } catch (releaseError) {
        console.error("Could not release confirmation group write reservation:", releaseError);
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL / UNDO SETTLEMENT REQUEST (payer only, only while still pending)
// ─────────────────────────────────────────────────────────────────────────────
const handlePayerCancel = async (req, res) => {
  let reservedGroupId = null;
  let reservedMutationToken = null;
  try {
    const { groupId, settlementId } = req.body || {};
    if (!mongoose.isValidObjectId(groupId) || !mongoose.isValidObjectId(settlementId)) {
      return res.status(400).json({ message: "Invalid group or settlement id" });
    }

    const group = await reserveGroupWrite(groupId, req.user.id);
    if (!group) {
      const failure = await groupWriteFailure(groupId, req.user.id);
      return res.status(failure.status).json({ message: failure.message });
    }
    reservedGroupId = group._id;
    reservedMutationToken = group.$locals.financialMutationToken;

    await autoExpirePendingSettlements(groupId);
    const targetSettlement = await Settlement.findOne({
      _id: settlementId,
      group: groupId,
    }).select("from");
    if (!targetSettlement || targetSettlement.from.toString() !== req.user.id) {
      return res.status(404).json({ message: "Settlement request not found for this payer" });
    }

    const settlement = await Settlement.findOneAndUpdate(
      {
        _id: settlementId,
        group: groupId,
        from: req.user.id,
        status: "pending",
      },
      { $set: { status: "cancelled" } },
      { new: true },
    );

    if (!settlement) {
      const current = await Settlement.findOne({
        _id: settlementId,
        group: groupId,
        from: req.user.id,
      });
      if (current?.status === "cancelled") {
        await restoreLinkedSchedule(current._id);
        clearInsightCaches([req.user.id, current.to?.toString()]);
        return res.json({ message: "Settlement request cancelled successfully", settlement: current });
      }
      return res.status(409).json({ message: "This settlement is no longer pending and cannot be cancelled" });
    }

    await restoreLinkedSchedule(settlement._id);

    await ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: "settlement_cancelled",
      meta: { amount: settlement.amount, toId: settlement.to },
    }).catch(error => console.error("Could not record settlement-cancelled activity:", error));

    safeEmit(groupId, "settlement_undone", {
      fromId: req.user.id,
      toId: settlement.to.toString(),
    });
    clearInsightCaches([req.user.id, settlement.to.toString()]);

    return res.json({ message: "Settlement request cancelled successfully", settlement });
  } catch (error) {
    console.error("Error cancelling settlement request:", error);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    if (reservedGroupId) {
      try {
        await releaseGroupWrite(reservedGroupId, reservedMutationToken);
      } catch (releaseError) {
        console.error("Could not release cancellation group write reservation:", releaseError);
      }
    }
  }
};

router.delete("/settle", protect, handlePayerCancel);
router.post("/cancel", protect, handlePayerCancel);

// ─────────────────────────────────────────────────────────────────────────────
// REJECT SETTLEMENT REQUEST (receiver only, only while still pending)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/reject", protect, async (req, res) => {
  let reservedGroupId = null;
  let reservedMutationToken = null;
  try {
    const { groupId, settlementId, reason } = req.body || {};
    if (!mongoose.isValidObjectId(groupId) || !mongoose.isValidObjectId(settlementId)) {
      return res.status(400).json({ message: "Invalid group or settlement id" });
    }

    const group = await reserveGroupWrite(groupId, req.user.id);
    if (!group) {
      const failure = await groupWriteFailure(groupId, req.user.id);
      return res.status(failure.status).json({ message: failure.message });
    }
    reservedGroupId = group._id;
    reservedMutationToken = group.$locals.financialMutationToken;

    await autoExpirePendingSettlements(groupId);
    const targetSettlement = await Settlement.findOne({
      _id: settlementId,
      group: groupId,
      to: req.user.id,
    }).select("from");
    if (!targetSettlement) {
      return res.status(404).json({ message: "Settlement request not found for this receiver" });
    }

    const fromUserId = targetSettlement.from.toString();
    const payerIsMember = group.members.some(member => member.user.toString() === fromUserId);
    if (!payerIsMember) {
      return res.status(400).json({ message: "Both users must still be members of this group" });
    }

    const settlement = await Settlement.findOneAndUpdate(
      {
        _id: settlementId,
        group: groupId,
        from: fromUserId,
        to: req.user.id,
        status: "pending",
      },
      {
        $set: {
          status: "rejected",
          rejectionReason: String(reason || "Payment not received or amount mismatch").slice(0, 240),
        },
      },
      { new: true },
    ).populate("from", "name");

    if (!settlement) {
      const current = await Settlement.findOne({
        _id: settlementId,
        group: groupId,
        from: fromUserId,
        to: req.user.id,
      }).populate("from", "name");
      if (current?.status === "rejected") {
        await restoreLinkedSchedule(current._id);
        clearInsightCaches([fromUserId, req.user.id]);
        return res.json({ message: "Settlement request rejected", settlement: current });
      }
      return res.status(409).json({ message: "This settlement is no longer pending and cannot be rejected" });
    }

    await restoreLinkedSchedule(settlement._id);

    safeEmit(groupId, "settlement_undone", {
      fromId: fromUserId,
      toId: req.user.id,
    });
    await ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: "settlement_rejected",
      meta: {
        amount: settlement.amount,
        fromId: fromUserId,
        fromName: settlement.from?.name,
        reason: settlement.rejectionReason,
      },
    }).catch(error => console.error("Could not record settlement-rejected activity:", error));

    clearInsightCaches([fromUserId, req.user.id]);
    return res.json({ message: "Settlement request rejected", settlement });
  } catch (error) {
    console.error("Error rejecting settlement request:", error);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    if (reservedGroupId) {
      try {
        await releaseGroupWrite(reservedGroupId, reservedMutationToken);
      } catch (releaseError) {
        console.error("Could not release rejection group write reservation:", releaseError);
      }
    }
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

    const today = getDateInTimeZone(req.query.timeZone);
    const tomorrow = addDaysToDateOnly(today, 1);
    res.json({
      schedules: schedules.map((schedule) => {
        const dueDateOnly = schedule.dueDate.toISOString().slice(0, 10);
        return {
          ...schedule.toObject(),
          dueDateOnly,
          dueStatus: dueDateOnly < today ? "overdue" : dueDateOnly === today ? "due_today" : dueDateOnly === tomorrow ? "due_tomorrow" : "upcoming",
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching payment schedules:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/schedule", async (req, res) => {
  let reservedGroupId = null;
  let reservedMutationToken = null;
  try {
    const body = req.body || {};
    const { groupId, toUserId, dueDate } = body;
    const rawIdempotencyKey = req.get("Idempotency-Key");
    const idempotencyKey = typeof rawIdempotencyKey === "string"
      ? rawIdempotencyKey.trim()
      : null;
    if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({ message: "Invalid payment schedule idempotency key" });
    }
    const amount = Number(body.amount);
    if (!groupId || !toUserId || body.amount === undefined) {
      return res.status(400).json({ message: "groupId, toUserId and amount are required" });
    }
    if (!mongoose.isValidObjectId(groupId) || !mongoose.isValidObjectId(toUserId)) {
      return res.status(400).json({ message: "Invalid group or recipient id" });
    }
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
      return res.status(400).json({ message: "Amount must be positive and have at most two decimal places" });
    }

    const group = await reserveGroupWrite(groupId, req.user.id);
    if (!group) {
      const failure = await groupWriteFailure(groupId, req.user.id);
      return res.status(failure.status).json({ message: failure.message });
    }
    reservedGroupId = group._id;
    reservedMutationToken = group.$locals.financialMutationToken;

    const isDefaultDueDate = dueDate === undefined || dueDate === null || dueDate === "";
    const requestedTimeZone = typeof body.timeZone === "string" && body.timeZone.trim()
      ? body.timeZone.trim()
      : "UTC";
    if (requestedTimeZone.length > 64) {
      return res.status(400).json({ message: "Please provide a valid timezone" });
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: requestedTimeZone });
    } catch {
      return res.status(400).json({ message: "Please provide a valid timezone" });
    }
    const today = getDateInTimeZone(requestedTimeZone);
    const resolvedDueDate = isDefaultDueDate ? addDaysToDateOnly(today, 15) : dueDate;
    if (typeof resolvedDueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(resolvedDueDate)) {
      return res.status(400).json({ message: "Due date must use YYYY-MM-DD format" });
    }
    const parsedDueDate = new Date(`${resolvedDueDate}T12:00:00.000Z`);
    if (Number.isNaN(parsedDueDate.getTime()) || parsedDueDate.toISOString().slice(0, 10) !== resolvedDueDate) {
      return res.status(400).json({ message: "Please provide a valid calendar date" });
    }
    const requestedDate = isDefaultDueDate ? null : resolvedDueDate;
    const idempotencyHash = idempotencyKey
      ? createHash("sha256").update(JSON.stringify({
        groupId: groupId.toString(),
        from: req.user.id,
        to: toUserId.toString(),
        amountPaise: Math.round(amount * 100),
        dueDate: requestedDate,
        timeZone: requestedDate === null ? requestedTimeZone : null,
      })).digest("hex")
      : null;

    if (toUserId === req.user.id) {
      return res.status(400).json({ message: "You cannot schedule a payment to yourself" });
    }
    const recipientIsMember = group.members.some((member) => member.user?.toString() === toUserId);
    if (!recipientIsMember) {
      return res.status(400).json({ message: "Schedule recipient must be a member of this group" });
    }

    const respondWithExistingSchedule = async (existingSchedule) => {
      if (existingSchedule.idempotencyHash !== idempotencyHash) {
        return res.status(409).json({
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "This payment schedule request key was already used for different details.",
        });
      }
      const replayed = await SettlementSchedule.findById(existingSchedule._id)
        .populate("from", "name email upiId")
        .populate("to", "name email upiId");
      return res.status(200).json(replayed || existingSchedule);
    };

    // Replay the original proposal before checking for an active proposal or
    // current debt: later acceptance/cancellation and new expenses must not
    // turn an uncertain retry into a second schedule or a false conflict.
    if (idempotencyKey) {
      const previousSchedule = await SettlementSchedule.findOne({
        from: req.user.id,
        idempotencyKey,
      });
      if (previousSchedule) {
        return await respondWithExistingSchedule(previousSchedule);
      }
    }

    // Validate the date range only for a new proposal. A matching idempotent
    // retry must still replay its original schedule after the due date passes.
    if (resolvedDueDate < today) {
      return res.status(400).json({ message: "Due date cannot be in the past" });
    }
    const maxDueDate = addMonthsToDateOnly(today, 3);
    if (!isDefaultDueDate && resolvedDueDate > maxDueDate) {
      return res.status(400).json({ message: "Choose a repayment date within the next three calendar months" });
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

    let schedule;
    try {
      schedule = await SettlementSchedule.create({
        group: groupId, from: req.user.id, to: toUserId, amount,
        dueDate: parsedDueDate,
        timeZone: requestedTimeZone,
        isDefaultDueDate,
        status: "proposed",
        active: true,
        sourceExpenseIds: getExpenseSourceIds(expenses),
        ...(idempotencyKey ? { idempotencyKey, idempotencyHash } : {}),
      });
    } catch (createError) {
      if (idempotencyKey && createError?.code === 11000) {
        const previousSchedule = await SettlementSchedule.findOne({
          from: req.user.id,
          idempotencyKey,
        });
        if (previousSchedule) {
          return await respondWithExistingSchedule(previousSchedule);
        }
      }
      throw createError;
    }
    const populated = await SettlementSchedule.findById(schedule._id)
      .populate("from", "name email upiId")
      .populate("to", "name email upiId");

    safeEmitSchedule(populated, "schedule_proposed");
    ActivityLog.create({
      group: groupId, actor: req.user.id, type: "schedule_proposed",
      meta: { amount, fromId: req.user.id, toId: toUserId, dueDate: resolvedDueDate },
    }).catch(error => console.error("Could not record schedule-proposed activity:", error));
    await releaseGroupWrite(reservedGroupId, reservedMutationToken);
    reservedGroupId = null;
    res.status(201).json(populated);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "An active payment schedule already exists for this member" });
    }
    console.error("Error creating payment schedule:", error);
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({ message: "Please check the payment schedule details and try again" });
    }
    return res.status(500).json({ message: "We could not create this payment schedule. Please try again." });
  } finally {
    if (reservedGroupId) {
      try {
        await releaseGroupWrite(reservedGroupId, reservedMutationToken);
      } catch (releaseError) {
        console.error("Could not release schedule group write reservation:", releaseError);
      }
    }
  }
});

router.post("/schedule/:scheduleId/respond", async (req, res) => {
  let reservedGroupId = null;
  let reservedMutationToken = null;
  try {
    const { action, reason } = req.body || {};
    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ message: "Action must be accept or reject" });
    }
    if (!mongoose.isValidObjectId(req.params.scheduleId)) {
      return res.status(400).json({ message: "Invalid payment schedule id" });
    }

    const proposedSchedule = await SettlementSchedule.findOne({
      _id: req.params.scheduleId, to: req.user.id, status: "proposed", active: true,
    });
    if (!proposedSchedule) {
      return res.status(404).json({ message: "No proposed payment schedule found for you to respond to" });
    }

    const group = await reserveGroupWrite(proposedSchedule.group, req.user.id);
    if (!group) {
      const failure = await groupWriteFailure(proposedSchedule.group, req.user.id);
      return res.status(failure.status).json({ message: failure.message });
    }
    reservedGroupId = group._id;
    reservedMutationToken = group.$locals.financialMutationToken;

    const bothParticipantsAreMembers = group.members.some(member => member.user.toString() === proposedSchedule.from.toString())
      && group.members.some(member => member.user.toString() === proposedSchedule.to.toString());
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

    clearInsightCaches([schedule.from?._id?.toString?.() || schedule.from?.toString?.(), schedule.to?._id?.toString?.() || schedule.to?.toString?.()]);
    safeEmitSchedule(schedule, action === "accept" ? "schedule_accepted" : "schedule_rejected");
    await ActivityLog.create({
      group: schedule.group, actor: req.user.id,
      type: action === "accept" ? "schedule_accepted" : "schedule_rejected",
      meta: { amount: schedule.amount, fromId: schedule.from?._id?.toString(), toId: schedule.to?._id?.toString(), dueDate: schedule.dueDate.toISOString().slice(0, 10) },
    }).catch(error => console.error("Could not record schedule-response activity:", error));
    return res.json(schedule);
  } catch (error) {
    console.error("Error responding to payment schedule:", error);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    if (reservedGroupId) {
      try {
        await releaseGroupWrite(reservedGroupId, reservedMutationToken);
      } catch (releaseError) {
        console.error("Could not release schedule-response group write reservation:", releaseError);
      }
    }
  }
});

router.post("/schedule/:scheduleId/cancel", async (req, res) => {
  let reservedGroupId = null;
  let reservedMutationToken = null;
  try {
    if (!mongoose.isValidObjectId(req.params.scheduleId)) {
      return res.status(400).json({ message: "Invalid payment schedule id" });
    }
    const cancellableSchedule = await SettlementSchedule.findOne({
      _id: req.params.scheduleId,
      $or: [{ from: req.user.id }, { to: req.user.id }],
      active: true,
      status: { $in: ["proposed", "accepted"] },
    });
    if (!cancellableSchedule) {
      return res.status(404).json({ message: "No cancellable payment schedule found" });
    }
    if (
      cancellableSchedule.status === "accepted" &&
      cancellableSchedule.dueDate.toISOString().slice(0, 10) < getDateInTimeZone(cancellableSchedule.timeZone)
    ) {
      return res.status(409).json({
        message: "An overdue repayment schedule cannot be cancelled. Record the payment so the Trust Score penalty can be cleared.",
      });
    }

    const group = await reserveGroupWrite(cancellableSchedule.group, req.user.id);
    if (!group) {
      const failure = await groupWriteFailure(cancellableSchedule.group, req.user.id);
      return res.status(failure.status).json({ message: failure.message });
    }
    reservedGroupId = group._id;
    reservedMutationToken = group.$locals.financialMutationToken;

    const bothParticipantsAreMembers = group.members.some(member => member.user.toString() === cancellableSchedule.from.toString())
      && group.members.some(member => member.user.toString() === cancellableSchedule.to.toString());
    if (!bothParticipantsAreMembers) {
      return res.status(403).json({ message: "Both participants must remain members of this group" });
    }

    const schedule = await SettlementSchedule.findOneAndUpdate(
      { _id: cancellableSchedule._id, active: true, status: { $in: ["proposed", "accepted"] } },
      { $set: { status: "cancelled", active: false, respondedAt: new Date() } },
      { new: true },
    ).populate("from to", "name email upiId");
    if (!schedule) return res.status(404).json({ message: "No cancellable payment schedule found" });

    clearInsightCaches([schedule.from?._id?.toString?.() || schedule.from?.toString?.(), schedule.to?._id?.toString?.() || schedule.to?.toString?.()]);
    safeEmitSchedule(schedule, "schedule_cancelled");
    await ActivityLog.create({
      group: schedule.group, actor: req.user.id, type: "schedule_cancelled",
      meta: { amount: schedule.amount, fromId: schedule.from?._id?.toString(), toId: schedule.to?._id?.toString() },
    }).catch(error => console.error("Could not record schedule-cancelled activity:", error));
    return res.json(schedule);
  } catch (error) {
    console.error("Error cancelling payment schedule:", error);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    if (reservedGroupId) {
      try {
        await releaseGroupWrite(reservedGroupId, reservedMutationToken);
      } catch (releaseError) {
        console.error("Could not release schedule-cancellation group write reservation:", releaseError);
      }
    }
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

    const scheduleActivityTypes = [
      "schedule_proposed",
      "schedule_accepted",
      "schedule_rejected",
      "schedule_cancelled",
      "schedule_completed",
    ];
    const activityVisibilityQuery = {
      group: groupId,
      $or: [
        { type: { $nin: scheduleActivityTypes } },
        {
          type: { $in: scheduleActivityTypes },
          $or: [
            { actor: req.user.id },
            { "meta.fromId": req.user.id },
            { "meta.toId": req.user.id },
          ],
        },
      ],
    };

    const [logs, total] = await Promise.all([
      ActivityLog.find(activityVisibilityQuery)
        .populate('actor', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ActivityLog.countDocuments(activityVisibilityQuery),
    ]);

    res.json({ logs, total, hasMore: skip + limit < total });
  } catch (error) {
    console.error("Error fetching activity log:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
