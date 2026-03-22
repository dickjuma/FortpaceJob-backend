const crypto = require("crypto");
const { prisma } = require("../config/db");

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_LIMIT = 3;
const OTP_RESEND_WINDOW_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const hashOtp = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const canResendOtp = async ({ userId, channel, purpose }) => {
  const windowStart = new Date(Date.now() - OTP_RESEND_WINDOW_MS);
  const count = await prisma.otpCode.count({
    where: {
      userId: Number(userId),
      channel,
      purpose,
      createdAt: { gte: windowStart },
    },
  });
  if (count >= OTP_RESEND_LIMIT) {
    return { allowed: false, message: "Too many OTP requests. Please wait a few minutes." };
  }
  return { allowed: true };
};

const createOtp = async ({ userId, channel, purpose }) => {
  const gate = await canResendOtp({ userId, channel, purpose });
  if (!gate.allowed) {
    const err = new Error(gate.message);
    err.statusCode = 429;
    throw err;
  }

  const otp = generateOtp();
  await prisma.otpCode.create({
    data: {
      userId: Number(userId),
      codeHash: hashOtp(otp),
      channel,
      purpose,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return otp;
};

const verifyOtp = async ({ userId, channel, purpose, code }) => {
  const record = await prisma.otpCode.findFirst({
    where: {
      userId: Number(userId),
      channel,
      purpose,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    const err = new Error("Invalid or expired OTP.");
    err.statusCode = 400;
    throw err;
  }

  const providedHash = hashOtp(code);
  if (record.codeHash !== providedHash) {
    const attempts = record.attempts + 1;
    await prisma.otpCode.update({
      where: { id: record.id },
      data: {
        attempts,
        ...(attempts >= OTP_MAX_ATTEMPTS ? { usedAt: new Date() } : {}),
      },
    });
    const err = new Error(attempts >= OTP_MAX_ATTEMPTS ? "Too many failed attempts." : "Invalid or expired OTP.");
    err.statusCode = attempts >= OTP_MAX_ATTEMPTS ? 429 : 400;
    throw err;
  }

  await prisma.otpCode.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return record;
};

module.exports = {
  createOtp,
  verifyOtp,
  canResendOtp,
  OTP_TTL_MS,
};
