const axios = require("axios");
const logger = require("./logger");

const normalizePhoneNumber = (phoneNumber = "") => phoneNumber.replace(/[^\d+]/g, "").trim();
const AFRICAS_TALKING_URL = "https://api.africastalking.com/version1/messaging";

const getAfricasTalkingConfig = () => {
  const apiKey = process.env.AFRICAS_TALKING_API_KEY || process.env["AFRICA'S_TALKING_API_KEY"];
  const username = process.env.AFRICAS_TALKING_USERNAME || process.env["AFRICA'S_TALKING_USERNAME"];
  const senderId =
    process.env.SMS_SENDER_ID ||
    process.env.AFRICAS_TALKING_SENDER_ID ||
    process.env.AFRICAS_TALKING_SHORTCODE ||
    "";
  return { apiKey, username, senderId };
};

const verifyAfricasTalkingConnection = async () => {
  const { apiKey, username } = getAfricasTalkingConfig();
  if (!apiKey || !username) {
    logger.warn("Africa's Talking SMS not configured. Set AFRICAS_TALKING_API_KEY and AFRICAS_TALKING_USERNAME.");
    return false;
  }

  try {
    await axios.get("https://api.africastalking.com/version1/user", {
      params: { username },
      headers: {
        apiKey,
        Accept: "application/json",
      },
      timeout: 10000,
    });
    logger.info(`Africa's Talking connected [username=${username}]`);
    return true;
  } catch (error) {
    const providerMessage =
      error?.response?.data?.errorMessage ||
      error?.response?.data?.error ||
      error?.message ||
      "Unknown error";
    logger.error(`Africa's Talking connection failed: ${providerMessage}`);
    return false;
  }
};

const sendSMS = async ({ to, message }) => {
  const normalizedTo = normalizePhoneNumber(to);
  if (!normalizedTo) {
    throw new Error("Valid phone number is required.");
  }

  const { apiKey, username, senderId } = getAfricasTalkingConfig();
  if (apiKey && username) {
    const params = new URLSearchParams({
      username,
      to: normalizedTo,
      message,
    });
    if (senderId) params.append("from", senderId);

    const response = await axios.post(AFRICAS_TALKING_URL, params.toString(), {
      headers: {
        apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      timeout: 10000,
    });

    const recipients = response?.data?.SMSMessageData?.Recipients || [];
    const status = recipients[0]?.status || "queued";
    return { provider: "africastalking", to: normalizedTo, status };
  }

  // Provider-agnostic webhook. User can plug their token/provider later.
  if (process.env.SMS_WEBHOOK_URL) {
    await axios.post(
      process.env.SMS_WEBHOOK_URL,
      { to: normalizedTo, message },
      {
        headers: process.env.SMS_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` }
          : undefined,
        timeout: 10000,
      }
    );
    return { provider: "webhook", to: normalizedTo };
  }

  // Safe fallback in dev to avoid failing auth flow when SMS provider is not configured.
  logger.warn(`SMS provider not configured. OTP message for ${normalizedTo}: ${message}`);
  return { provider: "log", to: normalizedTo };
};

const sendOTPViaSMS = async ({ phoneNumber, otp }) =>
  sendSMS({
    to: phoneNumber,
    message: `Your Forte verification code is ${otp}. It expires in 10 minutes.`,
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
  verifyAfricasTalkingConnection,
};
