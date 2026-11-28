import express from 'express';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { createRateLimitStore } from '../config/rateLimitStore.js';
import Expense from '../models/Expense.js';
import Group from '../models/Group.js';
import Settlement from '../models/Settlement.js';
import SettlementSchedule from '../models/SettlementSchedule.js';
import ActivityLog from '../models/ActivityLog.js';
import protect from '../middleware/auth.js';
import requireVerified from '../middleware/requireVerified.js';
import { getIO } from '../socket.js';
import { clearInsightCaches } from './insights.js';
import { reserveGroupMutation, releaseGroupMutation } from '../utils/groupMutation.js';

const router = express.Router();

router.use(protect, requireVerified);


const allowedExpenseCategories = new Set([
  "food", "travel", "shopping", "rent", "entertainment",
  "fuel", "groceries", "medical", "other",
]);

const normalizeExpenseInput = (body = {}, group, userId) => {
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) return { ok: false, status: 400, message: "Expense description is required" };
  if (description.length > 120) return { ok: false, status: 400, message: "Expense description cannot exceed 120 characters" };

  const amount = Number(body.amount);
  const totalPaise = Math.round(amount * 100);
  if (
    !Number.isFinite(amount) ||
    !Number.isSafeInteger(totalPaise) ||
    totalPaise <= 0 ||
    Math.abs(amount * 100 - totalPaise) > 0.000001
  ) {
    return { ok: false, status: 400, message: "Amount must be a positive value with at most two decimal places" };
  }

  const splitType = body.splitType || "equal";
  if (!["equal", "exact", "percentage"].includes(splitType)) {
    return { ok: false, status: 400, message: "Invalid split type" };
  }

  const category = body.category || "other";
  if (!allowedExpenseCategories.has(category)) {
    return { ok: false, status: 400, message: "Please select a valid expense category" };
  }

  const paidBy = body.paidBy || userId;
  if (!mongoose.isValidObjectId(paidBy) || paidBy.toString() !== userId) {
    return { ok: false, status: 403, message: "You can only record expenses that you paid" };
  }

  const memberIds = new Set(group.members.map((member) => member.user.toString()));
  const rawMembers = body.members === undefined
    ? group.members.map((member) => member.user.toString())
    : body.members;
  if (!Array.isArray(rawMembers) || rawMembers.length === 0) {
    return { ok: false, status: 400, message: "Select at least one group member to split this expense" };
  }

  const selectedIds = rawMembers.map((memberId) => memberId?.toString());
  if (
    selectedIds.some((memberId) => !mongoose.isValidObjectId(memberId) || !memberIds.has(memberId)) ||
    new Set(selectedIds).size !== selectedIds.length
  ) {
    return { ok: false, status: 400, message: "Split members must be unique members of this group" };
  }

  const splitListMatchesSelection = (candidateSplits) => {
    const ids = candidateSplits.map((split) => split.user?.toString());
    return (
      ids.length === selectedIds.length &&
      new Set(ids).size === ids.length &&
      ids.every((memberId) => selectedIds.includes(memberId))
    );
  };

  let finalSplits;
  if (splitType === "equal") {
    const baseShare = Math.floor(totalPaise / selectedIds.length);
    const remainder = totalPaise % selectedIds.length;
    finalSplits = selectedIds.map((memberId, index) => ({
      user: memberId,
      amount: (baseShare + (index === 0 ? remainder : 0)) / 100,
      paid: memberId === paidBy.toString(),
    }));
  } else {
    const splits = body.splits;
    if (!Array.isArray(splits) || splits.length === 0) {
      return { ok: false, status: 400, message: "Add the split amounts before saving this expense" };
    }
    if (splits.some((split) => !split || typeof split !== "object")) {
      return { ok: false, status: 400, message: "Each split must include a group member and a value" };
    }

    if (splitType === "exact") {
      const candidates = splits.map((split) => {
        const value = Number(split.amount);
        const paise = Math.round(value * 100);
        return {
          user: split.user,
          amount: paise / 100,
          paise,
          paid: split.user?.toString() === paidBy.toString(),
          validAmount: Number.isFinite(value) &&
            Number.isSafeInteger(paise) &&
            paise > 0 &&
            Math.abs(value * 100 - paise) <= 0.000001,
        };
      });
      if (candidates.some((split) => !split.validAmount)) {
        return { ok: false, status: 400, message: "Each exact split must be a positive amount with at most two decimal places" };
      }
      if (candidates.reduce((sum, split) => sum + split.paise, 0) !== totalPaise) {
        return { ok: false, status: 400, message: "Exact split amounts must add up to the expense total" };
      }
      if (!splitListMatchesSelection(candidates)) {
        return { ok: false, status: 400, message: "Each selected group member must have exactly one split amount" };
      }
      finalSplits = candidates.map(({ user, amount, paid }) => ({ user, amount, paid }));
    } else {
      const percentages = splits.map((split) => Number(split.percentage));
      if (
        percentages.some((value) => !Number.isFinite(value) || value <= 0 || value > 100) ||
        Math.abs(percentages.reduce((sum, value) => sum + value, 0) - 100) > 0.000001
      ) {
        return { ok: false, status: 400, message: "Split percentages must be positive and add up to 100" };
      }
      if (!splitListMatchesSelection(splits)) {
        return { ok: false, status: 400, message: "Each selected group member must have exactly one split percentage" };
      }

      const allocations = splits.map((split, index) => {
        const exactPaise = (percentages[index] / 100) * totalPaise;
        const basePaise = Math.floor(exactPaise);
        return {
          user: split.user,
          percentage: percentages[index],
          paid: split.user?.toString() === paidBy.toString(),
          paise: basePaise,
          remainder: exactPaise - basePaise,
        };
      });
      let unallocatedPaise = totalPaise - allocations.reduce((sum, item) => sum + item.paise, 0);
      const remainderOrder = allocations
        .map((item, index) => ({ index, remainder: item.remainder }))
        .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
      for (let index = 0; index < unallocatedPaise; index += 1) {
        allocations[remainderOrder[index].index].paise += 1;
      }
      if (allocations.some((item) => item.paise <= 0)) {
        return { ok: false, status: 400, message: "Each selected member must receive at least ₹0.01 in a percentage split" };
      }
      finalSplits = allocations.map((item) => ({
        user: item.user,
        amount: item.paise / 100,
        percentage: item.percentage,
        paid: item.paid,
      }));
    }
  }

  return {
    ok: true,
    value: {
      description,
      amount: totalPaise / 100,
      totalPaise,
      paidBy: paidBy.toString(),
      splits: finalSplits,
      splitType,
      category,
    },
  };
};

