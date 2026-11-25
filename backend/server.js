import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import http from "http";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { initSocket } from "./src/socket.js";
import { startSettlementReminderWorker } from "./src/services/settlementReminderWorker.js";
import Notification from "./src/models/Notification.js";
import {
  connectRateLimitRedis,
  closeRateLimitRedis,
  isRedisRateLimitEnabled,
} from "./src/config/rateLimitStore.js";

const server = http.createServer(app);

const io = initSocket(server);
export { io };

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

async function startServer() {
  await connectDB();
  await connectRateLimitRedis();

  if (process.env.NODE_ENV === "production" && !isRedisRateLimitEnabled()) {
    console.warn(
      "REDIS_URL is not configured; rate limits are process-local and will not be shared across multiple backend instances.",
    );
  }

  // Create the unique reminder key before the worker begins scanning schedules.
  await Notification.createIndexes();
  startSettlementReminderWorker();

  server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received; shutting down Settl server.`);
  server.close(async () => {
    try {
      await closeRateLimitRedis();
    } finally {
      process.exit(0);
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

startServer().catch((error) => {
  console.error("Application startup failed:", error.message);
  process.exit(1);
});
