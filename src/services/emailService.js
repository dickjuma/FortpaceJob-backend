const { sendVerificationEmail, sendPasswordResetOtpEmail: sendResetOtpEmail } = require("../utils/email");

const sendOtpEmail = async ({ email, name = "", role = "", otp }) => {
  await sendVerificationEmail({ email, name, role }, otp);
  return { success: true, channel: "email" };
};

const sendPasswordResetOtpEmail = async ({ email, name = "", role = "", otp }) => {
  await sendResetOtpEmail({ email, name, role }, otp);
  return { success: true, channel: "email" };
};

module.exports = { sendOtpEmail, sendPasswordResetOtpEmail };
