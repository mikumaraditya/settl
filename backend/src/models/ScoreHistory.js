import mongoose from "mongoose";

const scoreHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  score: { type: Number, required: true },
  delta: { type: Number, default: 0 },
  reason: { type: String, default: "" },
  eventId: { type: String, default: null },
  eventType: { type: String, default: "score_snapshot" },
  createdAt: { type: Date, default: Date.now },
});

// Index for fast single-user lookups sorted by date
scoreHistorySchema.index({ user: 1, createdAt: -1 });

const ScoreHistory = mongoose.model("ScoreHistory", scoreHistorySchema);

export default ScoreHistory;
