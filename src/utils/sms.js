const axios = require("axios");
const logger = require("./logger");

const normalizePhoneNumber = (phoneNumber = "") => phoneNumber.replace(/[^\d+]/g, "").trim();

const FLUX_SMS_URL = process.env.FLUX_SMS_URL || "https://api.fluxsms.co.ke/sendsms";
const FLUX_SMS_STATUS_URL = process.env.FLUX_SMS_STATUS_URL || "https://api.fluxsms.co.ke/smsstatus";
const SMS_DELIVERY_TIMEOUT_MS = Number(process.env.FLUX_SMS_DELIVERY_TIMEOUT_MS) || 15000;
const SMS_DELIVERY_POLL_INTERVAL_MS = Number(process.env.FLUX_SMS_DELIVERY_POLL_INTERVAL_MS) || 3000;

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const unwrapPayload = (data = {}) => {
  if (Array.isArray(data?.responses) && data.responses.length > 0) {
    return data.responses[0];
  }
  if (Array.isArray(data?.response) && data.response.length > 0) {
    return data.response[0];
  }
  return data;
};

const getStatusText = (payload = {}) => {
  const flat = unwrapPayload(payload);
  return String(
    flat["delivery-description"] ||
      flat.deliveryDescription ||
      flat["response-description"] ||
      flat.responseDescription ||
      flat.status ||
      flat.message ||
      ""
  ).toLowerCase();
};

const describeStatusPayload = (payload = {}) => {
  const flat = unwrapPayload(payload);
  return {
    responseCode:
      flat["response-code"] ??
      flat["respose-code"] ??
      flat.responseCode ??
      flat.statusCode ??
      null,
    responseDescription:
      flat["response-description"] ??
      flat.responseDescription ??
      flat.error ??
      flat.message ??
      "",
    deliveryStatus:
      flat["delivery-status"] ??
      flat.deliveryStatus ??
      null,
    deliveryDescription:
      flat["delivery-description"] ??
      flat.deliveryDescription ??
      "",
  };
};

const isDeliveredStatus = (payload = {}) => {
  const flat = unwrapPayload(payload);
  const text = getStatusText(flat);
  const code = Number(
    flat["delivery-status"] ??
      flat.deliveryStatus ??
      flat.statusCode ??
      flat["response-code"] ??
      flat["respose-code"]
  );
  return code === 32 || text.includes("delivered");
};

const isPendingStatus = (payload = {}) => {
  const text = getStatusText(payload);
  return (
    text.includes("pending") ||
    text.includes("scheduled") ||
    text.includes("senttonetwork") ||
    text.includes("sent to network") ||
    text.includes("queued") ||
    text.includes("processing") ||
    text.includes("sent")
  );
};

const fetchSmsStatus = async ({ apiKey, messageId }) => {
  const response = await axios.post(
    FLUX_SMS_STATUS_URL,
    { api_key: apiKey, message_id: messageId },
    {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  return unwrapPayload(response.data || {});
};

const waitForSmsDelivery = async ({ apiKey, messageId }) => {
  const startedAt = Date.now();
  let lastStatus = null;

  while (Date.now() - startedAt < SMS_DELIVERY_TIMEOUT_MS) {
    lastStatus = await fetchSmsStatus({ apiKey, messageId });

    if (isDeliveredStatus(lastStatus)) {
      return { delivered: true, status: lastStatus };
    }

    if (!isPendingStatus(lastStatus)) {
      return { delivered: false, status: lastStatus };
    }

    await sleep(SMS_DELIVERY_POLL_INTERVAL_MS);
  }

  return { delivered: false, status: lastStatus };
};

const sendSMS = async ({ to, message }) => {
  // Accepts phone in local format (e.g. 07...) or international (254...)
  const normalizedTo = to.replace(/[^\d]/g, "");
  if (!normalizedTo) {
    throw new Error("Valid phone number is required.");
  }

  const { apiKey, senderId } = getFluxSMSConfig();
  if (!apiKey) {
    const err = new Error("FLUX_SMS_API_KEY is missing. SMS delivery is not configured.");
    logger.error(`SMS delivery unavailable for ${normalizedTo}: ${err.message}`);
    throw err;
  }

  try {
    const payload = {
      message,
      phone: normalizedTo,
      sender_id: senderId,
      api_key: apiKey,
    };

    const response = await axios.post(FLUX_SMS_URL, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    const sentPayload = unwrapPayload(response.data || {});
    const responseCode = Number(
      sentPayload["response-code"] ??
        sentPayload["respose-code"] ??
        sentPayload.responseCode ??
        sentPayload.statusCode
    );

    if (responseCode === 200) {
      const messageId = sentPayload.messageid || sentPayload.message_id || sentPayload["message-id"];
      logger.info(`FluxSMS accepted [to=${normalizedTo}] messageId=${messageId}`);
      return {
        provider: "fluxsms",
        to: normalizedTo,
        status: "success",
        messageId,
        mobile: sentPayload.mobile || sentPayload.phone,
        raw: response.data,
      };
    }

    const providerMessage =
      sentPayload.error ||
      sentPayload["response-description"] ||
      sentPayload.responseDescription ||
      "SMS delivery not accepted";
    logger.error(`FluxSMS rejected [to=${normalizedTo}] status=${providerMessage}`);
    throw new Error(`SMS provider rejected the message: ${providerMessage}`);
  } catch (error) {
    const providerMessage =
      error?.response?.data?.error ||
      error?.response?.data?.["response-description"] ||
      error?.response?.data?.message ||
      error?.message ||
      "Unknown error";
    logger.error(`FluxSMS failed [to=${normalizedTo}]: ${providerMessage}`);
    throw error;
  }
};

const sendAndConfirmSMS = async ({ to, message }) => {
  const { apiKey } = getFluxSMSConfig();
  const accepted = await sendSMS({ to, message });
  if (!accepted?.messageId || !apiKey) {
    return { ...accepted, deliveryConfirmed: false };
  }

  const delivery = await waitForSmsDelivery({ apiKey, messageId: accepted.messageId });
  if (delivery.delivered) {
    return {
      ...accepted,
      deliveryConfirmed: true,
      deliveryStatus: delivery.status,
    };
  }

  const statusText = getStatusText(delivery.status) || "unavailable";
  const statusDetails = describeStatusPayload(delivery.status);
  const err = new Error(
    `SMS not delivered yet (${statusText}). Provider response: ${JSON.stringify(statusDetails)}`
  );
  err.statusCode = 503;
  err.messageId = accepted.messageId;
  err.deliveryStatus = delivery.status;
  throw err;
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
  sendAndConfirmSMS,
  sendOTPViaSMS,
  sendLoginAlertSMS,
  sendWelcomeSMS,
  verifyFluxSMSConnection,
  isFluxSMSConnected: verifyFluxSMSConnection,
};
