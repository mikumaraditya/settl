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
      unique: true,
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

// Index for user queries sorted by last activity
mentorConversationSchema.index({ user: 1, updatedAt: -1 });

export default mongoose.model("MentorConversation", mentorConversationSchema);
