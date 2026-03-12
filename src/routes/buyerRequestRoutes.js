const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth");
const {
  createRequest,
  getRequests,
  getRequest,
  getMyRequests,
  updateRequest,
  closeRequest,
} = require("../controllers/buyerRequestController");

router.get("/", protect, getRequests);
router.get("/mine", protect, restrictTo("client"), getMyRequests);
router.get("/:id", protect, getRequest);
router.post("/", protect, restrictTo("client"), createRequest);
router.patch("/:id", protect, restrictTo("client"), updateRequest);
router.patch("/:id/close", protect, restrictTo("client"), closeRequest);

module.exports = router;
