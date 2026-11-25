import Notification from "../models/Notification.js";
import SettlementSchedule from "../models/SettlementSchedule.js";
import { getIO } from "../socket.js";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
let started = false;
let running = false;

const addDays = (dateOnly, days) => {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const formatAmount = (amount) =>
  Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const emitCreated = (userId, notification) => {
  try {
    getIO().to(`user:${userId}`).emit("notification_created", {
      id: notification._id.toString(),
      type: notification.type,
      icon: notification.icon,
      color: notification.color,
      title: notification.title,
      body: notification.body,
      groupId: notification.group.toString(),
      scheduleId: notification.schedule.toString(),
      read: false,
      time: new Date(notification.createdAt || Date.now()).getTime(),
      persistent: true,
    });
  } catch {
    // Notifications are stored in MongoDB first, so users still receive them
    // when a socket connection is unavailable and can fetch them on next login.
  }
};

export async function processSettlementScheduleReminders({ now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10);
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);

  const schedules = await SettlementSchedule.find({
    status: "accepted",
    active: true,
    dueDate: {
      $gte: new Date(`${today}T00:00:00.000Z`),
      $lt: new Date(`${dayAfterTomorrow}T00:00:00.000Z`),
    },
  })
    .populate("from", "name")
    .populate("to", "name")
    .select("group from to amount dueDate status active");

  let createdCount = 0;

  for (const schedule of schedules) {
    const dueDateOnly = schedule.dueDate.toISOString().slice(0, 10);
    const reminderStage = dueDateOnly === today
      ? "due_today"
      : dueDateOnly === tomorrow
        ? "day_before"
        : null;

    if (!reminderStage || !schedule.from?._id || !schedule.to?._id) continue;

    const formattedDate = new Date(`${dueDateOnly}T12:00:00.000Z`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    const duePhrase = reminderStage === "due_today" ? "today" : "tomorrow";
    const amount = formatAmount(schedule.amount);
    const participants = [
      {
        userId: schedule.from._id.toString(),
        title: reminderStage === "due_today" ? "Your scheduled payment is due today" : "Payment due tomorrow",
        body: `Your agreed payment of ₹${amount} to ${schedule.to.name} is due ${duePhrase} (${formattedDate}). Open Settle Up to record it.`,
      },
      {
        userId: schedule.to._id.toString(),
        title: reminderStage === "due_today" ? "Payment expected today" : "Payment expected tomorrow",
        body: `${schedule.from.name} is due to pay you ₹${amount} ${duePhrase} (${formattedDate}). Open Settle Up to view the agreement.`,
      },
    ];

    for (const participant of participants) {
      const dedupeKey = `schedule:${schedule._id.toString()}:${reminderStage}:${participant.userId}`;
      const notification = {
        user: participant.userId,
        type: "settlement_schedule_reminder",
        title: participant.title,
        body: participant.body,
        icon: "notifications_active",
        color: "#fbbf24",
        group: schedule.group,
        schedule: schedule._id,
        reminderStage,
        dedupeKey,
        readAt: null,
      };

      try {
        const result = await Notification.updateOne(
          { user: participant.userId, dedupeKey },
          { $setOnInsert: notification },
          { upsert: true },
        );

        if (result.upsertedCount === 1) {
          const created = await Notification.findOne({ user: participant.userId, dedupeKey }).lean();
          if (created) {
            emitCreated(participant.userId, created);
            createdCount += 1;
          }
        }
      } catch (error) {
        // A second worker may win the unique-index race; the reminder already
        // exists in that case and must not be emitted again.
        if (error?.code !== 11000) throw error;
      }
    }
  }

  return createdCount;
}

export function startSettlementReminderWorker() {
  if (started) return;
  started = true;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processSettlementScheduleReminders();
    } catch (error) {
      console.error("Settlement reminder scan failed:", error.message);
    } finally {
      running = false;
    }
  };

  // Run on startup to pick up reminders for today and tomorrow immediately,
  // then check every 15 minutes. Unique database keys prevent
  // duplicate notifications across instances or restarts.
  void run();
  const interval = setInterval(run, FIFTEEN_MINUTES);
  interval.unref?.();
}
