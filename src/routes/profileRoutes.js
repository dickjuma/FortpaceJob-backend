const express = require("express");
const { protect } = require("../middlewares/auth");
const { uploadAvatar, uploadPortfolio, uploadVideo } = require("../middlewares/upload");
const controller = require("../controllers/profileController");

const router = express.Router();

router.get("/me", protect, controller.getMyProfile);
router.patch("/me", protect, controller.updateMyProfile);
router.post("/me/avatar", protect, uploadAvatar.single("avatar"), controller.uploadAvatar);
router.post("/me/company-logo", protect, uploadAvatar.single("companyLogo"), controller.uploadCompanyLogo);
router.post("/me/intro-video", protect, uploadVideo.single("introVideo"), controller.uploadIntroVideo);
router.post("/me/portfolio", protect, uploadPortfolio.array("files", 10), controller.uploadPortfolio);

module.exports = router;
