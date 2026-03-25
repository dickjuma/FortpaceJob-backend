"use strict";

const mongoose = require("mongoose");

const Wallet      = require("./model");
const Transaction = require("../transactions/model");
const payments    = require("../../payments");
const logger      = require("../../utils/logger");

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve which payment provider to use for a given wallet owner.
 * Priority: explicit provider arg → first verified linked account → first linked account.
 *
 * @param {Object} wallet
 * @param {string} [preferredProvider]
 * @returns {{ provider: string, identifier: string }}
 */
function resolveProvider(wallet, preferredProvider) {
  if (preferredProvider) {
    const account = wallet.getLinkedAccount(preferredProvider);
    if (!account) {
      throw new Error(
        `Wallet has no linked account for provider "${preferredProvider}"`
      );
    }
    return { provider: preferredProvider, identifier: account.identifier };
  }

  // Auto-select: verified accounts first, then any
  const sorted = [...wallet.linkedAccounts].sort((a, b) =>
    (b.isVerified ? 1 : 0) - (a.isVerified ? 1 : 0)
  );

  if (!sorted.length) {
    throw new Error("Wallet has no linked payment accounts");
  }

  return { provider: sorted[0].provider, identifier: sorted[0].identifier };
}

// ─── Deposit (Collection) ─────────────────────────────────────────────────────

/**
 * Initiate a deposit from a user's phone / card into their wallet.
 *
 * @param {string}  ownerId           User / owner ID
 * @param {number}  amount
 * @param {string}  [provider]        Force a specific provider; auto-selected if omitted
 * @param {string}  [description]
 * @returns {Promise<{success: boolean, transactionId?: string, clientSecret?: string, message?: string}>}
 */
exports.deposit = async (ownerId, amount, provider, description = "Wallet deposit") => {
  const wallet = await Wallet.findByOwner(ownerId);

  if (wallet.status !== "active") {
    return { success: false, message: `Wallet is ${wallet.status}` };
  }

  const { provider: resolvedProvider, identifier } = resolveProvider(wallet, provider);
  const reference = `DEP-${ownerId}-${Date.now()}`;

  // Create a pending transaction record before calling the provider
  const transaction = await Transaction.create({
    owner:   ownerId,
    wallet:  wallet._id,
    type:    "credit",
    amount,
    currency: wallet.currency,
    provider: resolvedProvider,
    status:  "pending",
    reference,
    description,
  });

  const result = await payments.initiatePayment(
    resolvedProvider, identifier, amount, reference, description
  );

  if (!result.success) {
    await Transaction.findByIdAndUpdate(transaction._id, { status: "failed", failureReason: result.message });
    return { success: false, message: result.message };
  }

  // Store provider-side IDs for callback matching
  await Transaction.findByIdAndUpdate(transaction._id, {
    [`${resolvedProvider}TransactionId`]: result.transactionId,
    checkoutRequestId:                    result.checkoutRequestId ?? result.transactionId,
    stripePaymentIntentId:                result.transactionId?.startsWith("pi_") ? result.transactionId : undefined,
  });

  logger.info(`Deposit initiated | owner=${ownerId} provider=${resolvedProvider} amount=${amount} txn=${result.transactionId}`);
  return { ...result, internalId: transaction._id };
};

// ─── Withdraw (B2C Payout) ────────────────────────────────────────────────────

/**
 * Withdraw funds from the wallet, paying out via the user's linked account.
 *
 * @param {string}  ownerId
 * @param {number}  amount
 * @param {string}  [provider]
 * @param {string}  [occasion]   Reason / command ID
 * @returns {Promise<{success: boolean, conversationId?: string, message?: string}>}
 */
