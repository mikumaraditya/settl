import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["settlement_schedule_reminder"],
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 400 },
    icon: { type: String, default: "notifications_active" },
    color: { type: String, default: "#fbbf24" },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    schedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SettlementSchedule",
      required: true,
    },
    reminderStage: {
      type: String,
      enum: ["day_before", "due_today"],
      required: true,
    },
    dedupeKey: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Makes reminder creation idempotent even when multiple backend instances scan
// the same schedule at the same time.
notificationSchema.index({ user: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
