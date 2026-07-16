import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import express from "express";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./src/config/db.js";
import { initSocket } from "./src/socket.js";

const app = express();
const server = http.createServer(app);

const io = initSocket(server);
export { io };

import authRoutes from "./src/routes/auth.js";
import expenseRoutes from "./src/routes/expenses.js";
import groupRoutes from "./src/routes/groups.js";
import settlementRoutes from "./src/routes/settlements.js";
import messageRoutes from "./src/routes/messages.js";

connectDB();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/settlements", settlementRoutes);
app.use("/api/messages", messageRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Settl Backend is running",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error caught:", err.stack || err);
  const status = err.status || 500;
  const message = status >= 500 ? "Internal server error" : (err.message || "Something went wrong");
  res.status(status).json({ message });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
