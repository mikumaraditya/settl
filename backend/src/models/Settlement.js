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
    // Expense records used when this payment amount was validated against
    // the group's simplified debt ledger. Legacy settlements may omit it.
    sourceExpenseIds: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Expense",
      }],
      default: undefined,
    },

    // "pending"    → payer marked as paid, waiting for receiver to confirm
    // "confirmed"  → receiver confirmed receipt, balance is cleared
    // "cancelled"  → payer cancelled request before receiver response
    // "expired"    → auto-expired after 7 days without receiver response
    // "rejected"   → receiver rejected payment, preserved for audit trail
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "expired", "rejected"],
      default: "pending",
    },
    dueDate: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    // A retry-safe request identity supplied by the payer. Legacy rows omit it.
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 128,
    },
    idempotencyHash: {
      type: String,
      match: /^[a-f0-9]{64}$/,
    },
    // Optional reference supplied by the payer; Settl does not verify it with a bank.
    upiReference: {
      type: String,
      trim: true,
      minlength: 6,
      maxlength: 64,
      default: null,
    },
  },
  { timestamps: true },
);

// Supports protecting the exact ledger rows that a payment was based on.
settlementSchema.index({ group: 1, status: 1, sourceExpenseIds: 1 });

// Prevent concurrent duplicate pending settlements at DB level
settlementSchema.index(
  { group: 1, from: 1, to: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

// Keep one logical payment attempt per payer/request key, including after the
// settlement is confirmed, cancelled, rejected, or expired.
settlementSchema.index(
  { from: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

export default mongoose.model("Settlement", settlementSchema);
