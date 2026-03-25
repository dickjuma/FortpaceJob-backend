const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../../middlewares/auth");
const {
  openDispute,
  getMyDisputes,
  getDispute,
  addMessage,
  resolveDispute,
  getAllDisputes,
} = require("./controller");

// User routes
router.post("/", protect, openDispute);
router.get("/", protect, getMyDisputes);
router.get("/all", protect, restrictTo("admin"), getAllDisputes);
router.get("/:id", protect, getDispute);
router.post("/:id/messages", protect, addMessage);

// Admin routes
router.patch("/:id/resolve", protect, restrictTo("admin"), resolveDispute);

module.exports = router;

