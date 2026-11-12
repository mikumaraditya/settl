import mongoose from "mongoose";

const settlementScheduleSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    // Store date-only selections at UTC noon to avoid timezone date shifts
    // in common browser timezones while preserving a Date value in MongoDB.
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["proposed", "accepted", "rejected", "cancelled", "payment_pending", "completed"],
      default: "proposed",
      required: true,
    },
    // Active schedules reserve one agreement slot per payer/receiver pair.
    // Proposed, accepted and payment_pending schedules remain active.
    active: {
      type: Boolean,
      default: true,
      required: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    reminderSentAt: {
      type: Date,
      default: null,
    },
    paymentSettlement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Settlement",
      default: null,
    },
    responseReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

settlementScheduleSchema.index(
  { group: 1, from: 1, to: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

settlementScheduleSchema.index({ group: 1, active: 1, dueDate: 1 });

export default mongoose.model("SettlementSchedule", settlementScheduleSchema);
