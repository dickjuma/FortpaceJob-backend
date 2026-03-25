const express = require("express");
const router = express.Router();
const { protect, optionalAuth } = require("../../middlewares/auth");
const { uploadPortfolio } = require("../../middlewares/upload");
const {
  createGig,
  getGigs,
  getGig,
  getMyGigs,
  updateGig,
  deleteGig,
  toggleGigStatus,
} = require("./controller");

router.get("/", optionalAuth, getGigs);
router.get("/mine", protect, getMyGigs);
router.get("/:id", optionalAuth, getGig);
router.post("/", protect, uploadPortfolio.array("images", 5), createGig);
router.patch("/:id", protect, uploadPortfolio.array("images", 5), updateGig);
router.delete("/:id", protect, deleteGig);
router.patch("/:id/toggle", protect, toggleGigStatus);

module.exports = router;

