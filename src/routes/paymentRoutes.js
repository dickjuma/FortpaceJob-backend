const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth");
const {
  createPaymentIntent,
  createMpesaPayment,
  verifyMpesaPayment,
  mpesaCallback,
  stripeWebhook,
  releasePayment,
  deposit,
  connectStripe,
  getStripeConnectStatus,
  requestRefund,
  getEscrowBalance,
} = require("../controllers/paymentController");

// Webhooks (raw body)
router.post("/webhook/stripe", stripeWebhook);
router.post("/webhook/mpesa", mpesaCallback);

// Protected routes
router.post("/intent", protect, restrictTo("client"), createPaymentIntent);
router.post("/mpesa", protect, restrictTo("client"), createMpesaPayment);
router.post("/mpesa/verify", protect, verifyMpesaPayment);
router.post("/release/:contractId", protect, restrictTo("client"), releasePayment);
router.post("/refund", protect, restrictTo("client"), requestRefund);

// Wallet deposit
router.post("/deposit", protect, deposit);

// Stripe Connect (for freelancers)
router.post("/connect/stripe", protect, restrictTo("freelancer"), connectStripe);
router.get("/connect/status", protect, getStripeConnectStatus);

// Escrow balance
router.get("/escrow/balance", protect, getEscrowBalance);

module.exports = router;
