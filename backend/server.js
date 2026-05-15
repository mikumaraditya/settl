import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();

import express from "express";
import http from "http";
import cors from "cors";
import connectDB from "./src/config/db.js";
import { initSocket } from "./src/socket.js";

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = initSocket(server);

// Export io so it is available before route imports (avoiding circular dependency issues)
export { io };

// Import routes
import authRoutes from "./src/routes/auth.js";
import expenseRoutes from "./src/routes/expenses.js";
import groupRoutes from "./src/routes/groups.js";
import settlementRoutes from "./src/routes/settlements.js";

// Connect to Database
connectDB();

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded screenshots as static files
// Access via: http://localhost:5000/uploads/<filename>
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/settlements", settlementRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Settl Backend is running" });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
