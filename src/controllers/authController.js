const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const axios = require("axios");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} = require("../utils/jwt");
const {
  sendWelcomeEmail,
  sendLoginAlertEmail,
  sendPasswordChangedEmail,
} = require("../utils/email");
const { sanitizeUser } = require("../utils/helpers");
const { sendLoginAlertSMS, sendWelcomeSMS } = require("../utils/sms");
const { normalizePhoneNumber, isValidPhoneNumber } = require("../utils/phone");
const { prisma } = require("../config/db");
const { applyPendingProfile, getMyProfile, updateMyProfile } = require("../utils/profileStore");
const { createOtp, verifyOtp } = require("../services/otpService");
const { sendOtpSms } = require("../services/smsService");
const { sendOtpEmail, sendPasswordResetOtpEmail } = require("../services/emailService");

// ==================== Constants ====================

// ==================== Helper Functions ====================
const parseRole = (role) => {
  if (!role) return "freelancer";
  return ["freelancer", "client", "admin"].includes(role) ? role : null;
};

const normalizeEmail = (email) => {
  if (!email) return "";
  return String(email).trim().toLowerCase();
};

const isValidEmail = (email = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const hashResetToken = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const signOAuthState = (payload) => {
  const secret = process.env.JWT_SECRET || "fallback_oauth_state_secret";
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
};

const verifyOAuthState = (state) => {
  if (!state || !state.includes(".")) return false;
  const [body, sig] = state.split(".");
  const secret = process.env.JWT_SECRET || "fallback_oauth_state_secret";
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (expected !== sig) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const ts = Number(payload?.ts || 0);
    if (!ts) return false;
    const ageMs = Date.now() - ts;
    return ageMs >= 0 && ageMs <= 10 * 60 * 1000;
  } catch (_) {
    return false;
  }
};

const resolveGoogleRedirectUri = () => {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  if (isProd && process.env.GOOGLE_REDIRECT_URI_PROD) return process.env.GOOGLE_REDIRECT_URI_PROD;
  if (!isProd && process.env.GOOGLE_REDIRECT_URI_DEV) return process.env.GOOGLE_REDIRECT_URI_DEV;
  return "";
};



const buildSafeUser = (user) => sanitizeUser({ ...user });

const issueTokens = (userId) => ({
  accessToken: generateAccessToken(userId),
  refreshToken: generateRefreshToken(userId),
});

const buildUserResponse = async (user) => {
  const profile = await getMyProfile(user.id);
  return profile || buildSafeUser(user);
};

const resolveDisplayName = async (user, fallback = "") => {
  const profile = await getMyProfile(user.id);
  return profile?.name || profile?.companyName || fallback || user.email?.split("@")[0] || "User";
};

const findUserForLogin = async ({ identifier, email, phoneNumber }) => {
  const normalizedIdentifier = String(identifier || "").trim();
  const normalizedEmail = normalizeEmail(email || normalizedIdentifier);
  const normalizedPhone = normalizePhoneNumber(phoneNumber || normalizedIdentifier);

  if (normalizedIdentifier && normalizedIdentifier.includes("@")) {
    return prisma.user.findUnique({ where: { email: normalizedEmail } });
  }

  if (isValidPhoneNumber(normalizedPhone)) {
    return prisma.user.findUnique({ where: { phoneNumber: normalizedPhone } });
  }

  return prisma.user.findUnique({ where: { email: normalizedEmail } });
};

// ==================== OTP Helpers ====================

const buildVerificationResponse = async ({ user, message }) => {
  const responseUser = await buildUserResponse(user);
  const base = {
    success: true,
    message,
    user: responseUser,
  };
  if (user.isActive) {
    return { ...base, ...issueTokens(user.id) };
  }
  return base;
};

const shouldActivateUser = (user) =>
  Boolean(user.emailVerified) && (Boolean(user.phoneVerified) || !user.phoneNumber);


// ==================== Original Exports (Preserved) ====================

