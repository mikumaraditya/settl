import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { parse as parseCookie } from "cookie";
import Group from "./models/Group.js";
import User from "./models/User.js";

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || true,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      // HTTP API authentication already uses the httpOnly token cookie. Read the
      // same cookie for Socket.IO so the browser never needs to store a JWT.
      const cookies = parseCookie(socket.handshake.headers.cookie || "");
      const token = socket.handshake.auth?.token || cookies.token;
      if (!token) throw new Error("Missing authentication token");
      const userId = jwt.verify(token, process.env.JWT_SECRET).id;
      const user = await User.findById(userId).select("isEmailVerified");
      if (!user?.isEmailVerified) throw new Error("Email verification required");
      socket.data.userId = userId;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // user joins a group room
    socket.on("join_group", async (groupId) => {
      const group = await Group.findById(groupId);
      const isMember = group?.members.some((member) => member.user.toString() === socket.data.userId);
      if (!isMember) return;
      socket.join(groupId);
      console.log(`User ${socket.id} joined group ${groupId}`);
    });

    // user leaves a group room
    socket.on("leave_group", (groupId) => {
      socket.leave(groupId);
      console.log(`User ${socket.id} left group ${groupId}`);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error("Socket not initialized");
  return io;
};

export { initSocket, getIO };
