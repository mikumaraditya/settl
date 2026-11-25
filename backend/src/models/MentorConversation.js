import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system", "tool"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    toolsUsed: [
      {
        name: { type: String },
        summary: { type: String },
      },
    ],
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const mentorConversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      default: "New conversation",
    },
    archivedAt: {
      type: Date,
      default: null,
      index: true,
    },
    messages: [messageSchema],
    activeRequestId: {
      type: String,
      select: false,
    },
    activeRequestExpiresAt: {
      type: Date,
      select: false,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Multiple conversations belong to one user. These indexes support the
// active/archive list without imposing a per-user uniqueness constraint.
mentorConversationSchema.index({ user: 1, archivedAt: 1, updatedAt: -1 });
mentorConversationSchema.index({ user: 1, updatedAt: -1 });

export default mongoose.model("MentorConversation", mentorConversationSchema);
