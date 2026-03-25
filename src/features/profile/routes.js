const express = require("express");
const { protect } = require("../../middlewares/auth");
const { uploadAvatar, uploadPortfolio, uploadVideo } = require("../../middlewares/upload");
const controller = require("./controller");

const router = express.Router();

// New Profile Completion Routes
router.put("/", protect, controller.updateProfile);
router.get("/missing-fields", protect, controller.getMissingFields);

router.get("/me", protect, controller.getMyProfile);
router.patch("/me", protect, controller.updateMyProfile);
router.post("/me/avatar", protect, uploadAvatar.single("avatar"), controller.uploadAvatar);
router.post("/me/cover-photo", protect, uploadAvatar.single("coverPhoto"), controller.uploadCoverPhoto);
router.post("/me/company-logo", protect, uploadAvatar.single("companyLogo"), controller.uploadCompanyLogo);
router.post("/me/intro-video", protect, uploadVideo.single("introVideo"), controller.uploadIntroVideo);
router.post("/me/portfolio", protect, uploadPortfolio.array("files", 10), controller.uploadPortfolio);
router.patch("/me/portfolio/:index", protect, controller.updatePortfolioItem);
router.delete("/me/portfolio/:index", protect, controller.deletePortfolioItem);

module.exports = router;

