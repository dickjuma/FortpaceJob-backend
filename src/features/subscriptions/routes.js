const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../../middlewares/auth");
const {
  getPlans,
  getMySubscription,
  createSubscription,
  handleWebhook,
  cancelSubscription,
  checkFeatureAccess,
  getUsageStats,
} = require("./controller");

// Webhook (raw body)
router.post("/webhook", express.raw({ type: "application/json" }), handleWebhook);

// Public
router.get("/plans", getPlans);

// Protected
router.get("/my", protect, getMySubscription);
router.post("/create", protect, createSubscription);
router.post("/cancel", protect, cancelSubscription);
router.get("/usage", protect, getUsageStats);
router.get("/feature/:feature", protect, checkFeatureAccess);

module.exports = router;