const hasProtectedFinancialHistory = async (expense) => {
  const legacySourceGuard = () => ({
    sourceExpenseIds: { $exists: false },
    $or: [
      { createdAt: { $gte: expense.createdAt } },
      { createdAt: { $exists: false } },
    ],
  });
  const [hasSettlement, hasActiveSchedule] = await Promise.all([
    Settlement.exists({
      group: expense.group,
      $and: [
        {
          $or: [
            { status: { $in: ["pending", "confirmed"] } },
            { status: { $exists: false } },
          ],
        },
        {
          $or: [
            { sourceExpenseIds: expense._id },
            legacySourceGuard(),
          ],
        },
      ],
    }),
    SettlementSchedule.exists({
      group: expense.group,
      active: true,
      $or: [
        { sourceExpenseIds: expense._id },
        legacySourceGuard(),
      ],
    }),
  ]);
  return Boolean(hasSettlement || hasActiveSchedule);
};

const expenseCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.user.id,
  store: createRateLimitStore("expenses-create"),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many expenses created. Please try again in 15 minutes." },
});

// ─────────────────────────────────────────────────────────────────────────────
// ADD EXPENSE
router.post("/", expenseCreateLimiter, async (req, res) => {
  const body = req.body || {};
  const targetGroupId = body.groupId || body.group;
  let reservedGroupId = null;
  let reservedMutationToken = null;

  try {
    const rawIdempotencyKey = req.get("Idempotency-Key");
    const idempotencyKey = typeof rawIdempotencyKey === "string"
      ? rawIdempotencyKey.trim()
      : null;
    if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({ message: "Invalid expense idempotency key" });
    }

    if (!mongoose.isValidObjectId(targetGroupId)) {
      return res.status(400).json({ message: "A valid group is required" });
    }

    const reservation = await reserveGroupMutation(targetGroupId, req.user.id);
    if (!reservation) {
      const existingGroup = await Group.findById(targetGroupId).select(
        "isDeleting membershipMutation financialMutationId members.user",
      );
      if (!existingGroup) {
        return res.status(404).json({ message: "Group not found" });
      }
      if (existingGroup.isDeleting) {
        return res.status(409).json({ message: "This group is being deleted and can no longer accept expenses" });
      }
      if (existingGroup.membershipMutation || existingGroup.financialMutationId) {
        return res.status(409).json({ message: "This group is being updated. Please try again in a moment." });
      }
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const { group } = reservation;
    reservedGroupId = group._id;
    reservedMutationToken = reservation.token;

    const normalized = normalizeExpenseInput(body, group, req.user.id);
    if (!normalized.ok) {
      return res.status(normalized.status).json({ message: normalized.message });
    }
    const {
      description,
      totalPaise,
      paidBy,
      splits: finalSplits,
      splitType,
      category,
    } = normalized.value;

    const idempotencyHash = idempotencyKey
      ? createHash("sha256").update(JSON.stringify({
        groupId: targetGroupId.toString(),
        createdBy: req.user.id,
        description,
        amountPaise: totalPaise,
        paidBy: paidBy.toString(),
        splitType,
        category,
        splits: finalSplits
          .map(split => ({
            user: split.user.toString(),
            amountPaise: Math.round(split.amount * 100),
          }))
          .sort((a, b) => a.user.localeCompare(b.user)),
      })).digest("hex")
      : null;

    // A retry with the same key and same normalized payload returns the
    // original expense. Reusing a key for a different payload is a conflict.
    if (idempotencyKey) {
      const existingExpense = await Expense.findOne({
        createdBy: req.user.id,
        idempotencyKey,
      }).select("_id idempotencyHash");

      if (existingExpense) {
        if (existingExpense.idempotencyHash !== idempotencyHash) {
          return res.status(409).json({
            code: "IDEMPOTENCY_KEY_REUSED",
            message: "This expense request key was already used for different details. Start a new expense request.",
          });
        }

        const replayedExpense = await Expense.findById(existingExpense._id)
          .populate("paidBy", "name email")
          .populate("splits.user", "name email upiId");
        return res.status(200).json(replayedExpense || existingExpense);
      }
    }

    let expense;
    try {
      expense = await Expense.create({
        description,
        amount: totalPaise / 100,
        paidBy,
        group: targetGroupId,
        splits: finalSplits,
        splitType,
        category,
        ...(idempotencyKey ? {
          createdBy: req.user.id,
          idempotencyKey,
          idempotencyHash,
        } : {}),
      });
    } catch (createError) {
      // The unique index closes the race when identical keys arrive through
      // different group requests at the same time.
      if (!idempotencyKey || createError.code !== 11000) throw createError;

      const existingExpense = await Expense.findOne({
        createdBy: req.user.id,
        idempotencyKey,
      });
      if (!existingExpense) throw createError;
      if (existingExpense.idempotencyHash !== idempotencyHash) {
        return res.status(409).json({
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "This expense request key was already used for different details. Start a new expense request.",
        });
      }

      const replayedExpense = await Expense.findById(existingExpense._id)
        .populate("paidBy", "name email")
        .populate("splits.user", "name email upiId");
      return res.status(200).json(replayedExpense || existingExpense);
    }

    let responseExpense = expense;
    try {
      responseExpense = await Expense.findById(expense._id)
        .populate("paidBy", "name email")
        .populate("splits.user", "name email upiId") || expense;
    } catch (populateError) {
      console.error("Expense was saved but could not be populated:", populateError);
    }

    // Activity history is best-effort: a log outage must not make a successful
    // expense creation look failed and cause the client to submit it twice.
    ActivityLog.create({
      group: targetGroupId,
      actor: req.user.id,
      type: "expense_added",
      meta: {
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        splitType: expense.splitType,
      },
    }).catch(error => console.error("Could not record expense-added activity:", error));

    try {
      getIO()?.to(targetGroupId.toString()).emit("expense_added", responseExpense);
    } catch (socketError) {
      console.warn("Expense notification could not be delivered:", socketError);
    }

    try {
      clearInsightCaches([paidBy, ...finalSplits.map(split => split.user)]);
    } catch (cacheError) {
      console.warn("Expense insight cache could not be cleared:", cacheError);
    }

    await releaseGroupMutation(reservedGroupId, reservedMutationToken);
    reservedGroupId = null;
    reservedMutationToken = null;
    return res.status(201).json(responseExpense);
  } catch (error) {
    console.error("Error creating expense:", error);
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ message: "Please check the expense details and try again" });
    }
    return res.status(500).json({ message: "We could not save this expense. Please try again." });
  } finally {
    if (reservedGroupId) {
      try {
        await releaseGroupMutation(reservedGroupId, reservedMutationToken);
      } catch (releaseError) {
        console.error("Could not release the group expense-create guard:", releaseError);
      }
    }
  }
});

