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
  },
  { timestamps: true },
);

export default mongoose.model("Expense", expenseSchema);
