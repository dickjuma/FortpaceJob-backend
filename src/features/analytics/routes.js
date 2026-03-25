const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../../middlewares/auth");
const {
  getPlatformOverview,
  getRevenueAnalytics,
  getUserAnalytics,
  getContractAnalytics,
  getDisputeAnalytics,
  getSubscriptionAnalytics,
  getMyPerformance,
  getUserPerformance,
} = require("./controller");

// Admin routes (all require admin role)
router.get("/platform", protect, restrictTo("admin"), getPlatformOverview);
router.get("/revenue", protect, restrictTo("admin"), getRevenueAnalytics);
router.get("/users", protect, restrictTo("admin"), getUserAnalytics);
router.get("/contracts", protect, restrictTo("admin"), getContractAnalytics);
router.get("/disputes", protect, restrictTo("admin"), getDisputeAnalytics);
router.get("/subscriptions", protect, restrictTo("admin"), getSubscriptionAnalytics);
router.get("/user/:userId", protect, restrictTo("admin"), getUserPerformance);

// Freelancer routes
router.get("/my-performance", protect, getMyPerformance);

module.exports = router;

