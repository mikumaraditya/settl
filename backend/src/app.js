import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.js";
import expenseRoutes from "./routes/expenses.js";
import groupRoutes from "./routes/groups.js";
import settlementRoutes from "./routes/settlements.js";
import messageRoutes from "./routes/messages.js";
import insightRoutes from "./routes/insights.js";
import mentorRoutes from "./routes/mentor.js";
import notificationRoutes from "./routes/notifications.js";

const app = express();

// Render places one trusted reverse proxy in front of each public web service.
// Trust only that hop so req.ip uses the visitor address from X-Forwarded-For.
// Do not use "true": trusting every hop would allow caller-supplied IP spoofing.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/settlements", settlementRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/insights", insightRoutes);
app.use("/api/mentor", mentorRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Settl Backend is running",
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, _next) => {
  console.error("Global error caught:", err.stack || err);
  const status = err.status || 500;
  const message = status >= 500 ? "Internal server error" : (err.message || "Something went wrong");
  res.status(status).json({ message });
});

export default app;
