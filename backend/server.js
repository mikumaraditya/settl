import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import express from "express";
import http from "http";
import cors from "cors";
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
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/settlements", settlementRoutes);

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
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
