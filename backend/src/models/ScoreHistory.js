import mongoose from "mongoose";

const scoreHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  score: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Index for fast single-user lookups sorted by date
scoreHistorySchema.index({ user: 1, createdAt: -1 });

const ScoreHistory = mongoose.model("ScoreHistory", scoreHistorySchema);

export default ScoreHistory;
