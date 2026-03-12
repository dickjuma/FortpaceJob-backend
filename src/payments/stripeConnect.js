/**
 * Stripe Connect Integration for Forte Platform
 * Handles freelancer payouts and connected accounts
 */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const logger = require("../utils/logger");

// Create a Stripe Connect account for a freelancer
exports.createConnectAccount = async (user) => {
  try {
    // Check if user already has a Stripe account
    const wallet = await Wallet.findOne({ user: user._id });
    if (wallet?.stripeAccountId) {
      return { success: true, accountId: wallet.stripeAccountId };
    }

    // Create new Stripe Connect account
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: "individual",
      individual: {
        email: user.email,
        first_name: user.name?.split(" ")[0] || "",
        last_name: user.name?.split(" ").slice(1).join(" ") || "",
      },
    });

    // Save Stripe account ID to wallet
    await Wallet.findOneAndUpdate(
      { user: user._id },
      { stripeAccountId: account.id },
      { upsert: true }
    );

    logger.info(`Stripe Connect account created: ${account.id}`);
    return { success: true, accountId: account.id };
  } catch (error) {
    logger.error(`Stripe Connect creation error: ${error.message}`);
    return { success: false, message: error.message };
  }
};

// Generate account link for onboarding
exports.createAccountLink = async (userId, refreshUrl, returnUrl) => {
  try {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet?.stripeAccountId) {
      // Create account first
      const user = await User.findById(userId);
      const result = await exports.createConnectAccount(user);
      if (!result.success) {
        return { success: false, message: result.message };
      }
    }

    const accountLink = await stripe.accountLinks.create({
      account: wallet.stripeAccountId,
      refresh_url: refreshUrl || `${process.env.CLIENT_URL}/wallet?refresh=true`,
      return_url: returnUrl || `${process.env.CLIENT_URL}/wallet?success=true`,
      type: "account_onboarding",
    });

    return { success: true, url: accountLink.url };
  } catch (error) {
    logger.error(`Stripe account link error: ${error.message}`);
    return { success: false, message: error.message };
  }
};

// Check if Stripe account is fully onboarded
exports.checkAccountStatus = async (stripeAccountId) => {
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    return {
      success: true,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    };
  } catch (error) {
    logger.error(`Stripe account status error: ${error.message}`);
    return { success: false, message: error.message };
  }
};

// Create payout to freelancer's Stripe account
exports.createPayout = async (wallet, amount, description) => {
  try {
    if (!wallet.stripeAccountId) {
      return { success: false, message: "No Stripe account connected" };
    }

    // Check account status
    const status = await exports.checkAccountStatus(wallet.stripeAccountId);
    if (!status.payoutsEnabled) {
      return { success: false, message: "Payouts not enabled on Stripe account" };
    }

    // Create transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), // cents
      currency: wallet.currency?.toLowerCase() || "usd",
      destination: wallet.stripeAccountId,
      description: description || "Forte Platform Payout",
    });

    logger.info(`Stripe transfer created: ${transfer.id}`);
    return { success: true, transferId: transfer.id };
  } catch (error) {
    logger.error(`Stripe payout error: ${error.message}`);
    return { success: false, message: error.message };
  }
};

// Process withdrawal via Stripe Connect
exports.processWithdrawal = async (userId, amount) => {
  try {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return { success: false, message: "Wallet not found" };
    }

    if (wallet.balance < amount) {
      return { success: false, message: "Insufficient balance" };
    }

    if (!wallet.stripeAccountId) {
      return { success: false, message: "No Stripe account connected" };
    }

    // Create payout
    const payoutResult = await exports.createPayout(
      wallet,
      amount,
      `Withdrawal for user ${userId}`
    );

    if (!payoutResult.success) {
      return payoutResult;
    }

    // Deduct from wallet
    wallet.balance -= amount;
    wallet.totalWithdrawn += amount;
    await wallet.save();

    // Create transaction record
    await Transaction.create({
      wallet: wallet._id,
      user: userId,
      type: "withdrawal",
      amount,
      currency: wallet.currency,
      description: "Withdrawal via Stripe Connect",
      status: "completed",
      stripeTransferId: payoutResult.transferId,
      balanceBefore: wallet.balance + amount,
      balanceAfter: wallet.balance,
    });

    return { success: true, transferId: payoutResult.transferId };
  } catch (error) {
    logger.error(`Process withdrawal error: ${error.message}`);
    return { success: false, message: error.message };
  }
};

// Get Stripe dashboard login link
exports.getDashboardLink = async (stripeAccountId) => {
  try {
    const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
    return { success: true, url: loginLink.url };
  } catch (error) {
    logger.error(`Stripe dashboard link error: ${error.message}`);
    return { success: false, message: error.message };
  }
};

// Create payment intent with Stripe Connect (for client payments)
exports.createPaymentIntent = async (amount, currency, contractId, clientId, freelancerStripeAccountId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency?.toLowerCase() || "usd",
      metadata: {
        contractId,
        clientId,
        type: "escrow_payment",
      },
      // For direct charge to platform (we handle payout separately)
      capture_method: "manual",
    });

    return { success: true, paymentIntent };
  } catch (error) {
    logger.error(`Stripe payment intent error: ${error.message}`);
    return { success: false, message: error.message };
  }
};

// Verify webhook signature
exports.verifyWebhook = (payload, signature) => {
  try {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    logger.error(`Webhook verification error: ${error.message}`);
    return null;
  }
};
