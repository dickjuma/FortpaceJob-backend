const express = require("express");
const router = express.Router();
const { protect } = require("../../middlewares/auth");
const { uploadAvatar, uploadPortfolio } = require("../../middlewares/upload");
const {
  getProfile,
  updateProfile,
  searchTalent,
  changePassword,
  uploadPortfolio: uploadPortfolioCtrl,
  deletePortfolioItem,
  getMyStats,
} = require("./controller");

// Public
router.get("/search", searchTalent);
router.get("/:id", getProfile);

// Protected
router.patch("/me/profile", protect, uploadAvatar.single("avatar"), updateProfile);
router.patch("/me/password", protect, changePassword);
router.get("/me/stats", protect, getMyStats);
router.post("/me/portfolio", protect, uploadPortfolio.array("files", 10), uploadPortfolioCtrl);
router.delete("/me/portfolio", protect, deletePortfolioItem);

module.exports = router;

