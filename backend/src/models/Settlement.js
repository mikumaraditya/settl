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
    // "disputed"   → receiver rejected the claim
    // "unresolved" → dispute evidence also rejected, no resolution reached
    status: {
      type: String,
      enum: ["pending", "confirmed", "disputed", "unresolved"],
      default: "pending",
    },

    settled: {
      type: Boolean,
      default: true,
    },

    // UTR / transaction reference submitted by payer at confirmation time
    transactionId: {
      type: String,
      default: "",
    },

    // Reason given by receiver when they reject the payment claim
    disputeReason: {
      type: String,
      default: "",
    },

    // Evidence submitted by payer during dispute resolution
    evidence: {
      utrNumber: {
        type: String,
        default: "",
      },
      screenshotUrl: {
        type: String,
        default: "",
      },
      screenshotOriginalName: {
        type: String,
        default: "",
      },
      submittedAt: {
        type: Date,
        default: null,
      },
      // Result from Claude Vision AI verification
      aiVerified: {
        type: Boolean,
        default: null,
      },
      aiReason: {
        type: String,
        default: "",
      },
    },
  },
  { timestamps: true },
);

export default mongoose.model("Settlement", settlementSchema);
