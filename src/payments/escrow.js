/**
 * Escrow Service for Forte Platform
 * Handles secure payment holding and release logic
 */

const Contract = require("../models/Contract");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const Notification = require("../models/Notification");
const logger = require("../utils/logger");

// Platform fee percentage (10%)
const PLATFORM_FEE_PERCENT = 10;

/**
 * Calculate platform fee and freelancer earnings
 */
exports.calculateAmounts = (totalAmount) => {
  const platformFee = parseFloat((totalAmount * (PLATFORM_FEE_PERCENT / 100)).toFixed(2));
  const freelancerEarnings = parseFloat((totalAmount - platformFee).toFixed(2));
  return { platformFee, freelancerEarnings, totalAmount };
};

/**
 * Hold funds in escrow (called after successful payment)
 */
exports.holdInEscrow = async (contract, paymentReference) => {
  try {
    // Update contract payment status
    contract.paymentStatus = "escrowed";
    contract.status = "active";
    contract.startDate = new Date();
    contract.stripePaymentIntentId = paymentReference;
    await contract.save();

    // Create escrow transaction
    const clientWallet = await Wallet.findOne({ user: contract.client });
    await Transaction.create({
      wallet: clientWallet?._id,
      user: contract.client,
      contract: contract._id,
      type: "escrow_hold",
      amount: contract.totalAmount,
      currency: contract.currency,
      description: `Funds held in escrow for contract: ${contract.title}`,
      status: "completed",
      reference: paymentReference,
    });

    // Update client wallet pending balance
    if (clientWallet) {
      clientWallet.pendingBalance += contract.totalAmount;
      await clientWallet.save();
    }

    // Notify freelancer
    await Notification.create({
      recipient: contract.freelancer,
      type: "contract_started",
      title: "Contract Started!",
      body: `Payment received. Contract "${contract.title}" is now active.`,
      link: `/contracts/${contract._id}`,
      relatedContract: contract._id,
    });

    logger.info(`Escrow held for contract ${contract._id}: ${contract.totalAmount}`);
    return { success: true };
  } catch (error) {
    logger.error(`Escrow hold error: ${error.message}`);
    return { success: false, message: error.message };
  }
};

/**
 * Release escrow to freelancer (after work approval)
 */
exports.releaseEscrow = async (contractId, releasedBy) => {
  try {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      return { success: false, message: "Contract not found" };
    }

    if (contract.paymentStatus !== "escrowed") {
      return { success: false, message: "No escrowed funds to release" };
    }

    if (contract.status !== "completed") {
      return { success: false, message: "Contract must be completed first" };
    }

    // Credit freelancer wallet
    const freelancerWallet = await Wallet.findOneAndUpdate(
      { user: contract.freelancer },
      {
        $inc: {
          balance: contract.freelancerEarnings,
          totalEarned: contract.freelancerEarnings,
        },
        $dec: { pendingBalance: contract.totalAmount },
      },
      { new: true }
    );

    // Create release transaction
    await Transaction.create({
      wallet: freelancerWallet?._id,
      user: contract.freelancer,
      contract: contract._id,
      type: "escrow_release",
      amount: contract.freelancerEarnings,
      currency: contract.currency,
      description: `Earnings released for contract: ${contract.title}`,
      status: "completed",
    });

    // Create platform fee transaction
    await Transaction.create({
      wallet: null, // Platform wallet
      user: contract.client,
      contract: contract._id,
      type: "platform_fee",
      amount: contract.platformFee,
      currency: contract.currency,
      description: `Platform fee for contract: ${contract.title}`,
      status: "completed",
    });

    // Update contract
    contract.paymentStatus = "released";
    await contract.save();

    // Notify freelancer
    await Notification.create({
      recipient: contract.freelancer,
      type: "payment_released",
      title: "Payment Released!",
      body: `${contract.freelancerEarnings} ${contract.currency} has been added to your wallet.`,
      link: `/wallet`,
      relatedContract: contract._id,
    });

    logger.info(`Escrow released for contract ${contract._id}: ${contract.freelancerEarnings}`);
    return { success: true, amount: contract.freelancerEarnings };
  } catch (error) {
    logger.error(`Escrow release error: ${error.message}`);
    return { success: false, message: error.message };
  }
};

/**
 * Refund escrow to client (cancellation or dispute)
 */
exports.refundEscrow = async (contractId, reason, refundedBy) => {
  try {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      return { success: false, message: "Contract not found" };
    }

    if (contract.paymentStatus !== "escrowed") {
      return { success: false, message: "No escrowed funds to refund" };
    }

    if (contract.paymentStatus === "refunded") {
      return { success: false, message: "Funds already refunded" };
    }

    // Update client wallet (refund)
    const clientWallet = await Wallet.findOneAndUpdate(
      { user: contract.client },
      {
        $inc: { balance: contract.totalAmount },
        $dec: { pendingBalance: contract.totalAmount },
      },
      { new: true }
    );

    // Create refund transaction
    await Transaction.create({
      wallet: clientWallet?._id,
      user: contract.client,
      contract: contract._id,
      type: "refund",
      amount: contract.totalAmount,
      currency: contract.currency,
      description: `Refund for contract: ${contract.title}. Reason: ${reason}`,
      status: "completed",
    });

    // Update contract
    contract.paymentStatus = "refunded";
    contract.status = "cancelled";
    contract.cancellationReason = reason;
    await contract.save();

    // Notify both parties
    await Notification.create({
      recipient: contract.client,
      type: "payment_refunded",
      title: "Payment Refunded",
      body: `Your payment of ${contract.totalAmount} ${contract.currency} has been refunded.`,
      link: `/contracts/${contract._id}`,
      relatedContract: contract._id,
    });

    await Notification.create({
      recipient: contract.freelancer,
      type: "contract_cancelled",
      title: "Contract Cancelled",
      body: `Contract "${contract.title}" has been cancelled. Escrow has been refunded to client.`,
      link: `/contracts/${contract._id}`,
      relatedContract: contract._id,
    });

    logger.info(`Escrow refunded for contract ${contract._id}: ${contract.totalAmount}`);
    return { success: true, amount: contract.totalAmount };
  } catch (error) {
    logger.error(`Escrow refund error: ${error.message}`);
    return { success: false, message: error.message };
  }
};

/**
 * Get escrow balance for a user
 */
exports.getEscrowBalance = async (userId) => {
  try {
    const contracts = await Contract.find({
      $or: [{ client: userId }, { freelancer: userId }],
      paymentStatus: "escrowed",
      status: { $in: ["active", "delivered", "revision_requested"] },
    });

    let heldAsClient = 0;
    let heldForFreelancer = 0;

    contracts.forEach((contract) => {
      if (contract.client.toString() === userId.toString()) {
        heldAsClient += contract.totalAmount;
      } else if (contract.freelancer.toString() === userId.toString()) {
        heldForFreelancer += contract.totalAmount;
      }
    });

    return {
      success: true,
      heldAsClient,
      heldForFreelancer,
    };
  } catch (error) {
    logger.error(`Get escrow balance error: ${error.message}`);
    return { success: false, message: error.message };
  }
};
