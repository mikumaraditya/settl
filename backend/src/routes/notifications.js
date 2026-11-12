import express from "express";
import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import protect from "../middleware/auth.js";
import requireVerified from "../middleware/requireVerified.js";

const router = express.Router();

router.use(protect, requireVerified);

// Notifications are scoped to the authenticated user. A participant never
// receives another member's schedule reminders through this endpoint.
router.get("/", async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.json({
      notifications: notifications.map((notification) => ({
        id: notification._id.toString(),
        type: notification.type,
        icon: notification.icon,
        color: notification.color,
        title: notification.title,
        body: notification.body,
        groupId: notification.group?.toString() || "",
        scheduleId: notification.schedule?.toString() || "",
        read: Boolean(notification.readAt),
        time: notification.createdAt?.getTime?.() || Date.now(),
        persistent: true,
      })),
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Unable to fetch notifications" });
  }
});

router.patch("/:notificationId/read", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.notificationId)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, user: req.user.id, deletedAt: null },
      { $set: { readAt: new Date() } },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking notification read:", error);
    res.status(500).json({ message: "Unable to update notification" });
  }
});

router.patch("/read-all", async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, readAt: null, deletedAt: null },
      { $set: { readAt: new Date() } },
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking notifications read:", error);
    res.status(500).json({ message: "Unable to update notifications" });
  }
});

router.delete("/", async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, deletedAt: null },
      { $set: { deletedAt: new Date(), readAt: new Date() } },
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Error clearing notifications:", error);
    res.status(500).json({ message: "Unable to clear notifications" });
  }
});

export default router;
