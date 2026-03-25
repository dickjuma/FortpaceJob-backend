"use strict";

const axios = require("axios");
const {
  initiateAirtelPayment,
  pollPaymentStatus,
  initiateAirtelDisbursement,
} = require("airtel-money-node-sdk");

const Transaction = require("../models/Transaction");
const Wallet = require("../models/Wallet");
const Contract = require("../models/Contract");
const logger = require("../utils/logger");

// ─── Configuration ─────────────────────────────────────────────────────────────

const REQUIRED_ENV = ["CLIENT_ID", "CLIENT_SECRET", "COUNTRY", "CURRENCY"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}

const AIRTEL_CONFIG = Object.freeze({
  baseUrl:                   process.env.AIRTEL_API_BASE_URL || "https://openapiuat.airtel.africa",
  clientId:                  process.env.CLIENT_ID,
  clientSecret:              process.env.CLIENT_SECRET,
  grantType:                 process.env.GRANT_TYPE || "client_credentials",
  country:                   process.env.COUNTRY,
  currency:                  process.env.CURRENCY,
  apiVersion:                parseInt(process.env.AIRTEL_API_VERSION, 10) || 1,
  callbackUrl:               process.env.AIRTEL_CALLBACK_URL,
  disbursementCallbackUrl:   process.env.AIRTEL_DISBURSEMENT_CALLBACK_URL,
  rsaPublicKey:              process.env.RSA_PUBLIC_KEY,
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format amount to a two-decimal string, e.g. 100 → "100.00"
 * @param {number|string} amount
 * @returns {string}
 */
const formatAmount = (amount) => parseFloat(amount).toFixed(2);

/**
 * Obtain an OAuth2 token directly from Airtel (bypasses SDK token handling).
 * Used only when calling the disbursement endpoint manually.
 * @returns {Promise<string>} Access token
 */
async function getAirtelToken() {
  const credentials = Buffer.from(
    `${AIRTEL_CONFIG.clientId}:${AIRTEL_CONFIG.clientSecret}`
  ).toString("base64");

  const { data } = await axios.post(
    `${AIRTEL_CONFIG.baseUrl}/auth/oauth2/token`,
    { grant_type: AIRTEL_CONFIG.grantType },
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!data?.access_token) {
    throw new Error("No access token returned from Airtel auth endpoint");
  }

  return data.access_token;
}

/**
 * Parse the contract ID out of a FORTE-prefixed reference string.
 * @param {string} reference  e.g. "FORTE-abc123"
 * @returns {string|null}
 */
const extractContractId = (reference) =>
  reference?.startsWith("FORTE-") ? reference.slice("FORTE-".length) : null;

// ─── Collection (STK-Push Equivalent) ─────────────────────────────────────────

/**
 * Initiate a payment request (customer → business).
 *
 * @param {string} phone       Customer phone number WITHOUT country code
 * @param {number} amount      Amount to charge
 * @param {string} contractId  Contract / order ID used as the reference
 * @param {string} description Human-readable description (logged only)
 * @returns {Promise<{success: boolean, transactionId?: string, checkoutRequestId?: string, responseCode?: string, message?: string}>}
 */
exports.initiatePayment = async (phone, amount, contractId, description) => {
  const reference = `FORTE-${contractId}`;

  try {
    logger.info(`Initiating Airtel payment | phone=${phone} amount=${amount} ref=${reference}`);
    const result = await initiateAirtelPayment(formatAmount(amount), phone, reference);

    if (result.status !== "SUCCESS") {
      logger.warn(`Airtel payment initiation failed | ref=${reference} message=${result.message}`);
      return { success: false, message: result.message ?? "Payment initiation failed" };
    }

    const { transactionId, responseCode } = result.data;
    logger.info(`Airtel payment initiated | txn=${transactionId} contract=${contractId}`);

    return {
      success: true,
      transactionId,
      checkoutRequestId: transactionId, // Alias for M-Pesa parity
      responseCode,
    };
  } catch (error) {
    logger.error(`initiatePayment error | ref=${reference} error=${error.message}`);
    return { success: false, message: error.message || "Failed to initiate payment" };
  }
};

// ─── Transaction Status Query ──────────────────────────────────────────────────

/**
 * Poll the status of a collection transaction.
 *
 * @param {string} transactionId  Airtel transaction ID from initiatePayment
 * @returns {Promise<{success: boolean, resultCode: number, resultDesc: string, message?: string}>}
 */
exports.queryPaymentStatus = async (transactionId) => {
  try {
    // SDK returns: 'SUCCESS' | 'FAILED' | 'PENDING' | 'UNKNOWN'
    const status = await pollPaymentStatus(transactionId);

    const resultCodeMap = { SUCCESS: 0, FAILED: 1, PENDING: 2, UNKNOWN: 3 };

    return {
      success: status === "SUCCESS",
      resultCode: resultCodeMap[status] ?? 3,
      resultDesc: status,
    };
  } catch (error) {
    logger.error(`queryPaymentStatus error | txn=${transactionId} error=${error.message}`);
    return { success: false, resultCode: -1, resultDesc: "ERROR", message: error.message };
  }
};

// ─── Disbursement (Business → Customer) ───────────────────────────────────────

/**
 * Send money from the business to a customer (B2C payout).
 *
 * Prefers the SDK's initiateAirtelDisbursement; falls back to a direct API call
 * when the SDK export is unavailable.
 *
 * @param {string} phone          Recipient phone number WITHOUT country code
 * @param {number} amount         Amount to send
 * @param {string} occasion       Reason for payout (logged/stored)
 * @param {string} transactionId  Internal transaction ID used as reference
 * @returns {Promise<{success: boolean, conversationId?: string, responseCode?: string, message?: string}>}
 */
exports.b2cPayout = async (phone, amount, occasion, transactionId) => {
  const reference = `PAYOUT-${transactionId}`;
  const amountStr = formatAmount(amount);

  try {
    logger.info(`Initiating Airtel B2C payout | phone=${phone} amount=${amountStr} ref=${reference}`);

    // ── Path A: SDK-based disbursement ────────────────────────────────────────
    if (typeof initiateAirtelDisbursement === "function") {
      const result = await initiateAirtelDisbursement(amountStr, phone, reference);

      if (result.status !== "SUCCESS") {
        logger.warn(`Airtel disbursement failed | ref=${reference} message=${result.message}`);
        return { success: false, message: result.message ?? "Disbursement failed" };
      }

      const { transactionId: airtelTxnId, responseCode } = result.data;
      logger.info(`Airtel disbursement initiated | txn=${airtelTxnId}`);
      return { success: true, conversationId: airtelTxnId, responseCode };
    }

    // ── Path B: Direct API call (fallback when SDK lacks the export) ──────────
    logger.warn("initiateAirtelDisbursement not found in SDK; falling back to direct API call");
    const token = await getAirtelToken();

    const payload = {
      amount:      amountStr,
      phoneNumber: phone,
      reference,
      currency:    AIRTEL_CONFIG.currency,
      country:     AIRTEL_CONFIG.country,
    };

    const { data } = await axios.post(
      `${AIRTEL_CONFIG.baseUrl}/merchant/v2/disbursements/`,
      payload,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (data.status !== "SUCCESS") {
      return { success: false, message: data.message ?? "Disbursement failed" };
    }

    return { success: true, conversationId: data.data.transactionId };
  } catch (error) {
    logger.error(`b2cPayout error | ref=${reference} error=${error.message}`);
    return { success: false, message: error.message || "Payout failed" };
  }
};

// ─── Webhook: Payment (Collection) Callback ────────────────────────────────────

/**
 * Handle an inbound Airtel payment webhook.
 *
 * @param {Object} callbackData  Raw payload from Airtel
 * @returns {Promise<{success: boolean, receiptId?: string, error?: string}>}
 */
exports.handleAirtelCallback = async (callbackData) => {
  const { transactionId, status, amount, phone, reference } = callbackData ?? {};

  if (!transactionId) {
    logger.warn("handleAirtelCallback: missing transactionId in payload");
    return { success: false, error: "Invalid callback payload" };
  }

  try {
    if (status !== "SUCCESS") {
      logger.warn(`Airtel payment failed | txn=${transactionId} status=${status}`);
      await Transaction.findOneAndUpdate(
        { airtelTransactionId: transactionId },
        { status: "failed" }
      );
      return { success: false, error: status };
    }

    // ── Locate the transaction ─────────────────────────────────────────────────
    const contractId = extractContractId(reference);
    const transaction = contractId
      ? await Transaction.findOne({ contract: contractId, type: "debit" })
      : await Transaction.findOne({ airtelTransactionId: transactionId });

    if (!transaction) {
      logger.warn(`handleAirtelCallback: no transaction found | txn=${transactionId} ref=${reference}`);
      return { success: false, error: "Transaction not found" };
    }

    // ── Update transaction ─────────────────────────────────────────────────────
    transaction.status              = "completed";
    transaction.airtelTransactionId = transactionId;
    transaction.reference           = transactionId;
    await transaction.save();

    // ── Credit wallet if applicable ────────────────────────────────────────────
    if (transaction.type === "credit" && transaction.wallet) {
      const wallet = await Wallet.findById(transaction.wallet);
      if (wallet) {
        wallet.balance += parseFloat(amount);
        await wallet.save();
        logger.info(`Wallet credited | walletId=${wallet._id} amount=${amount}`);
      }
    }

    // ── Activate contract if applicable ───────────────────────────────────────
    if (transaction.contract) {
      const contract = await Contract.findById(transaction.contract);
      if (contract) {
        contract.paymentStatus = "escrowed";
        contract.status        = "active";
        await contract.save();
        logger.info(`Contract activated | contractId=${contract._id}`);
      }
    }

    logger.info(`Airtel payment callback processed | txn=${transactionId}`);
    return { success: true, receiptId: transactionId };
  } catch (error) {
    logger.error(`handleAirtelCallback error | txn=${transactionId} error=${error.message}`);
    return { success: false, error: "Internal processing error" };
  }
};

// ─── Webhook: Disbursement Callback ────────────────────────────────────────────

/**
 * Handle an inbound Airtel disbursement webhook.
 *
 * @param {Object} callbackData  Raw callback payload
 * @returns {Promise<{success: boolean, error?: string}>}
 */
exports.handleDisbursementCallback = async (callbackData) => {
  const { transactionId, status } = callbackData ?? {};

  if (!transactionId) {
    logger.warn("handleDisbursementCallback: missing transactionId in payload");
    return { success: false, error: "Invalid callback payload" };
  }

  try {
    const transaction = await Transaction.findOne({ airtelDisbursementId: transactionId });

    if (!transaction) {
      logger.warn(`handleDisbursementCallback: no transaction found | txn=${transactionId}`);
      return { success: false, error: "Transaction not found" };
    }

    if (status === "SUCCESS") {
      transaction.status    = "completed";
      transaction.reference = transactionId;
      await transaction.save();
      logger.info(`Airtel disbursement completed | txn=${transactionId}`);
      return { success: true };
    }

    transaction.status = "failed";
    await transaction.save();
    logger.warn(`Airtel disbursement failed | txn=${transactionId} status=${status}`);
    return { success: false, error: status };
  } catch (error) {
    logger.error(`handleDisbursementCallback error | txn=${transactionId} error=${error.message}`);
    return { success: false, error: "Internal processing error" };
  }
};