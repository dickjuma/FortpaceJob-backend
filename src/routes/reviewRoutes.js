const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/auth");
const {
  submitReview,
  getUserReviews,
  getGigReviews,
  respondToReview,
} = require("../controllers/reviewController");

router.post("/", protect, submitReview);
router.get("/user/:userId", getUserReviews);
router.get("/gig/:gigId", getGigReviews);
router.patch("/:id/respond", protect, respondToReview);

module.exports = router;
