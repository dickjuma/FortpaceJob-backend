const { Server } = require("socket.io");
const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const logger = require("../utils/logger");

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  // ─── Auth middleware ─────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error("Authentication required."));

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.id).select("_id name role avatar");
      if (!user) return next(new Error("User not found."));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Invalid token."));
    }
  });

  // ─── Connection handler ───────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const userId = socket.user._id.toString();
    logger.info(`Socket connected: ${userId} (${socket.user.name})`);

    // Join personal room for targeted notifications
    socket.join(`user:${userId}`);

    // ─── Join conversation room ──────────────────────────────────────────────
    socket.on("join_conversation", (conversationId) => {
      socket.join(`conv:${conversationId}`);
      logger.info(`${userId} joined conversation: ${conversationId}`);
    });

    // ─── Leave conversation room ─────────────────────────────────────────────
    socket.on("leave_conversation", (conversationId) => {
      socket.leave(`conv:${conversationId}`);
    });

    // ─── Typing indicator ────────────────────────────────────────────────────
    socket.on("typing_start", ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit("user_typing", {
        userId,
        name: socket.user.name,
        conversationId,
      });
    });

    socket.on("typing_stop", ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit("user_stopped_typing", {
        userId,
        conversationId,
      });
    });

    // ─── Mark messages as read ───────────────────────────────────────────────
    socket.on("mark_read", ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit("messages_read", {
        userId,
        conversationId,
      });
    });

    // ─── Online status ───────────────────────────────────────────────────────
    socket.broadcast.emit("user_online", { userId });

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${userId}`);
      socket.broadcast.emit("user_offline", { userId });
    });
  });

  // Attach io to app for use in controllers
  return io;
};

const getIO = () => {
  if (!io) throw new Error("Socket.IO not initialized.");
  return io;
};

module.exports = { initSocket, getIO };
