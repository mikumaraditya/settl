import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    members: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        role: {
          type: String,
          enum: ["admin", "member"],
          default: "member",
        },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Optional request identity prevents duplicate groups after uncertain retries.
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 128,
    },
    idempotencyHash: {
      type: String,
      match: /^[a-f0-9]{64}$/,
    },
    currency: {
      type: String,
      default: "INR",
    },
    // Lifecycle guard: prevents a group being deleted while an expense
    // create/delete request is in flight. Existing documents default safely.
    isDeleting: {
      type: Boolean,
      default: false,
    },
    // Tracks whether safe preflight checks passed before destructive cleanup.
    // A stale preflight lease is revalidated; an interrupted cleanup is retried.
    deletionCleanupStarted: {
      type: Boolean,
      default: false,
    },
    deletionMutationId: {
      type: String,
      default: null,
    },
    deletionMutationExpiresAt: {
      type: Date,
      default: null,
    },
    activeMutations: {
      type: Number,
      default: 0,
      min: 0,
    },
    // A crashed process cannot leave the group permanently blocked.
    mutationExpiresAt: {
      type: Date,
      default: null,
    },
    // A single owner-token lease serializes balance-affecting writes across
    // expense and settlement routes. The token prevents stale requests from
    // releasing a newer request's reservation.
    financialMutationId: {
      type: String,
      default: null,
    },
    financialMutationExpiresAt: {
      type: Date,
      default: null,
    },
    // Membership changes are exclusive with expense writes and group deletion.
    membershipMutation: {
      type: Boolean,
      default: false,
    },
    // Unique owner for the active membership lease; expiry alone is not unique.
    membershipMutationId: {
      type: String,
      default: null,
    },
    membershipMutationExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// One logical group-create request per creator, without constraining legacy groups.
groupSchema.index(
  { createdBy: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

// Supports the frequent membership filter used by group lists and Finn tools.
groupSchema.index({ "members.user": 1 });

export default mongoose.model("Group", groupSchema);
