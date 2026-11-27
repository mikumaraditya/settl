import { randomUUID } from "node:crypto";
import Group from "../models/Group.js";

const GROUP_MUTATION_LEASE_MS = 5 * 60 * 1000;

/**
 * Reserve the group's shared financial-write slot.
 *
 * Only one expense/settlement/schedule mutation may hold the slot at a time.
 * The lease allows recovery when a process dies before releasing it, while
 * the unique token prevents an expired owner from clearing a newer owner's
 * lock when it eventually finishes.
 */
export async function reserveGroupMutation(groupId, userId) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + GROUP_MUTATION_LEASE_MS);
  const token = randomUUID();

  const group = await Group.findOneAndUpdate(
    {
      _id: groupId,
      "members.user": userId,
      isDeleting: { $ne: true },
      $and: [
        {
          $or: [
            { membershipMutation: { $ne: true } },
            {
              membershipMutation: true,
              membershipMutationExpiresAt: { $type: "date", $lte: now },
            },
          ],
        },
        {
          $or: [
            { financialMutationId: { $in: [null, ""] } },
            { financialMutationExpiresAt: { $type: "date", $lte: now } },
          ],
        },
      ],
    },
    {
      $inc: { activeMutations: 1 },
      $set: {
        mutationExpiresAt: expiresAt,
        financialMutationId: token,
        financialMutationExpiresAt: expiresAt,
        membershipMutation: false,
        membershipMutationExpiresAt: null,
      },
    },
    { new: true },
  );

  return group ? { group, token } : null;
}

/**
 * Release only this request's lock. Decrement the in-flight counter separately
 * so an expired request cannot clear a newer request's token.
 */
export async function releaseGroupMutation(groupId, token) {
  if (!groupId || !token) return;

  await Group.updateOne(
    { _id: groupId, financialMutationId: token },
    {
      $set: {
        financialMutationId: null,
        financialMutationExpiresAt: null,
      },
    },
  );

  await Group.updateOne(
    { _id: groupId, activeMutations: { $gt: 0 } },
    { $inc: { activeMutations: -1 } },
  );
}
