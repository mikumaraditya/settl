import express from 'express';
import Expense from '../models/Expense.js';
import Group from '../models/Group.js';
import ActivityLog from '../models/ActivityLog.js';
import protect from '../middleware/auth.js';
import requireVerified from '../middleware/requireVerified.js';
import { io } from '../../server.js';

const router = express.Router();

router.use(protect, requireVerified);

// ─────────────────────────────────────────────────────────────────────────────
// ADD EXPENSE
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", protect, async (req, res) => {
  const { description, amount, groupId, group: groupBodyId, paidBy: paidByBody, members: membersBody, splitType, category, splits } = req.body;

  try {
    const targetGroupId = groupId || groupBodyId;
    const group = await Group.findById(targetGroupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const memberIds = new Set(group.members.map((member) => member.user.toString()));
    if (!memberIds.has(req.user.id)) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const paidBy = paidByBody || req.user.id;
    if (paidBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "You can only record expenses that you paid" });
    }

    const splitMembers = membersBody || group.members.map((m) => m.user.toString());

    if (!Array.isArray(splitMembers) || splitMembers.length === 0) {
      return res.status(400).json({ message: "No members specified for splitting" });
    }

    const splitMemberIds = splitMembers.map((memberId) => memberId?.toString());
    if (
      splitMemberIds.some((memberId) => !memberIds.has(memberId)) ||
      new Set(splitMemberIds).size !== splitMemberIds.length
    ) {
      return res.status(400).json({ message: "Split members must be unique members of this group" });
    }

    let finalSplits = [];
    const totalAmount = Math.round(Number(amount) * 100) / 100;

    if (!Number.isFinite(amount) || totalAmount <= 0 || amount !== totalAmount) {
      return res.status(400).json({ message: "Amount must be a positive value with at most two decimal places" });
    }

    if (splitType === "equal" || !splitType) {
      const numMembers = splitMembers.length;
      const totalPaise = Math.round(totalAmount * 100);
      const baseShare = Math.floor(totalPaise / numMembers);
      const remainder = totalPaise % numMembers;

      finalSplits = splitMembers.map((userId, index) => ({
        user: userId,
        // Add the modulus remainder paise to the first person in the split array to guarantee absolute precision.
        amount: (index === 0 ? baseShare + remainder : baseShare) / 100,
        paid: userId === paidBy,
      }));
    } else if (splitType === "exact") {
      if (!splits || splits.length === 0) {
        return res.status(400).json({ message: "Splits details are required for exact split type" });
      }

      if (!Array.isArray(splits)) {
        return res.status(400).json({ message: "Splits must be an array" });
      }
      if (splits.some((split) => !split || typeof split !== "object")) {
        return res.status(400).json({ message: "Each split must include a member and amount" });
      }

      finalSplits = splits.map((s) => ({
        user: s.user,
        amount: Math.round(Number(s.amount) * 100) / 100,
        paid: s.user?.toString() === paidBy.toString(),
      }));

      const exactTotalPaise = finalSplits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0);
      if (
        finalSplits.some((split) => !Number.isFinite(split.amount) || split.amount <= 0) ||
        exactTotalPaise !== Math.round(totalAmount * 100)
      ) {
        return res.status(400).json({ message: "Exact splits must be positive amounts with at most two decimal places and add up to the expense amount" });
      }
    } else if (splitType === "percentage") {
      if (!splits || splits.length === 0) {
        return res.status(400).json({ message: "Splits details are required for percentage split type" });
      }
      if (!Array.isArray(splits)) {
        return res.status(400).json({ message: "Splits must be an array" });
      }
      if (splits.some((split) => !split || typeof split !== "object")) {
        return res.status(400).json({ message: "Each split must include a member and percentage" });
      }

      const totalPercentage = splits.reduce((sum, split) => sum + split.percentage, 0);
      if (
        splits.some((split) => !Number.isFinite(split.percentage) || split.percentage <= 0) ||
        Math.abs(totalPercentage - 100) > 0.000001
      ) {
        return res.status(400).json({ message: "Split percentages must be positive and add up to 100" });
      }

      const totalPaise = Math.round(totalAmount * 100);
      let sumOfSplits = 0;
      finalSplits = splits.map((s) => {
        const share = Math.floor((s.percentage / 100) * totalPaise);
        sumOfSplits += share;
        return {
          user: s.user,
          amount: share / 100,
          paid: s.user?.toString() === paidBy.toString(),
        };
      });
      // Distribute any float rounding leftover to the first member
      const remainder = totalPaise - sumOfSplits;
      if (remainder > 0 && finalSplits.length > 0) {
        finalSplits[0].amount += remainder / 100;
      }
    } else {
      return res.status(400).json({ message: "Invalid split type" });
    }

    const finalSplitUserIds = finalSplits.map((split) => split.user?.toString());
    if (
      finalSplitUserIds.some((memberId) => !memberIds.has(memberId)) ||
      new Set(finalSplitUserIds).size !== finalSplitUserIds.length
    ) {
      return res.status(400).json({ message: "Split members must be unique members of this group" });
    }

    const expense = await Expense.create({
      description,
      amount: totalAmount,
      paidBy,
      group: targetGroupId,
      splits: finalSplits,
      splitType: splitType || "equal",
      category: category || "other",
    });

    const populated = await Expense.findById(expense._id)
      .populate("paidBy", "name email")
      .populate("splits.user", "name email upiId");

    io.to(targetGroupId.toString()).emit('expense_added', populated);

    // Log activity
    await ActivityLog.create({
      group: targetGroupId,
      actor: req.user.id,
      type: 'expense_added',
      meta: {
        description: expense.description,
        amount:      expense.amount,
        category:    expense.category,
        splitType:   expense.splitType,
      },
    });

    res.status(201).json(populated);
  } catch (error) {
    console.error("Error creating expense:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET EXPENSES FOR A GROUP — with month-wise pagination
//
// Query params:
//   ?months=3   → how many months to load per page (default: 3)
//   ?page=1     → which page of months (default: 1)
//
// Response:
//   { expenses, totalMonths, loadedMonths, hasMore }
// ─────────────────────────────────────────────────────────────────────────────
router.get("/group/:groupId", protect, async (req, res) => {
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

    const monthsPerPage = Math.min(12, Math.max(1, parseInt(req.query.months) || 3));
    const page         = Math.max(1, parseInt(req.query.page)   || 1);
    const startIdx     = (page - 1) * monthsPerPage;

    const [monthPage] = await Expense.aggregate([
      { $match: { group: group._id } },
      {
        $project: {
          month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        },
      },
      { $group: { _id: "$month" } },
      { $sort: { _id: -1 } },
      {
        $facet: {
          visibleMonths: [{ $skip: startIdx }, { $limit: monthsPerPage }],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const totalMonths = monthPage?.total[0]?.count || 0;
    const visibleMonths = monthPage?.visibleMonths.map((month) => month._id) || [];
    const loadedMonths = Math.min(startIdx + visibleMonths.length, totalMonths);
    const hasMore = loadedMonths < totalMonths;

    if (visibleMonths.length === 0) {
      return res.json({ expenses: [], totalMonths, loadedMonths, hasMore });
    }

    const oldestMonth = visibleMonths.at(-1);
    const newestMonth = visibleMonths[0];
    const startDate = new Date(`${oldestMonth}-01T00:00:00.000Z`);
    const [newestYear, newestMonthNumber] = newestMonth.split("-").map(Number);
    const endDate = new Date(Date.UTC(newestYear, newestMonthNumber, 1));

    const expenses = await Expense.find({
      group: group._id,
      createdAt: { $gte: startDate, $lt: endDate },
    })
      .populate("paidBy", "name email")
      .populate("splits.user", "name email upiId")
      .sort({ createdAt: -1 });

    return res.json({ expenses, totalMonths, loadedMonths, hasMore });

    // ── Build an ordered list of unique "YYYY-MM" month keys ─────────────────
    // Ordered unique months (newest first)
    // ── Filter expenses to only the visible months ────────────────────────────
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE EXPENSE
// Only the payer can delete, and only within 2 hours of creation.
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", protect, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    if (expense.paidBy.toString() !== req.user.id) {
      return res
        .status(401)
        .json({ message: "Only the person who paid can delete this expense" });
    }

    // ── 2-hour window check ───────────────────────────────────────────────────
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const ageMs = Date.now() - new Date(expense.createdAt).getTime();
    if (ageMs > TWO_HOURS_MS) {
      return res.status(403).json({
        message:
          "Expenses can only be deleted within 2 hours of being added. This window has expired.",
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    await expense.deleteOne();

    // Log activity
    await ActivityLog.create({
      group: expense.group,
      actor: req.user.id,
      type:  'expense_deleted',
      meta: {
        description: expense.description,
        amount:      expense.amount,
      },
    });

    // Emit real-time event
    io.to(expense.group.toString()).emit('expense_deleted', { expenseId: req.params.id });

    res.json({ message: "Expense deleted" });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
