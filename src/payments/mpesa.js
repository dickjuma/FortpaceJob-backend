/**
 * M-Pesa Payment Integration for Forte Platform
 * Supports STK Push, B2C payouts, and payment status checking
 */

const axios = require("axios");
const crypto = require("crypto");
const Transaction = require("../models/Transaction");
const Wallet = require("../models/Wallet");
const Contract = require("../models/Contract");
const logger = require("../utils/logger");

// M-Pesa Configuration
const MPESA_CONFIG = {
  baseUrl: process.env.MPESA_ENV === "production" 
    ? "https://api.safaricom.co.ke" 
    : "https://sandbox.safaricom.co.ke",
  shortCode: process.env.MPESA_SHORT_CODE,
  initiatorName: process.env.MPESA_INITIATOR_NAME,
  securityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
  callbackUrl: process.env.MPESA_CALLBACK_URL,
  timeoutUrl: process.env.MPESA_TIMEOUT_URL,
  resultUrl: process.env.MPESA_RESULT_URL,
};

// Generate M-Pesa password
const generateMpesaPassword = () => {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const shortCode = MPESA_CONFIG.shortCode;
  const passkey = process.env.MPESA_PASSKEY;
  const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");
  return { password, timestamp };
};

// Get OAuth token
const getMpesaToken = async () => {
  try {
    const auth = Buffer.from(
      `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString("base64");

    const response = await axios.get(
      `${MPESA_CONFIG.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );
    return response.data.access_token;
  } catch (error) {
    logger.error(`M-Pesa token error: ${error.message}`);
    throw new Error("Failed to get M-Pesa token");
  }
};

// ─── STK Push (Payment Request) ───────────────────────────────────────────────
exports.stkPush = async (phone, amount, contractId, description) => {
  try {
    const token = await getMpesaToken();
    const { password, timestamp } = generateMpesaPassword();

    const payload = {
      BusinessShortCode: MPESA_CONFIG.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: phone,
      PartyB: MPESA_CONFIG.shortCode,
      PhoneNumber: phone,
      CallBackURL: MPESA_CONFIG.callbackUrl,
      AccountReference: `FORTE-${contractId}`,
      TransactionDesc: description || "Forte Platform Payment",
    };

    const response = await axios.post(
      `${MPESA_CONFIG.baseUrl}/mpesa/stkpush/v1/processrequest`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    logger.info(`STK Push initiated: ${response.data.CheckoutRequestID}`);
    return {
      success: true,
      checkoutRequestId: response.data.CheckoutRequestID,
      responseCode: response.data.ResponseCode,
    };
  } catch (error) {
    logger.error(`STK Push error: ${error.message}`);
    return {
      success: false,
      message: error.response?.data?.errorMessage || "STK Push failed",
    };
  }
};

// ─── Query STK Status ──────────────────────────────────────────────────────────
exports.queryStkStatus = async (checkoutRequestId) => {
  try {
    const token = await getMpesaToken();
    const { password, timestamp } = generateMpesaPassword();

    const payload = {
      BusinessShortCode: MPESA_CONFIG.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    const response = await axios.post(
      `${MPESA_CONFIG.baseUrl}/mpesa/stkpushquery/v1/query`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: true,
      resultCode: response.data.ResultCode,
      resultDesc: response.data.ResultDesc,
    };
  } catch (error) {
    logger.error(`STK Query error: ${error.message}`);
    return { success: false, message: "Failed to query payment status" };
  }
};

// ─── B2C (Business to Customer - Payouts) ──────────────────────────────────────
exports.b2cPayout = async (phone, amount, occasion, transactionId) => {
  try {
    const token = await getMpesaToken();

    const payload = {
      InitiatorName: MPESA_CONFIG.initiatorName,
      SecurityCredential: MPESA_CONFIG.securityCredential,
      CommandID: "BusinessPayment",
      Amount: Math.round(amount),
      PartyA: MPESA_CONFIG.shortCode,
      PartyB: phone,
      Remarks: "Forte Platform Payout",
      QueueTimeOutURL: MPESA_CONFIG.timeoutUrl,
      ResultURL: MPESA_CONFIG.resultUrl,
      Occasion: occasion || "Payout",
    };

    const response = await axios.post(
      `${MPESA_CONFIG.baseUrl}/mpesa/b2c/v1/paymentrequest`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    logger.info(`B2C Payout initiated: ${response.data.ConversationID}`);
    return {
      success: true,
      conversationId: response.data.ConversationID,
      responseCode: response.data.ResponseCode,
    };
  } catch (error) {
    logger.error(`B2C Payout error: ${error.message}`);
    return { success: false, message: "Payout failed" };
  }
};

// ─── Handle M-Pesa Callback ─────────────────────────────────────────────────────
exports.handleMpesaCallback = async (callbackData) => {
  try {
    const { Body } = callbackData;
    
    if (!Body?.stkCallback) {
      logger.warn("Invalid M-Pesa callback format");
      return { success: false };
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = Body.stkCallback;

    if (ResultCode === 0) {
      // Payment successful
      const metadata = {};
      CallbackMetadata?.Item?.forEach((item) => {
        metadata[item.Name] = item.Value;
      });

      const amount = metadata.Amount;
      const phone = metadata.MSISDN;
      const mpesaReceiptId = metadata.MpesaReceiptNumber;

      // Find transaction by reference
      const transaction = await Transaction.findOne({
        mpesaCheckoutId: CheckoutRequestID,
      });

      if (transaction) {
        transaction.status = "completed";
        transaction.mpesaReceiptNumber = mpesaReceiptId;
        transaction.reference = mpesaReceiptId;
        await transaction.save();

        // Update wallet if it's a deposit
        if (transaction.type === "credit") {
          const wallet = await Wallet.findById(transaction.wallet);
          if (wallet) {
            wallet.balance += amount;
            await wallet.save();
          }
        }

        // Update contract if it's a payment
        if (transaction.contract) {
          const contract = await Contract.findById(transaction.contract);
          if (contract) {
            contract.paymentStatus = "escrowed";
            contract.status = "active";
            await contract.save();
          }
        }
      }

      logger.info(`M-Pesa payment success: ${mpesaReceiptId}`);
      return { success: true, receiptId: mpesaReceiptId };
    } else {
      // Payment failed
      await Transaction.findOneAndUpdate(
        { mpesaCheckoutId: CheckoutRequestID },
        { status: "failed" }
      );

      logger.warn(`M-Pesa payment failed: ${ResultDesc}`);
      return { success: false, error: ResultDesc };
    }
  } catch (error) {
    logger.error(`M-Pesa callback error: ${error.message}`);
    return { success: false };
  }
};

// ─── Process M-Pesa B2C Callback ───────────────────────────────────────────────
exports.handleB2cCallback = async (callbackData) => {
  try {
    const { Body } = callbackData;
    const { Result, TransactionID, ResultCode } = Body;

    if (ResultCode === 0) {
      const transaction = await Transaction.findOne({
        conversationId: Result.ConversationID,
      });

      if (transaction) {
        transaction.status = "completed";
        transaction.reference = TransactionID;
        await transaction.save();
      }

      logger.info(`B2C payout success: ${TransactionID}`);
      return { success: true };
    }

    return { success: false };
  } catch (error) {
    logger.error(`B2C callback error: ${error.message}`);
    return { success: false };
  }
};