// ─── Registration ─────────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { role, email, phoneNumber, password } = req.body;
    const normalizedEmail = normalizeEmail(email || "");
    const normalizedPhone = normalizePhoneNumber(phoneNumber || "");
    const phoneForDb = normalizedPhone || null;
    const safeRole = parseRole(role) || "freelancer";

    if (!normalizedEmail && !phoneForDb) {
      return res.status(400).json({ success: false, message: "Email or phone number is required." });
    }
    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "Provide a valid email address." });
    }
    if (phoneForDb && !isValidPhoneNumber(phoneForDb)) {
      return res.status(400).json({ success: false, message: "Provide a valid phone number in international format." });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    }

    const byEmail = normalizedEmail ? await prisma.user.findUnique({ where: { email: normalizedEmail } }) : null;
    const byPhone = phoneForDb ? await prisma.user.findUnique({ where: { phoneNumber: phoneForDb } }) : null;

    if (byEmail && byPhone && byEmail.id !== byPhone.id) {
      return res.status(409).json({
        success: false,
        message: "An account already exists with this email or phone. Please sign in instead.",
      });
    }

    let user = byEmail || byPhone;

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(normalizedEmail && (!user.email || !user.emailVerified) ? { email: normalizedEmail } : {}),
          ...(phoneForDb && (!user.phoneNumber || !user.phoneVerified) ? { phoneNumber: phoneForDb } : {}),
          password: await bcrypt.hash(password, 12),
          role: safeRole,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail || null,
          phoneNumber: phoneForDb,
          password: await bcrypt.hash(password, 12),
          role: safeRole,
          isActive: false,
          phoneVerified: false,
          emailVerified: false,
          isVerified: false,
          profileCompleted: false,
          reminderSent: false,
          lastProfileUpdate: new Date(),
        },
      });
    }

    const channelsSent = [];
    let phoneVerificationChannel = null;

    
    if (user.phoneNumber && !user.phoneVerified) {
      const phoneOtp = await createOtp({
        userId: user.id,
        channel: "sms",
        purpose: "verify_phone",
      });
      const smsResult = await sendOtpSms({ phoneNumber: user.phoneNumber, otp: phoneOtp });
      if (smsResult.success) {
        channelsSent.push("sms");
        phoneVerificationChannel = "sms";
      }

      if (!phoneVerificationChannel) {
        if (!user.email) {
          return res.status(400).json({
            success: false,
            message: "SMS delivery failed and no email is available for fallback.",
          });
        }
        const fallbackOtp = await createOtp({
          userId: user.id,
          channel: "email",
          purpose: "verify_phone",
        });
        await sendOtpEmail({ email: user.email, name: "", role: user.role || "", otp: fallbackOtp });
        channelsSent.push("email");
        phoneVerificationChannel = "email";
      }
    }

    if (user.email && !user.emailVerified) {
      const emailOtp = await createOtp({
        userId: user.id,
        channel: "email",
        purpose: "verify_email",
      });
      await sendOtpEmail({ email: user.email, name: "", role: user.role || "", otp: emailOtp });
      channelsSent.push("email");
    }

    return res.status(201).json({
      success: true,
      message: "Registration successful. Verification codes sent.",
      userId: user.id,
      pendingPhoneNumber: user.phoneNumber,
      pendingEmail: user.email,
      channelsSent: Array.from(new Set(channelsSent)),
      phoneVerificationChannel,
    });
  } catch (error) {
    next(error);
  }
};
// ─── Phone OTP Verification ───────────────────────────────────────────
exports.verifyPhoneOTP = async (req, res, next) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email || "");
    const normalizedPhone = normalizePhoneNumber(req.body.phoneNumber || "");
    const otp = String(req.body.otp || req.body.phoneOtp || "").trim();
    const channel = String(req.body.channel || "sms").toLowerCase();
    const otpChannel = channel === "phone" ? "sms" : channel;

    if (!otp || (!normalizedEmail && !normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Provide otp and either email or phoneNumber.",
      });
    }

    let user = null;
    if (normalizedEmail) {
      user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    } else if (normalizedPhone) {
      user = await prisma.user.findUnique({ where: { phoneNumber: normalizedPhone } });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (user.phoneVerified) {
      let refreshedUser = user;
      if (shouldActivateUser(user) && !user.isActive) {
        refreshedUser = await prisma.user.update({
          where: { id: user.id },
          data: { isActive: true },
        });
        const displayName = await resolveDisplayName(refreshedUser);
        sendWelcomeEmail({ email: refreshedUser.email, role: refreshedUser.role, name: displayName }).catch(() => {});
        if (refreshedUser.phoneNumber) {
          sendWelcomeSMS({ phoneNumber: refreshedUser.phoneNumber, name: displayName || "" }).catch(() => {});
        }
      }
      return res.json(await buildVerificationResponse({ user: refreshedUser, message: "Phone already verified." }));
    }

    await verifyOtp({ userId: user.id, channel: otpChannel, purpose: "verify_phone", code: otp });

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        phoneVerified: true,
        phoneNumber: normalizedPhone || user.phoneNumber,
        isActive: shouldActivateUser({ ...user, phoneVerified: true }),
      },
    });

    if (updatedUser.isActive && !user.isActive) {
      const displayName = await resolveDisplayName(updatedUser);
      sendWelcomeEmail({ email: updatedUser.email, role: updatedUser.role, name: displayName }).catch(() => {});
      if (updatedUser.phoneNumber) {
        sendWelcomeSMS({ phoneNumber: updatedUser.phoneNumber, name: displayName || "" }).catch(() => {});
      }
    }

    return res.json(
      await buildVerificationResponse({ user: updatedUser, message: "Phone verified successfully." })
    );
  } catch (error) {
    next(error);
  }
};
// ─── Generic Verify OTP (preserved) ───────────────────────────────────
exports.verifyOTP = async (req, res, next) => {
  const explicit = String(req.body.channel || "").toLowerCase();
  if (explicit === "email") {
    return exports.verifyEmailOTP(req, res, next);
  }
  if (explicit === "phone") {
    return exports.verifyPhoneOTP(req, res, next);
  }
  // fallback by inspecting provided codes
  if (req.body.emailOtp && !req.body.phoneOtp) {
    req.body.otp = req.body.emailOtp;
    return exports.verifyEmailOTP(req, res, next);
  }
  // default to phone
  req.body.otp = req.body.phoneOtp || req.body.otp;
  return exports.verifyPhoneOTP(req, res, next);
};

