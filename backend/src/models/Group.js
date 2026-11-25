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
    // Membership changes are exclusive with expense writes and group deletion.
    membershipMutation: {
      type: Boolean,
      default: false,
    },
    membershipMutationExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Supports the frequent membership filter used by group lists and Finn tools.
groupSchema.index({ "members.user": 1 });

export default mongoose.model("Group", groupSchema);
