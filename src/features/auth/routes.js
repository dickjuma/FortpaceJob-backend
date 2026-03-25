const express = require("express");
const router = express.Router();
const authController = require("./controller");
const { protect } = require("../../middlewares/auth");

// Register
router.post("/register", authController.register);

// OTP Verification
router.post("/verify-otp", authController.verifyOTP);
router.post("/verify-phone-otp", authController.verifyPhoneOTP);
router.post("/verify-email-otp", authController.verifyEmailOTP);
router.post("/resend-otp", authController.resendOTP);

// Login
router.post("/login", authController.login);
router.post("/login/phone", authController.loginWithPhoneOTP);
router.post("/login/send-otp", authController.sendLoginOTP);

// Complete Registration (deprecated but kept for compatibility)
router.post("/complete-registration", authController.completeRegistration);

// Google OAuth
router.get("/google", authController.googleAuthStart);
router.get("/google/callback", authController.googleAuthCallback);

// Token Management
router.post("/refresh-token", authController.refreshToken);

// Password Management
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

// User Session
router.post("/logout", protect, authController.logout);
router.get("/me", protect, authController.getMe);

// Test FluxSMS endpoint
router.post("/test-fluxsms", async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: "phone and message are required" });
    }
    const { sendSMS } = require("../../utils/sms");
    const result = await sendSMS({ to: phone, message });
    if (result.status === "success") {
      return res.json({
        success: true,
        messageId: result.messageId,
        mobile: result.mobile,
      });
    } else {
      return res.status(500).json({ error: result.error || "Unknown error" });
    }
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;

