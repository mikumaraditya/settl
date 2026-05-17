import express from 'express';
import Expense from '../models/Expense.js';
import Group from '../models/Group.js';
import ActivityLog from '../models/ActivityLog.js';
import protect from '../middleware/auth.js';
import { io } from '../../server.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// ADD EXPENSE
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", protect, async (req, res) => {
  const { description, amount, groupId, splitType, category, splits } = req.body;

  try {
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    let finalSplits = [];
    const members = group.members.map((m) => m.user.toString());

    if (splitType === "equal") {
      const shareAmount = parseFloat((amount / members.length).toFixed(2));
      finalSplits = members.map((userId) => ({
        user: userId,
        amount: shareAmount,
        paid: userId === req.user.id,
      }));
    } else if (splitType === "exact") {
      finalSplits = splits.map((s) => ({
        user: s.user,
        amount: s.amount,
        paid: s.user === req.user.id,
      }));
    } else if (splitType === "percentage") {
      finalSplits = splits.map((s) => ({
        user: s.user,
        amount: parseFloat(((s.percentage / 100) * amount).toFixed(2)),
        paid: s.user === req.user.id,
      }));
    }

    const expense = await Expense.create({
      description,
      amount,
      paidBy: req.user.id,
      group: groupId,
      splits: finalSplits,
      splitType: splitType || "equal",
      category: category || "other",
    });

    const populated = await Expense.findById(expense._id)
      .populate("paidBy", "name email")
      .populate("splits.user", "name email upiId");

    io.to(groupId).emit('expense_added', populated);

    // Log activity
    await ActivityLog.create({
      group: groupId,
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
    res.status(500).json({ message: error.message });
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
    const monthsPerPage = Math.max(1, parseInt(req.query.months) || 3);
    const page         = Math.max(1, parseInt(req.query.page)   || 1);

    // Fetch ALL expenses sorted newest first (we do month grouping in JS)
    const allExpenses = await Expense.find({ group: req.params.groupId })
      .populate("paidBy", "name email")
      .populate("splits.user", "name email upiId")
      .sort({ createdAt: -1 });

    // ── Build an ordered list of unique "YYYY-MM" month keys ─────────────────
    const monthKeyOf = (date) => {
      const d = new Date(date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };

    // Ordered unique months (newest first)
    const allMonthKeys = [];
    const seen = new Set();
    for (const exp of allExpenses) {
      const key = monthKeyOf(exp.createdAt);
      if (!seen.has(key)) {
        seen.add(key);
        allMonthKeys.push(key);
      }
    }

    const totalMonths   = allMonthKeys.length;
    const startIdx      = (page - 1) * monthsPerPage;   // inclusive
    const endIdx        = startIdx + monthsPerPage;      // exclusive
    const visibleMonths = new Set(allMonthKeys.slice(startIdx, endIdx));
    const loadedMonths  = Math.min(endIdx, totalMonths);
    const hasMore       = endIdx < totalMonths;

    // ── Filter expenses to only the visible months ────────────────────────────
    const expenses = allExpenses.filter((exp) =>
      visibleMonths.has(monthKeyOf(exp.createdAt))
    );

    res.json({ expenses, totalMonths, loadedMonths, hasMore });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
  }
});

export default router;
