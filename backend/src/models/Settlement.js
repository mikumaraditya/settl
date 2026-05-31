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
    status: {
      type: String,
      enum: ["pending", "confirmed"],
      default: "pending",
    },

  },
  { timestamps: true },
);

export default mongoose.model("Settlement", settlementSchema);