// Member acknowledgement for their own share of an upfront group expense.
router.patch("/:expenseId/splits/:splitUserId/acknowledge", async (req, res) => {
  try {
    const { expenseId, splitUserId } = req.params;
    if (!mongoose.isValidObjectId(expenseId) || !mongoose.isValidObjectId(splitUserId)) {
      return res.status(400).json({ message: "Invalid expense or member id" });
    }
    if (splitUserId !== req.user.id) {
      return res.status(403).json({ message: "You can only acknowledge your own expense share" });
    }
    const expense = await Expense.findById(expenseId);
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    if (expense.paidBy?.toString() === req.user.id) {
      return res.status(400).json({ message: "The upfront payer cannot acknowledge their own paid share" });
    }
    const group = await Group.findById(expense.group);
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (!group.members.some(member => member.user?.toString() === req.user.id)) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }
    const split = expense.splits.find(item => item.user?.toString() === req.user.id);
    if (!split) return res.status(404).json({ message: "Your share is not part of this expense" });
    if (!split.acknowledged) {
      split.acknowledged = true;
      split.acknowledgedAt = new Date();
      await expense.save();
    }
    clearInsightCaches([expense.paidBy, ...expense.splits.map(item => item.user)]);
    const updated = await Expense.findById(expenseId)
      .populate("paidBy", "name email")
      .populate("splits.user", "name email upiId");
    return res.json(updated);
  } catch (error) {
    console.error("Error acknowledging expense share:", error);
    return res.status(500).json({ message: "Unable to acknowledge this expense share." });
  }
});

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

    // Record-based pagination is used by compact cross-group views (such as
    // the dashboard). Keep the existing month-based pagination unchanged for
    // the full group expense history.
    if (req.query.limit !== undefined) {
      const limit = Number(req.query.limit);
      const skip = req.query.skip === undefined ? 0 : Number(req.query.skip);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({ message: "Expense page limit must be between 1 and 100" });
      }
      if (!Number.isSafeInteger(skip) || skip < 0) {
        return res.status(400).json({ message: "Expense page offset must be a non-negative integer" });
      }

      const [expenses, total] = await Promise.all([
        Expense.find({ group: group._id })
          .populate("paidBy", "name email")
          .populate("splits.user", "name email upiId")
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit),
        Expense.countDocuments({ group: group._id }),
      ]);

      return res.json({ expenses, total, hasMore: skip + expenses.length < total });
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


