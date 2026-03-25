const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Contract = require("../../models/Contract");
const Wallet = require("../../models/Wallet");
const Transaction = require("../../models/Transaction");
const Notification = require("../../models/Notification");
const { mpesa, stripeConnect, escrow } = require("../../payments");
const logger = require("../../utils/logger");

// ─── Create Stripe Payment Intent (escrow) ────────────────────────────────────
exports.createPaymentIntent = async (req, res, next) => {
  try {
    const { contractId } = req.body;

    const contract = await Contract.findOne({ _id: contractId, client: req.user._id });
    if (!contract) return res.status(404).json({ success: false, message: "Contract not found." });
    if (contract.paymentStatus !== "pending") {
      return res.status(400).json({ success: false, message: "Payment already processed." });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(contract.totalAmount * 100), // cents
      currency: contract.currency.toLowerCase(),
      metadata: {
        contractId: contract._id.toString(),
        clientId: req.user._id.toString(),
        freelancerId: contract.freelancer.toString(),
      },
    });

    contract.stripePaymentIntentId = paymentIntent.id;
    await contract.save({ validateBeforeSave: false });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Create M-Pesa Payment Request ─────────────────────────────────────────────
exports.createMpesaPayment = async (req, res, next) => {
  try {
    const { contractId, phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: "Phone number is required." });
    }

    const contract = await Contract.findOne({ _id: contractId, client: req.user._id });
    if (!contract) return res.status(404).json({ success: false, message: "Contract not found." });
    if (contract.paymentStatus !== "pending") {
      return res.status(400).json({ success: false, message: "Payment already processed." });
    }

    // Format phone number (remove + and leading zeros)
    const formattedPhone = phoneNumber.replace(/^\+?254/, "254").replace(/^0/, "");

    const result = await mpesa.stkPush(
      formattedPhone,
      contract.totalAmount,
      contract._id.toString(),
      `Payment for contract: ${contract.title}`
    );

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    // Store checkout request ID for verification
    contract.stripePaymentIntentId = result.checkoutRequestId; // reusing field for M-Pesa
    await contract.save({ validateBeforeSave: false });

    // Create pending transaction
    const wallet = await Wallet.findOne({ user: req.user._id });
    await Transaction.create({
      wallet: wallet?._id,
      user: req.user._id,
      contract: contract._id,
      type: "escrow_hold",
      amount: contract.totalAmount,
      currency: contract.currency,
      description: `M-Pesa payment initiated for contract: ${contract.title}`,
      status: "pending",
      mpesaCheckoutId: result.checkoutRequestId,
    });

    res.json({
      success: true,
      message: "Payment request sent to your phone.",
      checkoutRequestId: result.checkoutRequestId,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Verify M-Pesa Payment ────────────────────────────────────────────────────
exports.verifyMpesaPayment = async (req, res, next) => {
  try {
    const { checkoutRequestId } = req.body;

    if (!checkoutRequestId) {
      return res.status(400).json({ success: false, message: "Checkout request ID is required." });
    }

    const result = await mpesa.queryStkStatus(checkoutRequestId);

    if (result.success && result.resultCode === 0) {
      // Find and update transaction
      const transaction = await Transaction.findOne({ mpesaCheckoutId: checkoutRequestId });
      if (transaction && transaction.status === "pending") {
        transaction.status = "completed";
        transaction.reference = result.receiptNumber;
        await transaction.save();

        // Update contract
        const contract = await Contract.findById(transaction.contract);
        if (contract) {
          await escrow.holdInEscrow(contract, checkoutRequestId);
        }
      }

      return res.json({ success: true, message: "Payment verified.", verified: true });
    }

    res.json({ success: true, message: "Payment not yet completed.", verified: false });
  } catch (error) {
    next(error);
  }
};

// ─── M-Pesa Callback (for webhooks) ───────────────────────────────────────────
exports.mpesaCallback = async (req, res, next) => {
  try {
    const callbackData = req.body;
    await mpesa.handleMpesaCallback(callbackData);
    res.json({ received: true });
  } catch (error) {
    next(error);
  }
};

// ─── Stripe Webhook ───────────────────────────────────────────────────────────
exports.stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error(`Stripe webhook error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const contract = await Contract.findOne({ stripePaymentIntentId: pi.id });
        if (contract) {
          await escrow.holdInEscrow(contract, pi.id);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        logger.warn(`Payment failed for intent: ${pi.id}`);
        break;
      }

      default:
        logger.info(`Unhandled Stripe event: ${event.type}`);
    }
  } catch (err) {
    logger.error(`Webhook handler error: ${err.message}`);
  }

  res.json({ received: true });
};

// ─── Deposit Funds (Add money to wallet) ──────────────────────────────────────
exports.deposit = async (req, res, next) => {
  try {
    const { amount, method } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Valid amount required." });
    }

    if (!["stripe", "mpesa"].includes(method)) {
      return res.status(400).json({ success: false, message: "Invalid payment method." });
    }

    let transaction;

    if (method === "stripe") {
      // Create Stripe payment intent for deposit
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        metadata: { userId: req.user._id.toString(), type: "deposit" },
      });

      return res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } else if (method === "mpesa") {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ success: false, message: "Phone number required for M-Pesa." });
      }

      const formattedPhone = phoneNumber.replace(/^\+?254/, "254").replace(/^0/, "");
      
      const result = await mpesa.stkPush(
        formattedPhone,
        amount,
        `DEPOSIT-${req.user._id}`,
        "Wallet deposit"
      );

      if (!result.success) {
        return res.status(400).json({ success: false, message: result.message });
      }

      const wallet = await Wallet.findOne({ user: req.user._id });
      transaction = await Transaction.create({
        wallet: wallet?._id,
        user: req.user._id,
        type: "credit",
        amount,
        currency: "USD",
        description: "Wallet deposit (M-Pesa)",
        status: "pending",
        mpesaCheckoutId: result.checkoutRequestId,
      });

      return res.json({
        success: true,
        message: "Payment request sent to your phone.",
        checkoutRequestId: result.checkoutRequestId,
        transactionId: transaction._id,
      });
    }
  } catch (error) {
    next(error);
  }
};

// ─── Connect Stripe Account (For Freelancers) ────────────────────────────────
exports.connectStripe = async (req, res, next) => {
  try {
    const { refreshUrl, returnUrl } = req.body;

    const result = await stripeConnect.createAccountLink(
      req.user._id,
      refreshUrl,
      returnUrl
    );

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    res.json({ success: true, url: result.url });
  } catch (error) {
    next(error);
  }
};

// ─── Get Stripe Connect Status ───────────────────────────────────────────────
exports.getStripeConnectStatus = async (req, res, next) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });
    
    if (!wallet?.stripeAccountId) {
      return res.json({
        success: true,
        connected: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      });
    }

    const status = await stripeConnect.checkAccountStatus(wallet.stripeAccountId);
    res.json({ success: true, ...status, connected: true });
  } catch (error) {
    next(error);
  }
};

// ─── Release payment to freelancer (after contract completion) ────────────────
exports.releasePayment = async (req, res, next) => {
  try {
    const contract = await Contract.findOne({
      _id: req.params.contractId,
      client: req.user._id,
      status: "completed",
      paymentStatus: "escrowed",
    });

    if (!contract) return res.status(404).json({ success: false, message: "Contract not found or payment already released." });

    // Use escrow service to release payment
    const result = await escrow.releaseEscrow(req.params.contractId, req.user._id);

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    res.json({ success: true, message: "Payment released to freelancer.", amount: result.amount });
  } catch (error) {
    next(error);
  }
};

// ─── Request Refund ──────────────────────────────────────────────────────────
exports.requestRefund = async (req, res, next) => {
  try {
    const { contractId, reason } = req.body;

    const contract = await Contract.findOne({
      _id: contractId,
      client: req.user._id,
      paymentStatus: "escrowed",
    });

    if (!contract) {
      return res.status(404).json({ success: false, message: "Contract not found or not eligible for refund." });
    }

    // Use escrow service to refund
    const result = await escrow.refundEscrow(contractId, reason || "Client requested refund", req.user._id);

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    res.json({ success: true, message: "Refund processed.", amount: result.amount });
  } catch (error) {
    next(error);
  }
};

// ─── Get Escrow Balance ───────────────────────────────────────────────────────
exports.getEscrowBalance = async (req, res, next) => {
  try {
    const result = await escrow.getEscrowBalance(req.user._id);
    
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    res.json({
      success: true,
      heldAsClient: result.heldAsClient,
      heldForFreelancer: result.heldForFreelancer,
    });
  } catch (error) {
    next(error);
  }
};

