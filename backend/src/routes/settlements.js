import express from 'express';
import Expense from '../models/Expense.js';
import Group from '../models/Group.js';
import Settlement from '../models/Settlement.js';
import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import protect from '../middleware/auth.js';
import requireVerified from '../middleware/requireVerified.js';
import simplifyDebts, { computeBalances } from '../utils/debtSimplify.js';
import { io } from '../../server.js';

const router = express.Router();

router.use(protect, requireVerified);

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// GET SIMPLIFIED DEBTS FOR A GROUP
// ─────────────────────────────────────────────────────────────────────────────
router.get("/simplify/:groupId", protect, async (req, res) => {
  try {
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

    const [expenses, allSettlements] = await Promise.all([
      Expense.find({ group: req.params.groupId })
        .populate("paidBy", "name email upiId")
        .populate("splits.user", "name email upiId"),
      Settlement.find({ group: req.params.groupId })
        .populate("from", "name email upiId")
        .populate("to",   "name email upiId"),
    ]);

    // Separate by status (legacy settlements have no status and should be treated as confirmed)
    const confirmedSettlements  = allSettlements.filter((s) => !s.status || s.status === "confirmed");
    const pendingRequests       = allSettlements.filter((s) => s.status === "pending");

    if (expenses.length === 0) {
      return res.json({
        transactions: [],
        confirmedSettlements,
        pendingRequests,
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
    const { groupId, toUserId } = req.body;
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

    // A settlement must cover an outstanding net debt between these members
    // using raw group balances (independent of greedy simplification path changes).
    const [expenses, confirmedSettlements, pendingBetweenUs] = await Promise.all([
      Expense.find({ group: groupId }),
      Settlement.find({ group: groupId, $or: [{ status: 'confirmed' }, { status: { $exists: false } }] }),
      Settlement.find({ group: groupId, from: req.user.id, to: toUserId, status: 'pending' }),
    ]);

    const balances = computeBalances(expenses, confirmedSettlements);
    const payerBalance = balances[req.user.id] || 0;
    const receiverBalance = balances[toUserId] || 0;

    const rawPayerDebt = -payerBalance;
    const rawReceiverCredit = receiverBalance;

    // Prevent double-counting already-in-flight pending settlements between these two members
    const otherPendingSum = pendingBetweenUs.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);

    const maxDebtPayer = rawPayerDebt - otherPendingSum;
    const maxCreditReceiver = rawReceiverCredit - otherPendingSum;
    const maxAllowedPaise = Math.min(maxDebtPayer, maxCreditReceiver);

    const amountInPaise = Math.round(amount * 100);
    if (rawPayerDebt <= 0 || rawReceiverCredit <= 0 || amountInPaise > maxAllowedPaise) {
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

    const settlement = await Settlement.create({
      group: groupId,
      from: req.user.id,
      to: toUserId,
      amount,
      status: "pending",
    });

    const populated = await Settlement.findById(settlement._id)
      .populate("from", "name email upiId")
      .populate("to", "name email upiId");

    io.to(groupId).emit('settlement_requested', populated);

    // Log activity
    await ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: 'settlement_requested',
      meta: { amount, toName: populated.to?.name, toId: toUserId },
    });

    res.status(201).json(populated);
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

    const settlement = await Settlement.findOne({
      group: groupId,
      from: fromUserId,
      to: req.user.id,   // only the receiver can confirm
      status: "pending",
    });

    if (!settlement) {
      return res.status(404).json({ message: "No pending settlement request found" });
    }

    const group = await Group.findById(groupId);
    const payerIsMember = group?.members.some((member) => member.user.toString() === fromUserId);
    const receiverIsMember = group?.members.some((member) => member.user.toString() === req.user.id);
    if (!payerIsMember || !receiverIsMember) {
      return res.status(400).json({ message: "Both users must still be members of this group" });
    }

    const [expenses, confirmedSettlements] = await Promise.all([
      Expense.find({ group: groupId }),
      Settlement.find({ group: groupId, $or: [{ status: "confirmed" }, { status: { $exists: false } }] }),
    ]);

    const balances = computeBalances(expenses, confirmedSettlements);
    const payerBalance = balances[fromUserId] || 0;
    const receiverBalance = balances[req.user.id] || 0;

    const rawPayerDebt = -payerBalance;
    const rawReceiverCredit = receiverBalance;

    const amountInPaise = Math.round(settlement.amount * 100);

    if (rawPayerDebt < amountInPaise || rawReceiverCredit < amountInPaise) {
      return res.status(400).json({ message: "This payment no longer matches an outstanding debt" });
    }

    settlement.status = "confirmed";
    await settlement.save();

    const populated = await Settlement.findById(settlement._id)
      .populate("from", "name email upiId")
      .populate("to", "name email upiId");

    io.to(groupId).emit('settlement_done', populated);

    // Log activity
    await ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: 'settlement_confirmed',
      meta: { amount: settlement.amount, fromName: populated.from?.name, fromId: populated.from?._id },
    });

    res.json(populated);
  } catch (error) {
    console.error("Error confirming settlement:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL / UNDO SETTLEMENT REQUEST (payer only, only while still pending)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/settle", protect, async (req, res) => {
  try {
    const { groupId, toUserId } = req.body;

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

    await settlement.deleteOne();

    // Notify group
    io.to(groupId).emit("settlement_undone", {
      fromId: req.user.id,
      toId: toUserId,
    });

    res.json({ message: "Settlement request cancelled" });
  } catch (error) {
    console.error("Error rejecting settlement:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REJECT SETTLEMENT REQUEST (receiver only, only while still pending)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/reject", protect, async (req, res) => {
  try {
    const { groupId, fromUserId } = req.body;

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

    await settlement.deleteOne();

    // Notify group
    io.to(groupId).emit("settlement_undone", {
      fromId: fromUserId,
      toId: req.user.id,
    });

    // Log activity
    await ActivityLog.create({
      group: groupId,
      actor: req.user.id,
      type: 'settlement_rejected',
      meta: { amount: settlement.amount, fromId: fromUserId, fromName: settlement.from?.name },
    });

    res.json({ message: "Settlement request rejected" });
  } catch (error) {
    console.error("Error rejecting settlement request:", error);
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
