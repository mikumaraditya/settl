import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    splits: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        amount: {
          type: Number,
        },
        percentage: {
          type: Number,
          min: 0,
          max: 100,
        },
        paid: {
          type: Boolean,
          default: false,
        },
      },
    ],
    splitType: {
      type: String,
      enum: ["equal", "exact", "percentage"],
      default: "equal",
    },
    category: {
      type: String,
      enum: ["food", "travel", "shopping", "rent", "entertainment", "fuel", "groceries", "medical", "other"],
      default: "other",
    },
    // Present only for requests that opt into server-side expense idempotency.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 128,
    },
    idempotencyHash: {
      type: String,
      match: /^[a-f0-9]{64}$/,
    },
  },
  { timestamps: true },
);

// Supports querying a group's expenses in creation-date order.
expenseSchema.index({ group: 1, createdAt: -1 });

// A caller may safely retry one logical create request without creating a
// second expense. Partial indexing leaves legacy expenses unaffected.
expenseSchema.index(
  { createdBy: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

export default mongoose.model("Expense", expenseSchema);
