import express from 'express';
import mongoose from 'mongoose';
import Group from '../models/Group.js';
import User from '../models/User.js';
import Expense from '../models/Expense.js';
import Settlement from '../models/Settlement.js';
import ActivityLog from '../models/ActivityLog.js';
import Message from '../models/Message.js';
import SettlementSchedule from '../models/SettlementSchedule.js';
import protect from '../middleware/auth.js';
import requireVerified from '../middleware/requireVerified.js';
import simplifyDebts from '../utils/debtSimplify.js';

const router = express.Router();

router.use(protect, requireVerified);

// CREATE GROUP
router.post("/", async (req, res) => {
  const rawName = req.body?.name;
  const rawDescription = req.body?.description;

  try {
    const name = typeof rawName === "string" ? rawName.trim() : "";
    const description = typeof rawDescription === "string" ? rawDescription.trim() : "";

    if (!name) {
      return res.status(400).json({ message: "Group name is required" });
    }
    if (name.length > 80) {
      return res.status(400).json({ message: "Group name cannot exceed 80 characters" });
    }
    if (description.length > 280) {
      return res.status(400).json({ message: "Group description cannot exceed 280 characters" });
    }

    const group = await Group.create({
      name,
      description,
      createdBy: req.user.id,
      members: [{ user: req.user.id, role: "admin" }],
    });

    ActivityLog.create({
      group: group._id,
      actor: req.user.id,
      type: "group_created",
      meta: { groupName: group.name },
    }).catch(error => console.error("Could not record group-created activity:", error));

    return res.status(201).json(group);
  } catch (error) {
    console.error("Error creating group:", error);
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ message: "Please check the group details and try again" });
    }
    return res.status(500).json({ message: "We could not create this group. Please try again." });
  }
});