/* ─────────────────────────────────────────────────────────────────────────────
 * UPDATE EXPENSE
 * Only the original payer can edit within the same two-hour correction window
 * as deletion. Expenses used by pending/confirmed settlements or active
 * schedules are immutable so historical payment calculations cannot drift.
 */
router.put("/:id", async (req, res) => {
  let reservedGroupId = null;
  let reservedMutationToken = null;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid expense id" });
    }

    let expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }
    if (expense.paidBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the person who paid can edit this expense" });
    }

    const reservation = await reserveGroupMutation(expense.group, req.user.id);
    if (!reservation) {
      const existingGroup = await Group.findById(expense.group).select(
        "isDeleting membershipMutation financialMutationId members.user",
      );
      if (!existingGroup) {
        return res.status(409).json({ message: "This expense belongs to a group that no longer exists" });
      }
      if (existingGroup.isDeleting) {
        return res.status(409).json({ message: "This group is being deleted. Refresh the page to see the latest state." });
      }
      if (existingGroup.membershipMutation || existingGroup.financialMutationId) {
        return res.status(409).json({ message: "This group is being updated. Please try again in a moment." });
      }
      return res.status(403).json({ message: "You must be a current group member to edit this expense" });
    }

    const { group } = reservation;
    reservedGroupId = group._id;
    reservedMutationToken = reservation.token;

    // Re-read after acquiring the group lock so a concurrent mutation cannot
    // leave this request editing a stale snapshot.
    expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }
    if (expense.paidBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the person who paid can edit this expense" });
    }

    const now = Date.now();
    const createdAt = new Date(expense.createdAt).getTime();
    const twoHoursMs = 2 * 60 * 60 * 1000;
    if (!Number.isFinite(createdAt) || createdAt > now || now - createdAt > twoHoursMs) {
      return res.status(403).json({
        message: "Expenses can only be edited within 2 hours of being added. This window has expired.",
      });
    }

    if (await hasProtectedFinancialHistory(expense)) {
      return res.status(409).json({
        message: "This expense is part of a pending or confirmed payment, or an active payment schedule's financial history. To protect the payment history, it cannot be edited. Add a correcting expense instead.",
      });
    }

    const normalized = normalizeExpenseInput(req.body || {}, group, req.user.id);
    if (!normalized.ok) {
      return res.status(normalized.status).json({ message: normalized.message });
    }

    const before = {
      description: expense.description,
      amount: expense.amount,
      category: expense.category,
      splitType: expense.splitType,
      splits: expense.splits.map((split) => ({
        user: split.user.toString(),
        amount: split.amount,
        percentage: split.percentage,
      })),
    };
    const nextFields = {
      description: normalized.value.description,
      amount: normalized.value.amount,
      category: normalized.value.category,
      splitType: normalized.value.splitType,
      splits: normalized.value.splits,
    };

    const updatedExpense = await Expense.findOneAndUpdate(
      {
        _id: expense._id,
        paidBy: req.user.id,
        createdAt: expense.createdAt,
        updatedAt: expense.updatedAt,
      },
      { $set: nextFields },
      { new: true, runValidators: true },
    )
      .populate("paidBy", "name email")
      .populate("splits.user", "name email upiId");

    if (!updatedExpense) {
      return res.status(409).json({
        message: "This expense has already been changed. Refresh the group and try again.",
      });
    }

    const after = {
      description: updatedExpense.description,
      amount: updatedExpense.amount,
      category: updatedExpense.category,
      splitType: updatedExpense.splitType,
      splits: updatedExpense.splits.map((split) => ({
        user: split.user?._id?.toString?.() || split.user?.toString?.(),
        amount: split.amount,
        percentage: split.percentage,
      })),
    };
    ActivityLog.create({
      group: updatedExpense.group,
      actor: req.user.id,
      type: "expense_updated",
      meta: { expenseId: updatedExpense._id, before, after },
    }).catch((error) => console.error("Could not record expense-updated activity:", error));

    try {
      getIO()?.to(updatedExpense.group.toString()).emit("expense_updated", updatedExpense);
    } catch (socketError) {
      console.warn("Expense update notification could not be delivered:", socketError);
    }

    try {
      clearInsightCaches([
        updatedExpense.paidBy?._id || updatedExpense.paidBy,
        ...expense.splits.map((split) => split.user),
        ...updatedExpense.splits.map((split) => split.user?._id || split.user),
      ]);
    } catch (cacheError) {
      console.warn("Expense update cache could not be cleared:", cacheError);
    }

    await releaseGroupMutation(reservedGroupId, reservedMutationToken);
    reservedGroupId = null;
    reservedMutationToken = null;
    return res.json(updatedExpense);
  } catch (error) {
    console.error("Error updating expense:", error);
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ message: "Please check the expense details and try again" });
    }
    return res.status(500).json({ message: "We could not update this expense. Please try again." });
  } finally {
    if (reservedGroupId) {
      try {
        await releaseGroupMutation(reservedGroupId, reservedMutationToken);
      } catch (releaseError) {
        console.error("Could not release the group expense-edit guard:", releaseError);
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE EXPENSE
// Only the payer can delete, and only within 2 hours of creation.
// Once a payment is pending/confirmed or an active schedule exists, preserve
// the expense as part of the group's financial history.
router.delete("/:id", async (req, res) => {
  let reservedGroupId = null;
  let reservedMutationToken = null;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid expense id" });
    }

    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    if (expense.paidBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the person who paid can delete this expense" });
    }

    const reservation = await reserveGroupMutation(expense.group, req.user.id);
    if (!reservation) {
      const existingGroup = await Group.findById(expense.group).select(
        "isDeleting membershipMutation financialMutationId members.user",
      );
      if (!existingGroup) {
        return res.status(409).json({ message: "This expense belongs to a group that no longer exists" });
      }
      if (existingGroup.isDeleting) {
        return res.status(409).json({ message: "This group is being deleted. Refresh the page to see the latest state." });
      }
      if (existingGroup.membershipMutation || existingGroup.financialMutationId) {
        return res.status(409).json({ message: "This group is being updated. Please try again in a moment." });
      }
      return res.status(403).json({ message: "You must be a current group member to delete this expense" });
    }
    const { group } = reservation;
    reservedGroupId = group._id;
    reservedMutationToken = reservation.token;

    const now = Date.now();
    const createdAt = new Date(expense.createdAt).getTime();
    const twoHoursMs = 2 * 60 * 60 * 1000;
    if (!Number.isFinite(createdAt) || createdAt > now || now - createdAt > twoHoursMs) {
      return res.status(403).json({
        message: "Expenses can only be deleted within 2 hours of being added. This window has expired.",
      });
    }

    const hasProtectedHistory = await hasProtectedFinancialHistory(expense);

    if (hasProtectedHistory) {
      return res.status(409).json({
        message: "This expense is part of a pending or confirmed payment, or an active payment schedule's financial history. To protect the payment history, it cannot be deleted. Add a correcting expense instead.",
      });
    }

    // Delete conditionally so two simultaneous delete requests cannot both
    // report success or create duplicate activity entries.
    const deletedExpense = await Expense.findOneAndDelete({
      _id: expense._id,
      paidBy: req.user.id,
      createdAt: { $gte: new Date(now - twoHoursMs), $lte: new Date(now) },
    });

    if (!deletedExpense) {
      return res.status(409).json({ message: "This expense has already been changed or deleted. Refresh the group and try again." });
    }

    ActivityLog.create({
      group: deletedExpense.group,
      actor: req.user.id,
      type: "expense_deleted",
      meta: {
        description: deletedExpense.description,
        amount: deletedExpense.amount,
      },
    }).catch(error => console.error("Could not record expense-deleted activity:", error));

    try {
      getIO()?.to(deletedExpense.group.toString()).emit("expense_deleted", { expenseId: deletedExpense._id.toString() });
    } catch (socketError) {
      console.warn("Expense deletion notification could not be delivered:", socketError);
    }

    try {
      clearInsightCaches([deletedExpense.paidBy, ...deletedExpense.splits.map(split => split.user)]);
    } catch (cacheError) {
      console.warn("Expense deletion cache could not be cleared:", cacheError);
    }

    await releaseGroupMutation(reservedGroupId, reservedMutationToken);
    reservedGroupId = null;
    reservedMutationToken = null;
    return res.json({ message: "Expense deleted", expenseId: deletedExpense._id });
  } catch (error) {
    console.error("Error deleting expense:", error);
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid expense id" });
    }
    return res.status(500).json({ message: "We could not delete this expense. Please try again." });
  } finally {
    if (reservedGroupId) {
      try {
        await releaseGroupMutation(reservedGroupId, reservedMutationToken);
      } catch (releaseError) {
        console.error("Could not release the group expense-delete guard:", releaseError);
      }
    }
  }
});

export default router;
