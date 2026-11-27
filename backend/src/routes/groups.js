import express from 'express';
import mongoose from 'mongoose';
import { randomUUID, createHash } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { createRateLimitStore } from '../config/rateLimitStore.js';
import Group from '../models/Group.js';
import User from '../models/User.js';
import Expense from '../models/Expense.js';
import Settlement from '../models/Settlement.js';
import ActivityLog from '../models/ActivityLog.js';
import Message from '../models/Message.js';
import SettlementSchedule from '../models/SettlementSchedule.js';
import protect from '../middleware/auth.js';
import requireVerified from '../middleware/requireVerified.js';
import { clearInsightCaches } from './insights.js';
import simplifyDebts from '../utils/debtSimplify.js';

const router = express.Router();

router.use(protect, requireVerified);

const groupCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user.id,
  store: createRateLimitStore("groups-create"),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many groups created. Please try again in an hour." },
});

export const acquireMembershipMutation = async (groupId) => {
  const now = new Date();
  const token = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + 5 * 60 * 1000);

  const group = await Group.findOneAndUpdate(
    {
      _id: groupId,
      isDeleting: { $ne: true },
      $and: [
        {
          $or: [
            { membershipMutation: { $ne: true } },
            {
              membershipMutation: true,
              membershipMutationExpiresAt: { $type: "date", $lte: now },
            },
            {
              membershipMutation: true,
              $or: [
                { membershipMutationExpiresAt: null },
                { membershipMutationExpiresAt: { $exists: false } },
              ],
            },
          ],
        },
        {
          $or: [
            { financialMutationId: { $in: [null, ""] } },
            { financialMutationExpiresAt: { $type: "date", $lte: now } },
          ],
        },
        {
          $or: [
            { activeMutations: 0 },
            { activeMutations: { $exists: false } },
            {
              activeMutations: { $gt: 0 },
              mutationExpiresAt: { $type: "date", $lte: now },
            },
          ],
        },
      ],
    },
    {
      $set: {
        membershipMutation: true,
        membershipMutationId: token,
        membershipMutationExpiresAt: leaseExpiresAt,
        activeMutations: 0,
        mutationExpiresAt: null,
      },
    },
    { new: true },
  );

  return group ? { group, token } : null;
};

export const releaseMembershipMutation = async (groupId, token) => {
  if (!groupId || !token) return;
  await Group.updateOne(
    {
      _id: groupId,
      membershipMutation: true,
      membershipMutationId: token,
    },
    {
      $set: {
        membershipMutation: false,
        membershipMutationId: null,
        membershipMutationExpiresAt: null,
      },
    },
  );
};

const membershipMutationConflict = async (groupId) => {
  const current = await Group.findById(groupId).select("isDeleting membershipMutation membershipMutationExpiresAt activeMutations mutationExpiresAt");
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
const prepareGroupCreateRequest = async (req, res, next) => {
  try {
    const rawName = req.body?.name;
    const rawDescription = req.body?.description;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    const description = typeof rawDescription === "string" ? rawDescription.trim() : "";

    if (!name) return res.status(400).json({ message: "Group name is required" });
    if (name.length > 80) {
      return res.status(400).json({ message: "Group name cannot exceed 80 characters" });
    }
    if (description.length > 280) {
      return res.status(400).json({ message: "Group description cannot exceed 280 characters" });
    }

    const rawIdempotencyKey = req.get("Idempotency-Key");
    const idempotencyKey = typeof rawIdempotencyKey === "string"
      ? rawIdempotencyKey.trim()
      : null;
    if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({ message: "Invalid group idempotency key" });
    }

    const idempotencyHash = idempotencyKey
      ? createHash("sha256").update(JSON.stringify({ name, description })).digest("hex")
      : null;
    req.groupCreatePayload = { name, description, idempotencyKey, idempotencyHash };

    // Replay before rate limiting: a retry is not a new group creation.
    if (idempotencyKey) {
      const existing = await Group.findOne({
        createdBy: req.user.id,
        idempotencyKey,
      });
      if (existing) {
        if (existing.idempotencyHash !== idempotencyHash) {
          return res.status(409).json({
            code: "IDEMPOTENCY_KEY_REUSED",
            message: "This group creation request key was already used for different details.",
          });
        }
        return res.status(200).json(existing);
      }
    }

    return groupCreateLimiter(req, res, next);
  } catch (error) {
    console.error("Could not prepare group creation request:", error);
    return res.status(500).json({ message: "We could not create this group. Please try again." });
  }
};