// ─── Email OTP Verification (preserved) ───────────────────────────────
exports.verifyEmailOTP = async (req, res, next) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email || "");
    const otp = String(req.body.otp || "").trim();
    const channel = String(req.body.channel || "email").toLowerCase();

    if (!normalizedEmail || !otp) {
      return res.status(400).json({ success: false, message: "Provide email and otp." });
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (user.emailVerified) {
      let refreshedUser = user;
      if (shouldActivateUser(user) && !user.isActive) {
        refreshedUser = await prisma.user.update({
          where: { id: user.id },
          data: { isActive: true },
        });
        const displayName = await resolveDisplayName(refreshedUser);
        sendWelcomeEmail({ email: refreshedUser.email, role: refreshedUser.role, name: displayName }).catch(() => {});
        if (refreshedUser.phoneNumber) {
          sendWelcomeSMS({ phoneNumber: refreshedUser.phoneNumber, name: displayName || "" }).catch(() => {});
        }
      }
      return res.json(await buildVerificationResponse({ user: refreshedUser, message: "Email already verified." }));
    }

    await verifyOtp({ userId: user.id, channel, purpose: "verify_email", code: otp });

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        isActive: shouldActivateUser({ ...user, emailVerified: true }),
      },
    });

    if (!user.emailVerified) {
      await applyPendingProfile(user.id);
    }

    if (updatedUser.isActive && !user.isActive) {
      const displayName = await resolveDisplayName(updatedUser);
      sendWelcomeEmail({ email: updatedUser.email, role: updatedUser.role, name: displayName }).catch(() => {});
      if (updatedUser.phoneNumber) {
        sendWelcomeSMS({ phoneNumber: updatedUser.phoneNumber, name: displayName || "" }).catch(() => {});
      }
    }

    return res.json(
      await buildVerificationResponse({ user: updatedUser, message: "Email verified successfully." })
    );
  } catch (error) {
    next(error);
  }
};
// ─── Complete Registration (deprecated, kept) ─────────────────────────
exports.completeRegistration = async (_req, res) => {
  return res.status(400).json({
    success: false,
    message: "Registration is completed automatically after successful phone OTP verification.",
  });
};