exports.withdraw = async (ownerId, amount, provider, occasion = "Withdrawal") => {
  const wallet = await Wallet.findByOwner(ownerId);

  if (wallet.status !== "active") {
    return { success: false, message: `Wallet is ${wallet.status}` };
  }

  if (amount > wallet.limits.singleDebit) {
    return { success: false, message: `Amount exceeds single-transaction limit of ${wallet.limits.singleDebit}` };
  }

  // Check daily debit total
  const dayStart   = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dailyTotal = await Transaction.aggregate([
    {
      $match: {
        wallet:    wallet._id,
        type:      "debit",
        status:    "completed",
        createdAt: { $gte: dayStart },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const todayDebited = dailyTotal[0]?.total ?? 0;

  if (todayDebited + amount > wallet.limits.dailyDebit) {
    return {
      success: false,
      message: `Daily debit limit of ${wallet.limits.dailyDebit} would be exceeded (used: ${todayDebited})`,
    };
  }

  const { provider: resolvedProvider, identifier } = resolveProvider(wallet, provider);
  const reference = `WDR-${ownerId}-${Date.now()}`;

  // Reserve balance atomically
  const session = await mongoose.startSession();
  let transaction;

  try {
    await session.withTransaction(async () => {
      const lockedWallet = await Wallet.findById(wallet._id).session(session);
      lockedWallet.debit(amount, resolvedProvider, null, occasion); // throws if insufficient
      await lockedWallet.save();

      transaction = await Transaction.create(
        [{
          owner:    ownerId,
          wallet:   wallet._id,
          type:     "debit",
          amount,
          currency: wallet.currency,
          provider: resolvedProvider,
          status:   "pending",
          reference,
          description: occasion,
        }],
        { session }
      );
      transaction = transaction[0];
    });
  } finally {
    session.endSession();
  }

  // Initiate the payout
  const result = await payments.b2cPayout(resolvedProvider, identifier, amount, occasion, transaction._id.toString());

  if (!result.success) {
    // Reverse the balance deduction
    const lockedWallet = await Wallet.findById(wallet._id);
    lockedWallet.credit(amount, resolvedProvider, null, "Withdrawal reversal");
    await lockedWallet.save();
    await Transaction.findByIdAndUpdate(transaction._id, { status: "failed", failureReason: result.message });
    return { success: false, message: result.message };
  }

  await Transaction.findByIdAndUpdate(transaction._id, {
    conversationId: result.conversationId,
    [`${resolvedProvider}DisbursementId`]: result.conversationId,
  });

  logger.info(`Withdrawal initiated | owner=${ownerId} provider=${resolvedProvider} amount=${amount} conv=${result.conversationId}`);
  return { ...result, internalId: transaction._id };
};

// ─── Internal Transfer (wallet → wallet) ─────────────────────────────────────

/**
 * Transfer funds between two wallets (no external provider involved).
 *
 * @param {string} senderOwnerId
 * @param {string} recipientOwnerId
 * @param {number} amount
 * @param {string} [description]
 * @returns {Promise<{success: boolean, debitId?: string, creditId?: string, message?: string}>}
 */
exports.transfer = async (senderOwnerId, recipientOwnerId, amount, description = "Internal transfer") => {
  if (senderOwnerId === recipientOwnerId) {
    return { success: false, message: "Cannot transfer to yourself" };
  }

  const session = await mongoose.startSession();

  try {
    let debitTxn, creditTxn;

    await session.withTransaction(async () => {
      const [sender, recipient] = await Promise.all([
        Wallet.findOne({ owner: senderOwnerId }).session(session),
        Wallet.findOne({ owner: recipientOwnerId }).session(session),
      ]);

      if (!sender)    throw new Error(`Sender wallet not found for owner ${senderOwnerId}`);
      if (!recipient) throw new Error(`Recipient wallet not found for owner ${recipientOwnerId}`);
      if (sender.status   !== "active") throw new Error(`Sender wallet is ${sender.status}`);
      if (recipient.status !== "active") throw new Error(`Recipient wallet is ${recipient.status}`);

      const internalRef = `TXF-${Date.now()}`;

      sender.debit(amount,    "internal", internalRef, description);
      recipient.credit(amount, "internal", internalRef, description);

      await Promise.all([sender.save(), recipient.save()]);

      [debitTxn, creditTxn] = await Promise.all([
        Transaction.create([{
          owner: senderOwnerId, wallet: sender._id, type: "debit",
          amount, currency: sender.currency, provider: "internal",
          status: "completed", reference: internalRef, description,
        }], { session }),
        Transaction.create([{
          owner: recipientOwnerId, wallet: recipient._id, type: "credit",
          amount, currency: recipient.currency, provider: "internal",
          status: "completed", reference: internalRef, description,
        }], { session }),
      ]);
    });

    logger.info(`Transfer complete | from=${senderOwnerId} to=${recipientOwnerId} amount=${amount}`);
    return {
      success:  true,
      debitId:  debitTxn[0]._id.toString(),
      creditId: creditTxn[0]._id.toString(),
    };
  } catch (error) {
    logger.error(`transfer error | from=${senderOwnerId} to=${recipientOwnerId} error=${error.message}`);
    return { success: false, message: error.message };
  } finally {
    session.endSession();
  }
};

// ─── Balance ──────────────────────────────────────────────────────────────────

/**
 * Return a wallet's current balance and linked account summary.
 *
 * @param {string} ownerId
 * @returns {Promise<{success: boolean, balance?: number, currency?: string, linkedAccounts?: Array, message?: string}>}
 */
exports.getBalance = async (ownerId) => {
  try {
    const wallet = await Wallet.findByOwner(ownerId);
    return {
      success: true,
      balance: wallet.balance,
      currency: wallet.currency,
      formattedBalance: wallet.formattedBalance,
      linkedAccounts: wallet.linkedAccounts.map((a) => ({
        provider:   a.provider,
        identifier: a.identifier,
        isVerified: a.isVerified,
      })),
      totals: wallet.totals,
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// ─── Link a Payment Account ───────────────────────────────────────────────────

/**
 * Associate a payment account (phone / Stripe customer) with a wallet.
 *
 * @param {string} ownerId
 * @param {string} provider     "airtel" | "mpesa" | "stripe"
 * @param {string} identifier   Phone number or Stripe customer ID
 * @param {Object} [meta]       Optional provider-specific metadata
 * @returns {Promise<{success: boolean, message?: string}>}
 */
exports.linkAccount = async (ownerId, provider, identifier, meta = {}) => {
  try {
    if (!payments.isProviderAvailable(provider)) {
      return { success: false, message: `Provider "${provider}" is not configured` };
    }

    const wallet = await Wallet.findByOwner(ownerId);
    wallet.linkAccount(provider, identifier, meta);
    await wallet.save();

    logger.info(`Account linked | owner=${ownerId} provider=${provider}`);
    return { success: true };
  } catch (error) {
    logger.error(`linkAccount error | owner=${ownerId} provider=${provider} error=${error.message}`);
    return { success: false, message: error.message };
  }
};

// ─── Transaction History ──────────────────────────────────────────────────────

/**
 * Retrieve paginated transaction history for a wallet owner.
 *
 * @param {string}  ownerId
 * @param {Object}  [opts]
 * @param {number}  [opts.page=1]
 * @param {number}  [opts.limit=20]
 * @param {string}  [opts.provider]   Filter by provider
 * @param {string}  [opts.type]       "credit" | "debit"
 * @param {string}  [opts.status]     "pending" | "completed" | "failed"
 */
exports.getHistory = async (ownerId, { page = 1, limit = 20, provider, type, status } = {}) => {
  try {
    const wallet = await Wallet.findByOwner(ownerId);
    const filter = { wallet: wallet._id };
    if (provider) filter.provider = provider;
    if (type)     filter.type     = type;
    if (status)   filter.status   = status;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    return {
      success: true,
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// ─── Provider health pass-through ─────────────────────────────────────────────

/**
 * Returns the list of payment providers currently available.
 * Useful for letting the front-end know which deposit methods to show.
 */
exports.availableProviders = () => payments.availableProviders();
