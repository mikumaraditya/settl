import express from 'express';
import Group from '../models/Group.js';
import User from '../models/User.js';
import Expense from '../models/Expense.js';
import Settlement from '../models/Settlement.js';
import ActivityLog from '../models/ActivityLog.js';
import protect from '../middleware/auth.js';
import simplifyDebts from '../utils/debtSimplify.js';

const router = express.Router();

// CREATE GROUP
router.post("/", protect, async (req, res) => {
  const { name, description } = req.body;

  try {
    const group = await Group.create({
      name,
      description,
      createdBy: req.user.id,
      members: [{ user: req.user.id, role: "admin" }],
    });

    res.status(201).json(group);

    // Log activity (non-blocking)
    ActivityLog.create({
      group: group._id,
      actor: req.user.id,
      type: 'group_created',
      meta: { groupName: group.name },
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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

    const rawTxns = simplifyDebts(expenses, settlements);

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
    res.status(500).json({ message: error.message });
  }
});

// DELETE GROUP (only when all member balances are fully cleared)
router.delete("/:id", protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (group.createdBy.toString() !== req.user.id) {
      return res
        .status(401)
        .json({ message: "Only the group creator can delete it" });
    }

    // ── Balance check ────────────────────────────────────────────────────────
    // Block deletion if any member still has a pending balance.
    const [expenses, settlements] = await Promise.all([
      Expense.find({ group: req.params.id })
        .populate("paidBy", "name")
        .populate("splits.user", "name"),
      Settlement.find({ group: req.params.id }),
    ]);

    const pendingTxns = simplifyDebts(expenses, settlements);

    if (pendingTxns.length > 0) {
      return res.status(400).json({
        message:
          "All balances must be settled before the group can be deleted. Please clear all pending dues first.",
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    await group.deleteOne();
    res.json({ message: "Group deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