router.post("/", prepareGroupCreateRequest, async (req, res) => {
  const { name, description, idempotencyKey, idempotencyHash } = req.groupCreatePayload;

  try {
    let group;
    try {
      group = await Group.create({
        name,
        description,
        createdBy: req.user.id,
        members: [{ user: req.user.id, role: "admin" }],
        ...(idempotencyKey ? { idempotencyKey, idempotencyHash } : {}),
      });
    } catch (createError) {
      // Concurrent identical requests can both pass the initial lookup.
      // The unique index makes the second writer replay the first record.
      if (idempotencyKey && createError?.code === 11000) {
        const existing = await Group.findOne({
          createdBy: req.user.id,
          idempotencyKey,
        });
        if (existing) {
          if (existing.idempotencyHash !== idempotencyHash) {
            return res.status(409).json({
              code: "IDEMPOTENCY_KEY_REUSED",
              message: "This group creation request key was already used for different details.",
            });
          }
          return res.status(200).json(existing);
        }
      }
      throw createError;
    }

    clearInsightCaches([req.user.id]);

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

    const reservation = await acquireMembershipMutation(req.params.id);
    if (!reservation) {
      const conflict = await membershipMutationConflict(req.params.id);
      return res.status(conflict.status).json({ message: conflict.message });
    }
    const { group, token } = reservation;
    reservedGroupId = group._id;
    reservedMembershipLease = token;

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
        membershipMutationId: reservedMembershipLease,
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

    clearInsightCaches([userToAdd._id]);

    ActivityLog.create({
      group: group._id,
      actor: req.user.id,
      type: "member_added",
      meta: { memberName: userToAdd.name, memberEmail: userToAdd.email },
    }).catch(error => console.error("Could not record member-added activity:", error));

    try {
      await releaseMembershipMutation(reservedGroupId, reservedMembershipLease);
    } catch (releaseError) {
      console.error("Could not release group membership lock before response:", releaseError);
    }
    reservedGroupId = null;
    reservedMembershipLease = null;
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

    const reservation = await acquireMembershipMutation(req.params.id);
    if (!reservation) {
      const conflict = await membershipMutationConflict(req.params.id);
      return res.status(conflict.status).json({ message: conflict.message });
    }
    const { group, token } = reservation;
    reservedGroupId = group._id;
    reservedMembershipLease = token;

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

    // Group deletion is restricted to createdBy. If the creator leaves or
    // is removed from a legacy/multi-admin group, transfer ownership in the
    // same atomic membership update so the remaining group is still manageable.
    const creatorIsLeaving = group.createdBy.toString() === targetId;
    const successorAdmin = creatorIsLeaving
      ? group.members.find(member => member.user.toString() !== targetId && member.role === "admin")
      : null;
    if (creatorIsLeaving && !successorAdmin) {
      return res.status(409).json({
        message: "Assign another admin before the group creator can leave or be removed.",
      });
    }

    const updateQuery = {
      _id: group._id,
      isDeleting: { $ne: true },
      membershipMutation: true,
      membershipMutationId: reservedMembershipLease,
      "members.user": targetId,
    };
    if (isSelf) {
      updateQuery["members.user"] = req.user.id;
    } else {
      updateQuery.members = {
        $elemMatch: { user: req.user.id, role: "admin" },
      };
    }
    if (creatorIsLeaving) {
      updateQuery.createdBy = group.createdBy;
    }

    const membershipUpdate = { $pull: { members: { user: targetId } } };
    if (successorAdmin) {
      membershipUpdate.$set = { createdBy: successorAdmin.user };
    }

    const updated = await Group.findOneAndUpdate(
      updateQuery,
      membershipUpdate,
      { new: true },
    ).populate("members.user", "name email upiId");

    if (!updated) {
      return res.status(409).json({
        message: "The group membership changed while this request was being processed. Refresh and try again.",
      });
    }

    clearInsightCaches([targetId]);

    if (isSelf) {
      ActivityLog.create({
        group: group._id,
        actor: req.user.id,
        type: "member_left",
        meta: {},
      }).catch(error => console.error("Could not record member-left activity:", error));
      try {
        await releaseMembershipMutation(reservedGroupId, reservedMembershipLease);
      } catch (releaseError) {
        console.error("Could not release group membership lock before response:", releaseError);
      }
      reservedGroupId = null;
      reservedMembershipLease = null;
      return res.json({ message: "You have left the group" });
    }

    ActivityLog.create({
      group: group._id,
      actor: req.user.id,
      type: "member_removed",
      meta: { removedId: targetId },
    }).catch(error => console.error("Could not record member-removed activity:", error));

    try {
      await releaseMembershipMutation(reservedGroupId, reservedMembershipLease);
    } catch (releaseError) {
      console.error("Could not release group membership lock before response:", releaseError);
    }
    reservedGroupId = null;
    reservedMembershipLease = null;
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
  let deletionMutationId = null;
  let cleanupStarted = false;
  let lockedGroupId = null;

  const releaseDeletionReservation = async ({ keepGroupLocked }) => {
    if (!lockedGroupId || !deletionMutationId) return;
    const update = keepGroupLocked
      ? {
          $set: {
            deletionMutationId: null,
            deletionMutationExpiresAt: null,
          },
        }
      : {
          $set: {
            isDeleting: false,
            deletionCleanupStarted: false,
            deletionMutationId: null,
            deletionMutationExpiresAt: null,
            activeMutations: 0,
            mutationExpiresAt: null,
          },
        };
    await Group.updateOne(
      {
        _id: lockedGroupId,
        isDeleting: true,
        deletionMutationId,
        ...(keepGroupLocked ? { deletionCleanupStarted: true } : { deletionCleanupStarted: { $ne: true } }),
      },
      update,
    );
    deletionMutationId = null;
    lockedGroupId = null;
  };

  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid group id" });
    }

    const existingGroup = await Group.findById(req.params.id);
    if (!existingGroup) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (existingGroup.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the group creator can delete it" });
    }

    // Acquire the deletion reservation BEFORE reading balances or payment state.
    // Financial and membership writes check isDeleting and cannot begin after
    // this atomic transition succeeds.
    const now = new Date();
    const token = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    const legacyCleanupRetry = existingGroup.isDeleting && !existingGroup.deletionMutationId;
    const lock = await Group.findOneAndUpdate(
      {
        _id: existingGroup._id,
        createdBy: req.user.id,
        $and: [
          {
            $or: [
              { isDeleting: { $ne: true } },
              { isDeleting: true, deletionMutationId: { $in: [null, ""] } },
              {
                isDeleting: true,
                deletionMutationExpiresAt: { $type: "date", $lte: now },
              },
            ],
          },
          {
            $or: [
              { isDeleting: true },
              { membershipMutation: { $ne: true } },
              {
                membershipMutation: true,
                membershipMutationExpiresAt: { $type: "date", $lte: now },
              },
            ],
          },
          {
            $or: [
              { isDeleting: true },
              { financialMutationId: { $in: [null, ""] } },
              { financialMutationExpiresAt: { $type: "date", $lte: now } },
            ],
          },
          {
            $or: [
              { isDeleting: true },
              { activeMutations: 0 },
              { activeMutations: { $exists: false } },
              {
                activeMutations: { $gt: 0 },
                mutationExpiresAt: { $type: "date", $lte: now },
              },
            ],
          },
        ],
      },
      {
        $set: {
          isDeleting: true,
          deletionMutationId: token,
          deletionMutationExpiresAt: leaseExpiresAt,
          deletionCleanupStarted: legacyCleanupRetry || existingGroup.deletionCleanupStarted === true,
          activeMutations: 0,
          mutationExpiresAt: null,
          financialMutationId: null,
          financialMutationExpiresAt: null,
          membershipMutation: false,
          membershipMutationId: null,
          membershipMutationExpiresAt: null,
        },
      },
      { new: true },
    );

    if (!lock) {
      return res.status(409).json({
        message: "This group is being updated or deleted right now. Please wait a moment and try again.",
      });
    }

    deletionMutationId = token;
    lockedGroupId = lock._id;
    cleanupStarted = lock.deletionCleanupStarted === true;

    if (!cleanupStarted) {
      // The group is now frozen. Read the current financial state under the
      // reservation, not from the stale snapshot used to start the request.
      const [expenses, settlements, activeSchedule, pendingSettlement] = await Promise.all([
        Expense.find({ group: lock._id })
          .populate("paidBy", "name")
          .populate("splits.user", "name"),
        Settlement.find({ group: lock._id }),
        SettlementSchedule.exists({ group: lock._id, active: true }),
        Settlement.exists({ group: lock._id, status: "pending" }),
      ]);

      const confirmedSettlements = settlements.filter(
        settlement => !settlement.status || settlement.status === "confirmed",
      );
      const pendingTransactions = simplifyDebts(expenses, confirmedSettlements);

      let blocker = null;
      if (pendingTransactions.length > 0) {
        blocker = "This group still has unpaid balances. Settle all dues before deleting it.";
      } else if (pendingSettlement) {
        blocker = "A payment is still awaiting confirmation. Finish or cancel it before deleting this group.";
      } else if (activeSchedule) {
        blocker = "This group has an active payment schedule. Complete or cancel it before deleting the group.";
      }

      if (blocker) {
        await releaseDeletionReservation({ keepGroupLocked: false });
        return res.status(409).json({ message: blocker });
      }

      // Persist the transition to destructive cleanup using the owner token.
      // A second delete request cannot pass the same preflight concurrently.
      const markedForCleanup = await Group.updateOne(
        {
          _id: lock._id,
          createdBy: req.user.id,
          isDeleting: true,
          deletionMutationId: token,
          deletionCleanupStarted: { $ne: true },
        },
        { $set: { deletionCleanupStarted: true } },
      );
      if (markedForCleanup.modifiedCount !== 1) {
        return res.status(409).json({
          message: "The group deletion state changed. Refresh and try again.",
        });
      }
      cleanupStarted = true;
    }

    // Each operation is idempotent. Once cleanup has started, a failure keeps
    // the group closed to new writes so the creator can safely retry it.
    await Promise.all([
      Expense.deleteMany({ group: lock._id }),
      Settlement.deleteMany({ group: lock._id }),
      SettlementSchedule.deleteMany({ group: lock._id }),
      ActivityLog.deleteMany({ group: lock._id }),
      Message.deleteMany({ group: lock._id }),
    ]);

    const deleted = await Group.deleteOne({
      _id: lock._id,
      createdBy: req.user.id,
      isDeleting: true,
      deletionMutationId: token,
      deletionCleanupStarted: true,
    });

    if (deleted.deletedCount !== 1) {
      return res.status(409).json({
        message: "The group changed while it was being deleted. Refresh and try again.",
      });
    }

    deletionMutationId = null;
    lockedGroupId = null;
    clearInsightCaches(lock.members.map((member) => member.user));
    return res.json({ message: "Group deleted" });
  } catch (error) {
    console.error("Error deleting group:", error);
    if (deletionMutationId && lockedGroupId) {
      try {
        // Preflight failures are reversible; cleanup failures are not. Keep
        // only the latter frozen and release their token for an immediate retry.
        await releaseDeletionReservation({ keepGroupLocked: cleanupStarted });
      } catch (releaseError) {
        console.error("Could not release group deletion reservation:", releaseError);
      }
    }
    return res.status(500).json({
      message: cleanupStarted
        ? "We could not finish deleting this group. Your group is locked against new writes; retry the deletion to finish cleanup."
        : "We could not verify that this group is safe to delete. The group remains available; please try again.",
    });
  }
});

export default router;