// ─── Resend OTP (enhanced with phone) ─────────────────────────────────
exports.resendOTP = async (req, res, next) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email || "");
    const normalizedPhone = normalizePhoneNumber(req.body.phoneNumber || "");
    const rawChannel = String(req.body.channel || "email").toLowerCase();
    const channel = rawChannel === "phone" ? "sms" : rawChannel;
    const purpose = String(req.body.purpose || "").trim() || (channel === "sms" ? "verify_phone" : "verify_email");

    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({ success: false, message: "Provide email or phoneNumber." });
    }

    let user = null;
    if (normalizedEmail) {
      user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    }
    if (!user && normalizedPhone) {
      user = await prisma.user.findUnique({ where: { phoneNumber: normalizedPhone } });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (channel === "sms") {
      if (user.phoneVerified && user.isActive) {
        return res.status(400).json({ success: false, message: "Phone is already verified for this account." });
      }
      if (!user.phoneNumber) {
        return res.status(400).json({ success: false, message: "No phone number is linked to this account." });
      }

      const otp = await createOtp({ userId: user.id, channel: "sms", purpose });
      const smsResult = await sendOtpSms({ phoneNumber: user.phoneNumber, otp });
      if (smsResult.success) {
        return res.json({ success: true, message: "OTP resent to your phone number.", channelUsed: "sms" });
      }

      if (!user.email) {
        return res.status(400).json({ success: false, message: "SMS failed and no email is available for fallback." });
      }
      const fallbackOtp = await createOtp({ userId: user.id, channel: "email", purpose });
      await sendOtpEmail({ email: user.email, name: "", role: user.role || "", otp: fallbackOtp });
      return res.json({ success: true, message: "OTP resent via email fallback.", channelUsed: "email" });
    }

    if (channel === "email") {
      if (user.emailVerified && user.isActive && purpose === "verify_email") {
        return res.status(400).json({ success: false, message: "Email is already verified for this account." });
      }
      if (!user.email) {
        return res.status(400).json({ success: false, message: "No email is linked to this account." });
      }
      const otp = await createOtp({ userId: user.id, channel: "email", purpose });
      await sendOtpEmail({ email: user.email, name: "", role: user.role || "", otp });
      return res.json({ success: true, message: "OTP resent to your email address.", channelUsed: "email" });
    }

    return res.status(400).json({ success: false, message: "Unknown channel." });
  } catch (error) {
    next(error);
  }
};
// ─── Login with Phone OTP (deprecated, kept) ─────────────────────────
exports.sendLoginOTP = async (req, res, next) => {
  try {
    const normalizedPhone = normalizePhoneNumber(req.body.phoneNumber || "");
    if (!normalizedPhone || !isValidPhoneNumber(normalizedPhone)) {
      return res.status(400).json({ success: false, message: "Provide a valid phone number in international format." });
    }

    const user = await prisma.user.findUnique({ where: { phoneNumber: normalizedPhone } });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Account is inactive. Verify your email and phone first." });
    }

    const otp = await createOtp({ userId: user.id, channel: "sms", purpose: "login_phone" });
    const smsResult = await sendOtpSms({ phoneNumber: user.phoneNumber, otp });
    if (smsResult.success) {
      return res.json({ success: true, message: "OTP sent to your phone.", channelUsed: "sms" });
    }

    if (!user.email) {
      return res.status(400).json({ success: false, message: "SMS failed and no email is available for fallback." });
    }
    const fallbackOtp = await createOtp({ userId: user.id, channel: "email", purpose: "login_phone" });
    await sendOtpEmail({ email: user.email, name: "", role: user.role || "", otp: fallbackOtp });
    return res.json({ success: true, message: "OTP sent via email fallback.", channelUsed: "email" });
  } catch (error) {
    next(error);
  }
};