// GET ALL GROUPS FOR LOGGED IN USER
router.get("/", protect, async (req, res) => {
  try {
    const groups = await Group.find({
      "members.user": req.user.id,
    }).populate("members.user", "name email upiId");

    res.json(groups);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET SINGLE GROUP
router.get("/:id", protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id).populate(
      "members.user",
      "name email upiId",
    );

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const isMember = group.members.some(
      (member) => member.user?._id?.toString() === req.user.id,
    );
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    res.json(group);
  } catch (error) {
    console.error("Error fetching single group:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ADD MEMBER TO GROUP (admin only)
router.post("/:id/members", protect, async (req, res) => {
  const { email } = req.body;

  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Only admins can add members
    const requester = group.members.find(
      (m) => m.user.toString() === req.user.id,
    );
    if (!requester || requester.role !== "admin") {
      return res.status(403).json({ message: "Only admins can add members" });
    }

    // find user by email
    const userToAdd = await User.findOne({ email });
    if (!userToAdd) {
      return res.status(404).json({ message: "No user found with that email" });
    }

    // check if already a member
    const alreadyMember = group.members.find(
      (m) => m.user.toString() === userToAdd._id.toString(),
    );
    if (alreadyMember) {
      return res.status(400).json({ message: "User already in group" });
    }

    group.members.push({ user: userToAdd._id, role: "member" });
    await group.save();

    const updated = await Group.findById(req.params.id).populate(
      "members.user",
      "name email upiId",
    );

    res.json(updated);

    // Log activity (non-blocking)
    ActivityLog.create({
      group: req.params.id,
      actor: req.user.id,
      type: 'member_added',
      meta: { memberName: userToAdd.name, memberEmail: userToAdd.email },
    }).catch(() => {});
  } catch (error) {
    console.error("Error adding member to group:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// REMOVE MEMBER FROM GROUP
// - Admin can remove any other member (not the sole admin)
// - Any member can remove themselves (leave group)
// - In both cases, the target member must have zero pending balance
router.delete("/:id/members/:userId", protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const requester = group.members.find(
      (m) => m.user.toString() === req.user.id,
    );
    if (!requester) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const targetId = req.params.userId;
    const isSelf = req.user.id === targetId;

    // Permission check:
    // - A member can only remove themselves
    // - An admin can remove anyone (except the sole admin restriction below)
    if (!isSelf && requester.role !== "admin") {
      return res.status(403).json({ message: "Only admins can remove other members" });
    }

    // Make sure the target is actually in the group
    const targetMember = group.members.find(
      (m) => m.user.toString() === targetId,
    );
    if (!targetMember) {
      return res.status(404).json({ message: "Member not found in group" });
    }

    // Cannot remove the only admin (applies to both self-leave and admin removal)
    const admins = group.members.filter((m) => m.role === "admin");
    const targetIsAdmin = targetMember.role === "admin";
    if (targetIsAdmin && admins.length === 1) {
      return res.status(400).json({
        message: isSelf
          ? "You are the only admin. Please assign another admin before leaving."
          : "Cannot remove the only admin",
      });
    }

    // ── Balance check ────────────────────────────────────────────────────────
    // Run the same settlement algorithm used by the simplify endpoint so we
    // know whether this member still has a pending debt or credit.
    const [expenses, settlements] = await Promise.all([
      Expense.find({ group: req.params.id })
        .populate("paidBy", "name")
        .populate("splits.user", "name"),
      Settlement.find({ group: req.params.id }),
    ]);

    const confirmedSettlements = settlements.filter(s => !s.status || s.status === 'confirmed');
    const rawTxns = simplifyDebts(expenses, confirmedSettlements);

    const hasPendingBalance = rawTxns.some(
      (t) => t.from === targetId || t.to === targetId,
    );

    if (hasPendingBalance) {
      return res.status(400).json({
        message: isSelf
          ? "You still have a pending balance in this group. Please settle all dues before leaving."
          : "This member still has a pending balance. Please settle all dues before removing them.",
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    group.members = group.members.filter(
      (m) => m.user.toString() !== targetId,
    );
    await group.save();

    // If the member left themselves, no need to return the updated group (they're no longer in it)
    if (isSelf) {
      // Log leave
      ActivityLog.create({
        group: req.params.id,
        actor: req.user.id,
        type: 'member_left',
        meta: {},
      }).catch(() => {});
      return res.json({ message: 'You have left the group' });
    }

    const updated = await Group.findById(req.params.id).populate(
      "members.user",
      "name email upiId",
    );

    res.json(updated);

    // Log removal (non-blocking)
    ActivityLog.create({
      group: req.params.id,
      actor: req.user.id,
      type: 'member_removed',
      meta: { removedId: targetId },
    }).catch(() => {});
  } catch (error) {
    console.error("Error removing member from group:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE GROUP (only when all balances and pending payment activity are clear)
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid group id" });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (group.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the group creator can delete it" });
    }

    // A previous deletion attempt may have completed part of the cleanup.
    // Keep the group locked and let its creator safely retry the idempotent cleanup.
    if (!group.isDeleting) {
      const [expenses, settlements, activeSchedule, pendingSettlement] = await Promise.all([
        Expense.find({ group: group._id })
          .populate("paidBy", "name")
          .populate("splits.user", "name"),
        Settlement.find({ group: group._id }),
        SettlementSchedule.exists({ group: group._id, active: true }),
        Settlement.exists({ group: group._id, status: "pending" }),
      ]);

      const confirmedSettlements = settlements.filter(
        settlement => !settlement.status || settlement.status === "confirmed",
      );
      const pendingTransactions = simplifyDebts(expenses, confirmedSettlements);

      if (pendingTransactions.length > 0) {
        return res.status(409).json({
          message: "This group still has unpaid balances. Settle all dues before deleting it.",
        });
      }
      if (pendingSettlement) {
        return res.status(409).json({
          message: "A payment is still awaiting confirmation. Finish or cancel it before deleting this group.",
        });
      }
      if (activeSchedule) {
        return res.status(409).json({
          message: "This group has an active payment schedule. Complete or cancel it before deleting the group.",
        });
      }

      // Acquire the deletion lock only when no expense create/delete operation
      // is in flight. New expense writes reserve activeMutations atomically.
      const lock = await Group.findOneAndUpdate(
        {
          _id: group._id,
          createdBy: req.user.id,
          isDeleting: { $ne: true },
          $or: [
            { activeMutations: 0 },
            { activeMutations: { $exists: false } },
            {
              activeMutations: { $gt: 0 },
              mutationExpiresAt: { $type: "date", $lte: new Date() },
            },
          ],
        },
        { $set: { isDeleting: true, mutationExpiresAt: null } },
        { new: true },
      );

      if (!lock) {
        return res.status(409).json({
          message: "This group is being updated right now. Please wait a moment and try deleting it again.",
        });
      }
    }

    // Each operation is idempotent. If a step fails, the group remains locked
    // so the creator can retry and finish cleanup without accepting new expenses.
    await Promise.all([
      Expense.deleteMany({ group: group._id }),
      Settlement.deleteMany({ group: group._id }),
      SettlementSchedule.deleteMany({ group: group._id }),
      ActivityLog.deleteMany({ group: group._id }),
      Message.deleteMany({ group: group._id }),
    ]);

    const deleted = await Group.deleteOne({
      _id: group._id,
      createdBy: req.user.id,
      isDeleting: true,
    });

    if (deleted.deletedCount !== 1) {
      return res.status(409).json({
        message: "The group changed while it was being deleted. Refresh and try again.",
      });
    }

    return res.json({ message: "Group deleted" });
  } catch (error) {
    console.error("Error deleting group:", error);
    return res.status(500).json({
      message: "We could not finish deleting this group. Your group is locked against new expenses; retry the deletion to finish cleanup.",
    });
  }
});

export default router;
