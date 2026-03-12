const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/auth");
const {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
  verifyOTP,
  resendOTP,
  verifyEmailOTP,
  verifyPhoneOTP,
  completeRegistration,
  sendLoginOTP,
  loginWithPhoneOTP,
  googleAuthStart,
  googleAuthCallback,
} = require("../controllers/authController");

router.post("/register", register);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);
router.post("/verify-email-otp", verifyEmailOTP);
router.post("/verify-phone-otp", verifyPhoneOTP);
router.post("/complete-registration", completeRegistration);
router.post("/login", login);
router.post("/login/send-otp", sendLoginOTP);
router.post("/login/phone", loginWithPhoneOTP);
router.get("/google", googleAuthStart);
router.get("/google/callback", googleAuthCallback);
router.post("/refresh-token", refreshToken);
router.post("/logout", protect, logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", protect, getMe);

module.exports = router;
