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

const acquireMembershipMutation = async (groupId) => Group.findOneAndUpdate(
  {
    _id: groupId,
    isDeleting: { $ne: true },
    $and: [
      {
        $or: [
          { membershipMutation: { $ne: true } },
          {
            membershipMutation: true,
            membershipMutationExpiresAt: { $type: "date", $lte: new Date() },
          },
        ],
      },
      {
        $or: [
          { activeMutations: 0 },
          { activeMutations: { $exists: false } },
          {
            activeMutations: { $gt: 0 },
            mutationExpiresAt: { $type: "date", $lte: new Date() },
          },
        ],
      },
    ],
  },
  {
    $set: {
      membershipMutation: true,
      membershipMutationExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      activeMutations: 0,
      mutationExpiresAt: null,
    },
  },
  { new: true },
);

const releaseMembershipMutation = async (groupId, leaseExpiresAt) => {
  if (!groupId || !leaseExpiresAt) return;
  await Group.updateOne(
    {
      _id: groupId,
      membershipMutation: true,
      membershipMutationExpiresAt: leaseExpiresAt,
    },
    { $set: { membershipMutation: false, membershipMutationExpiresAt: null } },
  );
};

const membershipMutationConflict = async (groupId) => {
  const current = await Group.findById(groupId).select("isDeleting membershipMutation activeMutations mutationExpiresAt");
  if (!current) {
    return { status: 404, message: "Group not found" };
  }
  if (current.isDeleting) {
    return { status: 409, message: "This group is being deleted and cannot be changed" };
  }
  return {
    status: 409,
    message: "This group is being updated. Please wait a moment and try again.",
  };
};

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
router.post("/:id/members", async (req, res) => {
  let reservedGroupId = null;
  let reservedMembershipLease = null;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid group id" });
    }

    const rawEmail = req.body?.email;
    if (typeof rawEmail !== "string") {
      return res.status(400).json({ message: "Enter the email address of the person to add" });
    }
    const email = rawEmail.trim().toLowerCase();
    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    const group = await acquireMembershipMutation(req.params.id);
    if (!group) {
      const conflict = await membershipMutationConflict(req.params.id);
      return res.status(conflict.status).json({ message: conflict.message });
    }
    reservedGroupId = group._id;
    reservedMembershipLease = group.membershipMutationExpiresAt;

    const requester = group.members.find(member => member.user.toString() === req.user.id);
    if (!requester || requester.role !== "admin") {
      return res.status(403).json({ message: "Only group admins can add members" });
    }

    const userToAdd = await User.findOne({ email });
    if (!userToAdd) {
      return res.status(404).json({ message: "No Settl account was found with that email. Ask them to register first." });
    }

    if (group.members.some(member => member.user.toString() === userToAdd._id.toString())) {
      return res.status(409).json({ message: "This person is already a member of the group" });
    }

    // The membership lock serializes group edits; the query also checks the
    // target is not already present so duplicate requests cannot add twice.
    const updated = await Group.findOneAndUpdate(
      {
        _id: group._id,
        isDeleting: { $ne: true },
        membershipMutation: true,
        "members.user": { $ne: userToAdd._id },
        members: {
          $elemMatch: { user: req.user.id, role: "admin" },
        },
      },
      {
        $push: { members: { user: userToAdd._id, role: "member" } },
      },
      { new: true },
    ).populate("members.user", "name email upiId");

    if (!updated) {
      const latest = await Group.findById(group._id);
      if (!latest) {
        return res.status(404).json({ message: "Group not found" });
      }
      if (latest.isDeleting) {
        return res.status(409).json({ message: "This group is being deleted and can no longer accept members" });
      }
      if (latest.members.some(member => member.user.toString() === userToAdd._id.toString())) {
        return res.status(409).json({ message: "This person is already a member of the group" });
      }
      return res.status(403).json({ message: "Your admin permission changed. Refresh the group and try again." });
    }

    ActivityLog.create({
      group: group._id,
      actor: req.user.id,
      type: "member_added",
      meta: { memberName: userToAdd.name, memberEmail: userToAdd.email },
    }).catch(error => console.error("Could not record member-added activity:", error));

    return res.status(201).json(updated);
  } catch (error) {
    console.error("Error adding member to group:", error);
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({ message: "Please check the member details and try again" });
    }
    return res.status(500).json({ message: "We could not add this member. Please try again." });
  } finally {
    if (reservedGroupId) {
      try {
        await releaseMembershipMutation(reservedGroupId, reservedMembershipLease);
      } catch (releaseError) {
        console.error("Could not release group membership lock:", releaseError);
      }
    }
  }
});

