import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import http from "http";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { initSocket } from "./src/socket.js";
import { startSettlementReminderWorker } from "./src/services/settlementReminderWorker.js";
import Notification from "./src/models/Notification.js";

const server = http.createServer(app);

const io = initSocket(server);
export { io };

connectDB()
  .then(async () => {
    // Ensure the unique notification key exists before multiple workers scan schedules.
    await Notification.createIndexes();
    startSettlementReminderWorker();
  })
  .catch((error) => console.error("Database connection failed:", error));

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
