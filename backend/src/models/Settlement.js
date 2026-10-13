import mongoose from "mongoose";

const settlementSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
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
    },

    // "pending"    → payer marked as paid, waiting for receiver to confirm
    // "confirmed"  → receiver confirmed receipt, balance is cleared
    // "cancelled"  → payer cancelled request before receiver response
    // "expired"    → auto-expired after 7 days without receiver response
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "expired"],
      default: "pending",
    },

  },
  { timestamps: true },
);

// Prevent concurrent duplicate pending settlements at DB level
settlementSchema.index(
  { group: 1, from: 1, to: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

export default mongoose.model("Settlement", settlementSchema);
