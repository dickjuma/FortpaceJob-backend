
const axios = require("axios");
const logger = require("./logger");

const normalizePhoneNumber = (phoneNumber = "") => phoneNumber.replace(/[^\d+]/g, "").trim();

const FLUX_SMS_URL = "https://api.fluxsms.co.ke/sendsms";

const getFluxSMSConfig = () => {
  const apiKey = process.env.FLUX_SMS_API_KEY;
  const senderId = process.env.FLUX_SMS_SENDER_ID || "fluxsms";
  return { apiKey, senderId };
};

const verifyFluxSMSConnection = async () => {
  const { apiKey } = getFluxSMSConfig();
  if (!apiKey) {
    logger.warn("FluxSMS not configured. Set FLUX_SMS_API_KEY.");
    return false;
  }
  logger.info("FluxSMS API key present.");
  return true;
};

const sendSMS = async ({ to, message }) => {
  // Accepts phone in local format (e.g. 07...) or international (254...)
  const normalizedTo = to.replace(/[^\d]/g, "");
  if (!normalizedTo) {
    throw new Error("Valid phone number is required.");
  }

  const { apiKey, senderId } = getFluxSMSConfig();
  if (apiKey) {
    try {
      const payload = {
        message: message,
        phone: normalizedTo,
        sender_id: senderId,
        api_key: apiKey
      };
      const response = await axios.post(
        FLUX_SMS_URL,
        payload,
        {
          headers: {
            "Content-Type": "application/json"
          },
          timeout: 30000,
        }
      );
      if (response.data["response-code"] === 200) {
        logger.info(`FluxSMS accepted [to=${normalizedTo}] messageId=${response.data.messageid}`);
        return {
          provider: "fluxsms",
          to: normalizedTo,
          status: "success",
          messageId: response.data.messageid,
          mobile: response.data.mobile
        };
      } else {
        const providerMessage = response.data.error || "SMS delivery not accepted";
        logger.error(`FluxSMS rejected [to=${normalizedTo}] status=${providerMessage}`);
        throw new Error(`SMS provider rejected the message: ${providerMessage}`);
      }
    } catch (error) {
      const providerMessage =
        error?.response?.data?.error ||
        error?.message ||
        "Unknown error";
      logger.error(`FluxSMS failed [to=${normalizedTo}]: ${providerMessage}`);
      throw error;
    }
  }

  logger.warn(`SMS provider not configured. OTP message for ${normalizedTo}: ${message}`);
  return { provider: "log", to: normalizedTo };
};

const sendOTPViaSMS = async ({ phoneNumber, otp }) =>
  sendSMS({
    to: phoneNumber,
    message: `Your Forte verification code is ${otp}. It expires in 5 minutes.`,
  });

const sendLoginAlertSMS = async ({ phoneNumber }) =>
  sendSMS({
    to: phoneNumber,
    message: "Your Forte account was just accessed. If this was not you, reset your password.",
  });

const sendWelcomeSMS = async ({ phoneNumber, name }) =>
  sendSMS({
    to: phoneNumber,
    message: `Welcome to Forte${name ? `, ${name}` : ""}! Your account is ready.`,
  });

module.exports = {
  normalizePhoneNumber,
  sendSMS,
  sendOTPViaSMS,
  sendLoginAlertSMS,
  sendWelcomeSMS,
  verifyFluxSMSConnection,
  isFluxSMSConnected: verifyFluxSMSConnection,
};
