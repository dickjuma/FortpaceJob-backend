const { sendOTPViaSMS } = require("../utils/sms");


const extractSmsProviderMessage = (error) =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  "";

const isSmsBlacklisted = (error) => false; // FlushSMS does not use blacklist error

const sendOtpSms = async ({ phoneNumber, otp }) => {
  try {
    await sendOTPViaSMS({ phoneNumber, otp });
    return { success: true, channel: "sms" };
  } catch (error) {
    return {
      success: false,
      channel: "sms",
      error: String(extractSmsProviderMessage(error) || "SMS delivery failed."),
      blacklisted: isSmsBlacklisted(error),
    };
  }
};

module.exports = { sendOtpSms, isSmsBlacklisted, extractSmsProviderMessage };
