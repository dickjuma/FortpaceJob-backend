// services/socket.js
const { Server } = require("socket.io");
const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const logger = require("../utils/logger");
const { getAllowedOrigins } = require("../config/origins");

// Import your Conversation and Message models (uncomment when ready)
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

let io;

// ─── Rate limiting (in‑memory, for single instance) ─────────────────────────
// For horizontal scaling, replace this with a Redis-based limiter.
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_EVENTS_PER_WINDOW = 100;

/**
 * Clean up expired rate limiter entries every 5 minutes
 */
const cleanupRateLimiter = () => {
  const now = Date.now();
  for (const [userId, record] of rateLimiter.entries()) {
    if (now > record.resetTime) {
      rateLimiter.delete(userId);
    }
  }
};
setInterval(cleanupRateLimiter, 300000); // 5 minutes

/**
 * Check if a socket has exceeded the rate limit
 * @returns {boolean} true if within limit, false if exceeded
 */
const checkRateLimit = (socket) => {
  const userId = socket.user._id.toString();
  const now = Date.now();
  let record = rateLimiter.get(userId);
  if (!record) {
    record = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimiter.set(userId, record);
  }
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + RATE_LIMIT_WINDOW;
  }
  record.count++;
  if (record.count > MAX_EVENTS_PER_WINDOW) {
    socket.emit("error", { message: "Rate limit exceeded. Please slow down." });
    return false;
  }
  return true;
};

/**
 * Validate that a conversation ID is a valid MongoDB ObjectId
 */
const isValidConversationId = (conversationId) => {
  return (
    conversationId &&
    typeof conversationId === "string" &&
    /^[0-9a-fA-F]{24}$/.test(conversationId) // Mongoose ObjectId regex
  );
};

/**
 * Initialize Socket.IO server
 */
const initSocket = (server) => {
  const allowedOrigins = getAllowedOrigins();

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000, // 60s
    pingInterval: 25000, // 25s
    transports: ["websocket", "polling"],
  });

  // ─── Authentication middleware ───────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        logger.warn("Socket connection attempt without token");
        return next(new Error("Authentication required."));
      }

      const decoded = verifyToken(token);
      if (!decoded?.id) {
        return next(new Error("Invalid token."));
      }

      const user = await User.findById(decoded.id)
        .select("_id name role avatar isActive")
        .lean();
      if (!user) {
        logger.warn(`Socket auth: user ${decoded.id} not found`);
        return next(new Error("User not found."));
      }
      if (user.isActive === false) {
        return next(new Error("Account is deactivated."));
      }

      socket.user = user;
      logger.info(`Socket authenticated: ${user._id} (${user.name})`);
      next();
    } catch (err) {
      logger.error(`Socket auth error: ${err.message}`);
      next(new Error("Authentication failed."));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user._id.toString();
    const user = socket.user;

    // Join personal room for targeted notifications
    socket.join(`user:${userId}`);

    // Broadcast online status to all other clients
    socket.broadcast.emit("user_online", { userId, name: user.name });

    // ─── Join conversation room ──────────────────────────────────────────
    socket.on("join_conversation", async (conversationId) => {
      if (!checkRateLimit(socket)) return;

      if (!isValidConversationId(conversationId)) {
        return socket.emit("error", { message: "Invalid conversation ID format." });
      }

      try {
        // Verify that the user is a participant in this conversation
        const isParticipant = await Conversation.exists({
          _id: conversationId,
          participants: userId,
        });
        if (!isParticipant) {
          return socket.emit("error", { message: "You are not a participant in this conversation." });
        }

        socket.join(`conv:${conversationId}`);
        logger.info(`${userId} joined conversation: ${conversationId}`);
        socket.emit("joined_conversation", { conversationId });
      } catch (err) {
        logger.error(`Error verifying conversation: ${err.message}`);
        socket.emit("error", { message: "Could not verify conversation." });
      }
    });

    // ─── Leave conversation room ─────────────────────────────────────────
    socket.on("leave_conversation", (conversationId) => {
      if (!checkRateLimit(socket)) return;
      if (!isValidConversationId(conversationId)) return;

      socket.leave(`conv:${conversationId}`);
      logger.info(`${userId} left conversation: ${conversationId}`);
    });

    // ─── Typing indicators ───────────────────────────────────────────────
    socket.on("typing_start", ({ conversationId }) => {
      if (!checkRateLimit(socket)) return;
      if (!isValidConversationId(conversationId)) return;

      socket.to(`conv:${conversationId}`).emit("user_typing", {
        userId,
        name: user.name,
        conversationId,
      });
    });

    socket.on("typing_stop", ({ conversationId }) => {
      if (!checkRateLimit(socket)) return;
      if (!isValidConversationId(conversationId)) return;

      socket.to(`conv:${conversationId}`).emit("user_stopped_typing", {
        userId,
        conversationId,
      });
    });

    // ─── Mark messages as read ───────────────────────────────────────────
    socket.on("mark_read", ({ conversationId }) => {
      if (!checkRateLimit(socket)) return;
      if (!isValidConversationId(conversationId)) return;

      socket.to(`conv:${conversationId}`).emit("messages_read", {
        userId,
        conversationId,
      });
    });

    // ─── Send a new message ──────────────────────────────────────────────
    socket.on("send_message", async (data) => {
      if (!checkRateLimit(socket)) return;

      const { conversationId, content, attachments } = data;
      if (!isValidConversationId(conversationId) || !content?.trim()) {
        return socket.emit("error", { message: "Missing conversation ID or content." });
      }

      try {
        // Save message to database
        const message = await Message.create({
          sender: userId,
          conversation: conversationId,
          content: content.trim(),
          attachments: attachments || [],
        });

        // Populate sender info for the broadcast
        const populatedMessage = await Message.findById(message._id)
          .populate("sender", "name avatar")
          .lean();

        // Broadcast to everyone in the conversation (including sender)
        io.to(`conv:${conversationId}`).emit("new_message", {
          ...populatedMessage,
          conversationId,
        });
      } catch (err) {
        logger.error(`Error sending message: ${err.message}`);
        socket.emit("error", { message: "Failed to send message." });
      }
    });

    // ─── Disconnect handler ──────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      logger.info(`Socket disconnected: ${userId} (reason: ${reason})`);
      socket.broadcast.emit("user_offline", { userId });
    });
  });

  return io;
};

/**
 * Get the Socket.IO instance (for use in other parts of the app)
 */
const getIO = () => {
  if (!io) throw new Error("Socket.IO not initialized.");
  return io;
};

module.exports = { initSocket, getIO };