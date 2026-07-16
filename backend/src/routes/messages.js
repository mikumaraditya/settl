import express from "express";
import Group from "../models/Group.js";
import Message from "../models/Message.js";
import protect from "../middleware/auth.js";
import requireVerified from "../middleware/requireVerified.js";
import { io } from "../../server.js";

const router = express.Router();

router.use(protect, requireVerified);

const getMemberGroup = async (groupId, userId) => {
  const group = await Group.findById(groupId);
  if (!group) return { error: [404, "Group not found"] };
  const isMember = group.members.some((member) => member.user?.toString() === userId);
  return isMember ? { group } : { error: [403, "You are not a member of this group"] };
};

router.get("/group/:groupId", protect, async (req, res) => {
  try {
    const access = await getMemberGroup(req.params.groupId, req.user.id);
    if (access.error) return res.status(access.error[0]).json({ message: access.error[1] });

    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const messages = await Message.find({ group: access.group._id })
      .populate("sender", "name")
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json(messages.reverse());
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/", protect, async (req, res) => {
  try {
    const { groupId, content } = req.body;
    const text = typeof content === "string" ? content.trim() : "";
    if (!text || text.length > 1000) {
      return res.status(400).json({ message: "Message must be between 1 and 1000 characters" });
    }

    const access = await getMemberGroup(groupId, req.user.id);
    if (access.error) return res.status(access.error[0]).json({ message: access.error[1] });

    const message = await Message.create({ group: access.group._id, sender: req.user.id, content: text });
    const populated = await Message.findById(message._id).populate("sender", "name");
    io.to(access.group._id.toString()).emit("message_created", populated);
    res.status(201).json(populated);
  } catch (error) {
    console.error("Error creating message:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
