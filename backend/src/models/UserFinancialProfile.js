import mongoose from "mongoose";

const goalSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    targetAmount: {
      type: Number,
      required: true,
      min: 1,
      max: 100000000, // 10 Cr limit
    },
    deadline: {
      type: Date,
      required: true,
    },
    savedSoFar: {
      type: Number,
      default: 0,
      min: 0,
      max: 100000000,
    },
  },
  { timestamps: true }
);

const userFinancialProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["student", "intern", "job", "freelancer", "other"],
      default: "other",
    },
    monthlyIncome: {
      type: Number,
      default: null,
      min: 0,
      max: 100000000,
    },
    monthlySavingsTarget: {
      type: Number,
      default: null,
      min: 0,
      max: 100000000,
    },
    goals: {
      type: [goalSchema],
      validate: [
        function (val) {
          return val.length <= 5;
        },
        "Maximum of 5 goals allowed",
      ],
    },
    riskComfort: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    language: {
      type: String,
      enum: ["en", "hinglish"],
      default: "en",
    },
    consentToUseForMentor: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("UserFinancialProfile", userFinancialProfileSchema);
