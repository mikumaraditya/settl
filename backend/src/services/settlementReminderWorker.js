import Notification from "../models/Notification.js";
import SettlementSchedule from "../models/SettlementSchedule.js";
import { clearInsightCaches } from "../routes/insights.js";
import { getIO } from "../socket.js";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
let started = false;
let running = false;

const addDays = (dateOnly, days) => {
  const date = new Date(`${dateOnly}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getDateInTimeZone = (timeZone, now) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: typeof timeZone === "string" && timeZone.length <= 64 ? timeZone : "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
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
  const schedules = await SettlementSchedule.find({
    status: "accepted",
    active: true,
    dueDate: { $lte: new Date(now.getTime() + 36 * 60 * 60 * 1000) },
  })
    .populate("from", "name")
    .populate("to", "name")
    .select("group from to amount dueDate timeZone status active");

  let createdCount = 0;

  for (const schedule of schedules) {
    const dueDateOnly = schedule.dueDate.toISOString().slice(0, 10);
    const today = getDateInTimeZone(schedule.timeZone, now);
    const tomorrow = addDays(today, 1);
    const overdueDays = dueDateOnly < today
      ? Math.floor((Date.parse(today + "T00:00:00.000Z") - Date.parse(dueDateOnly + "T00:00:00.000Z")) / 86400000)
      : 0;
    const reminderStage = overdueDays >= 4
      ? "overdue"
      : dueDateOnly === today
        ? "due_today"
        : dueDateOnly === tomorrow
          ? "day_before"
          : null;

    // First overdue reminder on Day 4, then weekly on Days 11, 18, 25...
    const overdueReminderKey = overdueDays === 4
      ? "day4"
      : overdueDays >= 11 && (overdueDays - 4) % 7 === 0
        ? "weekly-" + overdueDays
        : null;

    if (!reminderStage || !schedule.from?._id || !schedule.to?._id) continue;
    if (reminderStage === "overdue" && !overdueReminderKey) continue;

    const formattedDate = new Date(`${dueDateOnly}T12:00:00.000Z`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    const duePhrase = reminderStage === "due_today" ? "today" : "tomorrow";
    const amount = formatAmount(schedule.amount);
    const participants = reminderStage === "overdue"
      ? [
          {
            userId: schedule.from._id.toString(),
            title: "Your repayment is overdue",
            body: `Your agreed payment of ₹${amount} to ${schedule.to.name} was due on ${formattedDate}. Complete it to clear the overdue Trust Score impact.`,
          },
          {
            userId: schedule.to._id.toString(),
            title: "A scheduled repayment is overdue",
            body: `${schedule.from.name} has not completed the agreed ₹${amount} repayment due on ${formattedDate}.`,
          },
        ]
      : [
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
      const stageKey = reminderStage === "overdue" ? overdueReminderKey : reminderStage;
      const dedupeKey = `schedule:${schedule._id.toString()}:${stageKey}:${participant.userId}`;
      const notification = {
        user: participant.userId,
        type: reminderStage === "overdue" ? "settlement_schedule_overdue" : "settlement_schedule_reminder",
        title: participant.title,
        body: participant.body,
        icon: reminderStage === "overdue" ? "warning" : "notifications_active",
        color: reminderStage === "overdue" ? "#f87171" : "#fbbf24",
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
            if (reminderStage === "overdue") {
              clearInsightCaches([schedule.from._id.toString()]);
            }
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