exports.loginWithPhoneOTP = async (req, res, next) => {
  try {
    const normalizedPhone = normalizePhoneNumber(req.body.phoneNumber || "");
    const otp = String(req.body.otp || "").trim();
    const channel = String(req.body.channel || "sms").toLowerCase();
    const otpChannel = channel === "phone" ? "sms" : channel;

    if (!normalizedPhone || !otp) {
      return res.status(400).json({ success: false, message: "Phone number and OTP are required." });
    }

    const user = await prisma.user.findUnique({ where: { phoneNumber: normalizedPhone } });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Account is inactive. Verify your email and phone first." });
    }

    await verifyOtp({ userId: user.id, channel: otpChannel, purpose: "login_phone", code: otp });

    const tokens = issueTokens(user.id);
    const responseUser = await buildUserResponse(user);

    return res.json({
      success: true,
      message: "Login successful.",
      ...tokens,
      user: responseUser,
    });
  } catch (error) {
    next(error);
  }
};
// ─── Standard Login ───────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { password } = req.body;
    const identifier = req.body.identifier || req.body.email || req.body.phoneNumber;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "identifier (email or phoneNumber) and password are required.",
      });
    }

    let user = await findUserForLogin({ identifier });
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    if (!user.password) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    if (!user.isActive || !shouldActivateUser(user)) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive. Verify your phone and email first.",
        pendingEmail: user.email,
        pendingPhoneNumber: user.phoneNumber,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        verificationNeeded: true,
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    const tokens = issueTokens(user.id);
    const responseUser = await buildUserResponse(user);

    await prisma.authEvent.create({
      data: {
        userId: String(user.id),
        email: user.email,
        phoneNumber: user.phoneNumber || null,
        eventType: "login",
        metadata: {
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        },
      },
    });

    const displayName = await resolveDisplayName(user);
    sendLoginAlertEmail(
      { email: user.email, name: displayName, role: user.role },
      {
        time: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      }
    ).catch(() => {});

    if (user.phoneNumber) {
      sendLoginAlertSMS({ phoneNumber: user.phoneNumber }).catch(() => {});
    }

    return res.json({
      success: true,
      message: "Login successful.",
      ...tokens,
      user: responseUser,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Google OAuth (preserved) ─────────────────────────────────────────
exports.googleAuthStart = async (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = resolveGoogleRedirectUri();

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      success: false,
      message: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI.",
    });
  }

  const state = signOAuthState({ ts: Date.now(), nonce: crypto.randomBytes(12).toString("hex") });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    access_type: "offline",
    include_granted_scopes: "true",
    state,
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};

const redirectOAuthResult = (res, { error, accessToken, refreshToken }) => {
  const base = process.env.CLIENT_URL || "http://localhost:3000";
  const target = new URL("/oauth/callback", base);

  if (error) {
    target.searchParams.set("error", error);
  }
  if (accessToken) {
    target.searchParams.set("accessToken", accessToken);
  }
  if (refreshToken) {
    target.searchParams.set("refreshToken", refreshToken);
  }

  return res.redirect(target.toString());
};

exports.googleAuthCallback = async (req, res, next) => {
  try {
    if (req.query.error) {
      return redirectOAuthResult(res, { error: String(req.query.error) });
    }

    const code = String(req.query.code || "").trim();
    if (!code) {
      return redirectOAuthResult(res, { error: "missing_code" });
    }
    const state = String(req.query.state || "").trim();
    if (!verifyOAuthState(state)) {
      return redirectOAuthResult(res, { error: "invalid_state" });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = resolveGoogleRedirectUri();

    if (!clientId || !clientSecret || !redirectUri) {
      return redirectOAuthResult(res, { error: "google_oauth_not_configured" });
    }

    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    let tokenPayload = null;
    try {
      const tokenResponse = await axios.post(
        "https://oauth2.googleapis.com/token",
        tokenParams.toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10000,
        }
      );
      tokenPayload = tokenResponse?.data || null;
    } catch (error) {
      return redirectOAuthResult(res, { error: "google_token_exchange_failed" });
    }

    const googleAccessToken = tokenPayload?.access_token;

    if (!googleAccessToken) {
      return redirectOAuthResult(res, { error: "missing_google_access_token" });
    }

    let profile = null;
    try {
      const profileResponse = await axios.get("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
        timeout: 10000,
      });
      profile = profileResponse?.data || null;
    } catch (error) {
      return redirectOAuthResult(res, { error: "google_profile_fetch_failed" });
    }
    const email = normalizeEmail(profile.email);
    const providerUserId = String(profile.sub || "").trim();
    const fullName = String(profile.name || "").trim();

    if (!email || !providerUserId) {
      return redirectOAuthResult(res, { error: "invalid_google_profile" });
    }

    const user = await prisma.$transaction(async (tx) => {
      const byProvider = await tx.authProvider.findUnique({
        where: {
          provider_providerUserId: {
            provider: "google",
            providerUserId,
          },
        },
        include: { user: true },
      });

      if (byProvider?.user) {
        return byProvider.user;
      }

      const byEmail = await tx.user.findUnique({ where: { email } });

      if (byEmail) {
        await tx.authProvider.upsert({
          where: {
            userId_provider: {
              userId: byEmail.id,
              provider: "google",
            },
          },
          update: { providerUserId },
          create: {
            userId: byEmail.id,
            provider: "google",
            providerUserId,
          },
        });

        return tx.user.update({
          where: { id: byEmail.id },
          data: {
            isActive: true,
            emailVerified: true,
          },
        });
      }

      const created = await tx.user.create({
        data: {
          email,
          password: null,
          role: "freelancer",
          isActive: true,
          phoneVerified: false,
          emailVerified: true,
        },
      });

      await tx.authProvider.create({
        data: {
          userId: created.id,
          provider: "google",
          providerUserId,
        },
      });

      return created;
    });

    if (fullName) {
      await updateMyProfile(user.id, { name: fullName });
    }

    const tokens = issueTokens(user.id);
    return redirectOAuthResult(res, tokens);
  } catch (error) {
    if (error?.code === "P2002") {
      return redirectOAuthResult(res, { error: "google_account_conflict" });
    }
    next(error);
  }
};

