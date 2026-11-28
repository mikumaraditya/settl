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
        acknowledged: {
          type: Boolean,
          default: false,
        },
        acknowledgedAt: {
          type: Date,
          default: null,
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

expenseSchema.index({ group: 1, createdAt: -1 });
expenseSchema.index(
  { createdBy: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

export default mongoose.model("Expense", expenseSchema);
