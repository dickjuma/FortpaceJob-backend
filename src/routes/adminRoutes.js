const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth");
const {
  getDashboardStats,
  getUsers,
  toggleBanUser,
  reviewGig,
  getContracts,
  resolveDispute,
} = require("../controllers/adminController");

// All admin routes require authentication + admin role
router.use(protect, restrictTo("admin"));

router.get("/stats", getDashboardStats);
router.get("/users", getUsers);
router.patch("/users/:id/ban", toggleBanUser);
router.patch("/gigs/:id/review", reviewGig);
router.get("/contracts", getContracts);
router.patch("/contracts/:id/dispute", resolveDispute);

module.exports = router;