// ─── Token Refresh ────────────────────────────────────────────────────
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: "Refresh token required." });
    }

    const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET);
    const userId = Number(decoded.id);

    if (!Number.isFinite(userId)) {
      return res.status(401).json({ success: false, message: "Invalid refresh token." });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "Invalid refresh token." });
    }

    const tokens = issueTokens(user.id);
    return res.json({ success: true, ...tokens });
  } catch (error) {
    next(error);
  }
};

// ─── Logout ───────────────────────────────────────────────────────────
exports.logout = async (_req, res) => {
  return res.json({ success: true, message: "Logged out successfully." });
};

// ─── Forgot Password ─────────────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email || "");
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

    if (!user) {
      return res.json({ success: true, message: "If that email exists, a reset code has been sent." });
    }

    const otp = await createOtp({ userId: user.id, channel: "email", purpose: "reset_password" });
    await sendPasswordResetOtpEmail({ email: user.email, name: await resolveDisplayName(user), role: user.role || "", otp });

    return res.json({ success: true, message: "If that email exists, a reset code has been sent." });
  } catch (error) {
    next(error);
  }
};

// ─── Reset Password ───────────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otp, token, password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: "New password is required." });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    }

    if (token) {
      const tokenHash = hashResetToken(token);
      const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!record || record.usedAt || record.expiresAt < new Date()) {
        return res.status(400).json({ success: false, message: "Invalid or expired reset token." });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: record.userId },
          data: { password: hashedPassword },
        }),
        prisma.passwordResetToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        }),
      ]);

      const user = await prisma.user.findUnique({ where: { id: record.userId } });
      if (user?.email) {
        const displayName = await resolveDisplayName(user);
        sendPasswordChangedEmail(
          { email: user.email, name: displayName || "", companyName: user.companyName || "" },
          { time: new Date().toISOString(), ip: req.ip, userAgent: req.headers["user-agent"] }
        ).catch(() => {});
      }
      return res.json({ success: true, message: "Password reset successfully." });
    }

    const normalizedEmail = normalizeEmail(email || "");
    if (!normalizedEmail || !otp) {
      return res.status(400).json({ success: false, message: "Email and otp are required." });
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset code." });
    }

    await verifyOtp({ userId: user.id, channel: "email", purpose: "reset_password", code: String(otp).trim() });

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    const displayName = await resolveDisplayName(user);
    sendPasswordChangedEmail(
      { email: user.email, name: displayName || "", companyName: user.companyName || "" },
      { time: new Date().toISOString(), ip: req.ip, userAgent: req.headers["user-agent"] }
    ).catch(() => {});

    return res.json({ success: true, message: "Password reset successfully." });
  } catch (error) {
    next(error);
  }
};
// ─── Get Current User ─────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  const profile = await getMyProfile(req.user.id);
  return res.json({ success: true, user: profile || buildSafeUser(req.user) });
};
