const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { errorHandler, notFound } = require("./middlewares/errorHandler");
const { getAllowedOrigins } = require("./config/origins");

// Route imports
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const gigRoutes = require("./routes/gigRoutes");
const proposalRoutes = require("./routes/proposalRoutes");
const buyerRequestRoutes = require("./routes/buyerRequestRoutes");
const contractRoutes = require("./routes/contractRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const messageRoutes = require("./routes/messageRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const walletRoutes = require("./routes/walletRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const disputeRoutes = require("./routes/disputeRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const adminRoutes = require("./routes/adminRoutes");
const graphqlRoutes = require("./routes/graphqlRoutes");
const profileRoutes = require("./routes/profileRoutes");

const app = express();

// ─── Global Middlewares ───────────────────────────────────────────────────────
const allowedOrigins = getAllowedOrigins();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));

// Raw body for Stripe webhooks (must come before express.json)
app.use("/api/payments/webhook/stripe", express.raw({ type: "application/json" }));
app.use("/api/payments/webhook/mpesa", express.json({ type: "application/json" }));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), service: "Forte API" });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/gigs", gigRoutes);
app.use("/api/proposals", proposalRoutes);
app.use("/api/buyer-requests", buyerRequestRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/graphql", graphqlRoutes);
app.use("/api/profile", profileRoutes);

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;

