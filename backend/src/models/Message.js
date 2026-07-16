import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true },
);

messageSchema.index({ group: 1, createdAt: -1 });

export default mongoose.model("Message", messageSchema);