// REMOVE MEMBER FROM GROUP
// - Admins can remove another member.
// - Any member can leave voluntarily.
// - The target must have no unpaid balance or unresolved payment activity.
router.delete("/:id/members/:userId", async (req, res) => {
  let reservedGroupId = null;
  let reservedMembershipLease = null;
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.userId)) {
      return res.status(400).json({ message: "Invalid group or member id" });
    }

    const group = await acquireMembershipMutation(req.params.id);
    if (!group) {
      const conflict = await membershipMutationConflict(req.params.id);
      return res.status(conflict.status).json({ message: conflict.message });
    }
    reservedGroupId = group._id;
    reservedMembershipLease = group.membershipMutationExpiresAt;

    const requester = group.members.find(member => member.user.toString() === req.user.id);
    if (!requester) {
      return res.status(403).json({ message: "You are not a member of this group" });
    }

    const targetId = req.params.userId;
    const isSelf = req.user.id === targetId;

    if (!isSelf && requester.role !== "admin") {
      return res.status(403).json({ message: "Only admins can remove other members" });
    }

    const targetMember = group.members.find(member => member.user.toString() === targetId);
    if (!targetMember) {
      return res.status(404).json({ message: "Member not found in group" });
    }

    const admins = group.members.filter(member => member.role === "admin");
    if (targetMember.role === "admin" && admins.length === 1) {
      return res.status(409).json({
        message: isSelf
          ? "You are the only admin. Assign another admin before leaving this group."
          : "The only admin cannot be removed. Assign another admin first.",
      });
    }

    const [expenses, settlements, pendingSettlement, activeSchedule] = await Promise.all([
      Expense.find({ group: group._id })
        .populate("paidBy", "name")
        .populate("splits.user", "name"),
      Settlement.find({ group: group._id }),
      Settlement.exists({
        group: group._id,
        status: "pending",
        $or: [{ from: targetId }, { to: targetId }],
      }),
      SettlementSchedule.exists({
        group: group._id,
        active: true,
        $or: [{ from: targetId }, { to: targetId }],
      }),
    ]);

    if (pendingSettlement) {
      return res.status(409).json({
        message: isSelf
          ? "You have a payment awaiting confirmation. Finish or cancel it before leaving."
          : "This member has a payment awaiting confirmation. Finish or cancel it before removal.",
      });
    }

    if (activeSchedule) {
      return res.status(409).json({
        message: isSelf
          ? "You have an active payment schedule. Complete or cancel it before leaving."
          : "This member has an active payment schedule. Complete or cancel it before removal.",
      });
    }

    const confirmedSettlements = settlements.filter(
      settlement => !settlement.status || settlement.status === "confirmed",
    );
    const pendingTransactions = simplifyDebts(expenses, confirmedSettlements);
    const hasPendingBalance = pendingTransactions.some(
      transaction => transaction.from === targetId || transaction.to === targetId,
    );

    if (hasPendingBalance) {
      return res.status(409).json({
        message: isSelf
          ? "You still have an unpaid balance in this group. Settle all dues before leaving."
          : "This member still has an unpaid balance. Settle all dues before removal.",
      });
    }

    const updateQuery = {
      _id: group._id,
      isDeleting: { $ne: true },
      membershipMutation: true,
      "members.user": targetId,
    };
    if (isSelf) {
      updateQuery["members.user"] = req.user.id;
    } else {
      updateQuery.members = {
        $elemMatch: { user: req.user.id, role: "admin" },
      };
    }

    const updated = await Group.findOneAndUpdate(
      updateQuery,
      { $pull: { members: { user: targetId } } },
      { new: true },
    ).populate("members.user", "name email upiId");

    if (!updated) {
      return res.status(409).json({
        message: "The group membership changed while this request was being processed. Refresh and try again.",
      });
    }

    if (isSelf) {
      ActivityLog.create({
        group: group._id,
        actor: req.user.id,
        type: "member_left",
        meta: {},
      }).catch(error => console.error("Could not record member-left activity:", error));
      return res.json({ message: "You have left the group" });
    }

    ActivityLog.create({
      group: group._id,
      actor: req.user.id,
      type: "member_removed",
      meta: { removedId: targetId },
    }).catch(error => console.error("Could not record member-removed activity:", error));

    return res.json(updated);
  } catch (error) {
    console.error("Error removing member from group:", error);
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({ message: "Please check the member details and try again" });
    }
    return res.status(500).json({ message: "We could not update the group membership. Please try again." });
  } finally {
    if (reservedGroupId) {
      try {
        await releaseMembershipMutation(reservedGroupId, reservedMembershipLease);
      } catch (releaseError) {
        console.error("Could not release group membership lock:", releaseError);
      }
    }
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
          $and: [
            {
              $or: [
                { membershipMutation: { $ne: true } },
                {
                  membershipMutation: true,
                  membershipMutationExpiresAt: { $type: "date", $lte: new Date() },
                },
              ],
            },
            {
              $or: [
                { activeMutations: 0 },
                { activeMutations: { $exists: false } },
                {
                  activeMutations: { $gt: 0 },
                  mutationExpiresAt: { $type: "date", $lte: new Date() },
                },
              ],
            },
          ],
        },
        { $set: { isDeleting: true, mutationExpiresAt: null, membershipMutation: false, membershipMutationExpiresAt: null } },
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
