const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} = require("../utils/jwt");
const {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendLoginAlertEmail,
} = require("../utils/email");
const { sanitizeUser } = require("../utils/helpers");
const {
  sendOTPViaSMS,
  sendLoginAlertSMS,
  sendWelcomeSMS,
  normalizePhoneNumber,
} = require("../utils/sms");
const { prisma } = require("../config/db");
const { savePendingProfile, applyPendingProfile, getMyProfile, updateMyProfile } = require("../utils/profileStore");

const OTP_TTL_MINUTES = 10;
const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const OTP_RESEND_LIMIT_PER_HOUR = 3;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_DELAY_SECONDS = 30; // minimum wait between resend requests

const parseRole = (role) => {
  if (!role) return "freelancer";
  return ["freelancer", "client", "admin"].includes(role) ? role : null;
};

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const isValidEmail = (email = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidPhoneNumber = (phoneNumber = "") => {
  const normalized = normalizePhoneNumber(phoneNumber || "");
  return /^\+?[1-9]\d{7,14}$/.test(normalized);
};

const hashToken = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const generateNumericOtp = () => String(Math.floor(100000 + Math.random() * 900000));

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
  return profile?.name || profile?.companyName || fallback || "";
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

const createAndSendVerificationCode = async (user, channel) => {
  const otp = generateNumericOtp();
  const payload = {
    email: channel === "email" ? user.email : null,
    phoneNumber: channel === "sms" ? user.phoneNumber : null,
    channel,
    purpose: "register",
    code: otp,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  };

  await prisma.verificationCode.create({ data: payload });

  if (channel === "sms" && user.phoneNumber) {
    await sendOTPViaSMS({ phoneNumber: user.phoneNumber, otp });
  } else if (channel === "email") {
    const displayName = await resolveDisplayName(user);
    await sendVerificationEmail({ email: user.email, name: displayName, role: user.role }, otp);
  }
};

const createPhoneVerificationCode = async ({ userId, phoneNumber }) => {
  const otp = generateNumericOtp();
  await prisma.phoneVerificationCode.create({
    data: {
      userId: Number(userId),
      phoneNumber,
      codeHash: hashToken(otp),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return otp;
};

const createEmailVerificationCode = async ({ userId, email }) => {
  const otp = generateNumericOtp();
  await prisma.verificationCode.create({
    data: {
      email,
      channel: "email",
      purpose: "register",
      code: otp,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return otp;
};

const canSendOtp = async ({ channel, user, phoneNumber }) => {
  const now = Date.now();
  const recentWindowStart = new Date(now - OTP_RESEND_DELAY_SECONDS * 1000);
  const hourWindowStart = new Date(now - 60 * 60 * 1000);

  if (channel === "phone") {
    const recent = await prisma.phoneVerificationCode.findFirst({
      where: {
        userId: user.id,
        phoneNumber,
        createdAt: { gte: recentWindowStart },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent && !recent.consumedAt) {
      const waitSeconds = Math.ceil((recent.createdAt.getTime() + OTP_RESEND_DELAY_SECONDS * 1000 - now) / 1000);
      return {
        allowed: false,
        message: `Try again in ${waitSeconds} second${waitSeconds !== 1 ? "s" : ""}.`,
      };
    }

    const sentLastHour = await prisma.phoneVerificationCode.count({
      where: {
        userId: user.id,
        phoneNumber,
        createdAt: { gte: hourWindowStart },
      },
    });
    if (sentLastHour >= OTP_RESEND_LIMIT_PER_HOUR) {
      return {
        allowed: false,
        message: "Too many OTP requests. Please wait before trying again.",
      };
    }
    return { allowed: true };
  }

  const recent = await prisma.verificationCode.findFirst({
    where: {
      email: user.email,
      channel: "email",
      createdAt: { gte: recentWindowStart },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent && !recent.consumedAt) {
    const waitSeconds = Math.ceil((recent.createdAt.getTime() + OTP_RESEND_DELAY_SECONDS * 1000 - now) / 1000);
    return {
      allowed: false,
      message: `Try again in ${waitSeconds} second${waitSeconds !== 1 ? "s" : ""}.`,
    };
  }

  const sentLastHour = await prisma.verificationCode.count({
    where: {
      email: user.email,
      channel: "email",
      createdAt: { gte: hourWindowStart },
    },
  });
  if (sentLastHour >= OTP_RESEND_LIMIT_PER_HOUR) {
    return {
      allowed: false,
      message: "Too many OTP requests. Please wait before trying again.",
    };
  }
  return { allowed: true };
};

exports.register = async (req, res, next) => {
  try {
    const { role, email, phoneNumber, password, fullName, name, ...profilePayload } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhoneNumber(phoneNumber || "");
    const safeRole = parseRole(role);
    const resolvedName = String(fullName || name || "").trim();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour expiry

    // required fields validation
    if (!safeRole || !normalizedEmail || !password || !resolvedName) {
      return res.status(400).json({
        success: false,
        message: "Role, name, email, and password are required.",
      });
    }
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "Provide a valid email address." });
    }
    if (normalizedPhone && !isValidPhoneNumber(normalizedPhone)) {
      return res.status(400).json({ success: false, message: "Provide a valid phone number in international format." });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    }

    // Check for existing user (active or inactive)
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { phoneNumber: normalizedPhone }],
      },
    });
    
    if (existingUser) {
      // If user is already active/verified, deny registration
      if (existingUser.isActive || existingUser.isVerified) {
        return res.status(409).json({ success: false, message: "Email or phone already registered and verified." });
      }
      
      // If user exists but is not active, we treat it as a retry.
      // Update password and profile, then resend OTPs.
      const newHashedPassword = await bcrypt.hash(password, 12);
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { password: newHashedPassword, role: safeRole }
      });

      const profileData = Object.keys(profilePayload).length ? { ...profilePayload, name: resolvedName } : { name: resolvedName };
      await savePendingProfile(existingUser.id, profileData);

      const resendPhoneOtp = await createPhoneVerificationCode({ userId: existingUser.id, phoneNumber: normalizedPhone });
      const resendEmailOtp = await createEmailVerificationCode({ userId: existingUser.id, email: normalizedEmail });

      await sendOTPViaSMS({ phoneNumber: normalizedPhone, otp: resendPhoneOtp });
      await sendVerificationEmail({ email: normalizedEmail, name: resolvedName, role: safeRole }, resendEmailOtp).catch(() => {});
      
      return res.status(202).json({
        success: true,
        message: "Verification pending. We sent new codes to your email and phone.",
        userId: existingUser.id,
        pendingPhoneNumber: normalizedPhone,
        pendingEmail: normalizedEmail,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create new User with isActive = false
    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        phoneNumber: normalizedPhone,
        password: hashedPassword,
        role: safeRole,
        isActive: false,
        phoneVerified: false,
        emailVerified: false,
        isVerified: false
      },
    });

    // Save pending profile
    const profileData = Object.keys(profilePayload).length ? { ...profilePayload, name: resolvedName } : { name: resolvedName };
    await savePendingProfile(created.id, profileData);

    // Generate AND Store OTPs
    const phoneOtp = await createPhoneVerificationCode({ userId: created.id, phoneNumber: normalizedPhone });
    const emailOtp = await createEmailVerificationCode({ userId: created.id, email: normalizedEmail });

    await sendOTPViaSMS({ phoneNumber: normalizedPhone, otp: phoneOtp });
    await sendVerificationEmail({ email: normalizedEmail, name: resolvedName, role: safeRole }, emailOtp).catch(() => {});

    return res.status(201).json({
      success: true,
      message: "Registration successful. Verify your phone and email using the codes sent to you.",
      userId: created.id,
      pendingPhoneNumber: normalizedPhone,
      pendingEmail: normalizedEmail,
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyPhoneOTP = async (req, res, next) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email);
    const normalizedPhone = normalizePhoneNumber(req.body.phoneNumber || "");
    const otp = String(req.body.otp || req.body.phoneOtp || req.body.emailOtp || "").trim();

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

    if (user.phoneVerified && user.isActive) {
      const tokens = issueTokens(user.id);
      const responseUser = await buildUserResponse(user);
      return res.json({ success: true, message: "Phone already verified.", ...tokens, user: responseUser });
    }

    const targetPhone = normalizePhoneNumber(normalizedPhone || user.phoneNumber || "");
    if (!targetPhone) {
      return res.status(400).json({ success: false, message: "No phone number found for this account." });
    }

    const code = await prisma.phoneVerificationCode.findFirst({
      where: {
        userId: user.id,
        phoneNumber: targetPhone,
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!code || code.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP." });
    }

    if (code.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ success: false, message: "Too many failed OTP attempts. Request a new OTP." });
    }

    if (code.codeHash !== hashToken(otp)) {
      await prisma.phoneVerificationCode.update({
        where: { id: code.id },
        data: { attempts: { increment: 1 } },
      });
      return res.status(400).json({ success: false, message: "Invalid or expired OTP." });
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      await tx.phoneVerificationCode.update({
        where: { id: code.id },
        data: { consumedAt: new Date() },
      });

      // only activate if email already verified
      const shouldActivate = !!user.emailVerified;
      return tx.user.update({
        where: { id: user.id },
        data: {
          phoneVerified: true,
          phoneNumber: targetPhone,
          isActive: shouldActivate ? true : user.isActive,
        },
      });
    });

    // only send welcome messages if account just became active
    if (updatedUser.isActive && !user.isActive) {
      const displayName = await resolveDisplayName(updatedUser);
      sendWelcomeEmail({
        email: updatedUser.email,
        role: updatedUser.role,
        name: displayName,
        companyName: null,
      }).catch(() => {});

      sendWelcomeSMS({
        phoneNumber: targetPhone,
        name: displayName || "",
      }).catch(() => {});
    }

    const tokens = issueTokens(updatedUser.id);
    const responseUser = await buildUserResponse(updatedUser);

    return res.json({
      success: true,
      message: "Phone verified successfully.",
      ...tokens,
      user: responseUser,
    });
  } catch (error) {
    next(error);
  }
};

// generic verify endpoint; choose channel based on explicit channel or which OTP field is present
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
    // handle email OTP; some clients pass emailOtp, phoneNumber
    req.body.otp = req.body.emailOtp;
    return exports.verifyEmailOTP(req, res, next);
  }
  // default to phone
  req.body.otp = req.body.phoneOtp || req.body.otp;
  return exports.verifyPhoneOTP(req, res, next);
};

exports.verifyEmailOTP = async (req, res, next) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email || "");
    const otp = String(req.body.otp || "").trim();

    if (!normalizedEmail || !otp) {
      return res.status(400).json({ success: false, message: "Provide email and otp." });
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const code = await prisma.verificationCode.findFirst({
      where: {
        email: normalizedEmail,
        channel: "email",
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!code || code.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP." });
    }

    if (code.code !== otp) {
      // consider tracking attempts if desired
      return res.status(400).json({ success: false, message: "Invalid or expired OTP." });
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      await tx.verificationCode.update({
        where: { id: code.id },
        data: { consumedAt: new Date() },
      });

      const data = { emailVerified: true };
      if (user.phoneVerified) data.isActive = true;

      return tx.user.update({
        where: { id: user.id },
        data,
      });
    });

    if (!user.emailVerified) {
      await applyPendingProfile(user.id);
    }

    // send welcome mails once account becomes active
    if (updatedUser.isActive && !user.isActive) {
      const displayName = await resolveDisplayName(updatedUser);
      sendWelcomeEmail({ email: updatedUser.email, role: updatedUser.role, name: displayName }).catch(() => {});
      if (updatedUser.phoneNumber) {
        sendWelcomeSMS({ phoneNumber: updatedUser.phoneNumber, name: displayName || "" }).catch(() => {});
      }
    }

    const tokens = issueTokens(updatedUser.id);
    const responseUser = await buildUserResponse(updatedUser);

    return res.json({
      success: true,
      message: "Email verified successfully.",
      ...tokens,
      user: responseUser,
    });
  } catch (error) {
    next(error);
  }
};

exports.completeRegistration = async (_req, res) => {
  return res.status(400).json({
    success: false,
    message: "Registration is completed automatically after successful phone OTP verification.",
  });
};

exports.resendOTP = async (req, res, next) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email);
    const normalizedPhone = normalizePhoneNumber(req.body.phoneNumber || "");
    const channel = String(req.body.channel || "phone").toLowerCase();

    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({ success: false, message: "Provide email or phoneNumber." });
    }

    const user = normalizedEmail
      ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
      : await prisma.user.findUnique({ where: { phoneNumber: normalizedPhone } });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (channel === "phone") {
      if (user.phoneVerified && user.isActive) {
        return res.status(400).json({ success: false, message: "Phone is already verified for this account." });
      }
      if (!user.phoneNumber) {
        return res.status(400).json({ success: false, message: "No phone number is linked to this account." });
      }
      const gate = await canSendOtp({ channel: "phone", user, phoneNumber: user.phoneNumber });
      if (!gate.allowed) {
        return res.status(429).json({ success: false, message: gate.message });
      }

      const otp = await createPhoneVerificationCode({ userId: user.id, phoneNumber: user.phoneNumber });
      await sendOTPViaSMS({ phoneNumber: user.phoneNumber, otp });
      return res.json({ success: true, message: "OTP resent to your phone number." });
    }

    if (channel === "email") {
      if (user.emailVerified && user.isActive) {
        return res.status(400).json({ success: false, message: "Email is already verified for this account." });
      }
      if (!user.email) {
        return res.status(400).json({ success: false, message: "No email is linked to this account." });
      }
      const gate = await canSendOtp({ channel: "email", user, phoneNumber: user.phoneNumber });
      if (!gate.allowed) {
        return res.status(429).json({ success: false, message: gate.message });
      }

      const displayName = await resolveDisplayName(user);
      const otp = await createEmailVerificationCode({ userId: user.id, email: user.email });
      await sendVerificationEmail({ email: user.email, name: displayName || "", role: user.role || "" }, otp);
      return res.json({ success: true, message: "OTP resent to your email address." });
    }

    return res.status(400).json({ success: false, message: "Unknown channel." });
  } catch (error) {
    next(error);
  }
};

exports.sendLoginOTP = async (_req, res) => {
  return res.status(400).json({
    success: false,
    message: "Phone OTP login is disabled. Use phoneNumber + password or Google OAuth.",
  });
};

exports.loginWithPhoneOTP = async (_req, res) => {
  return res.status(400).json({
    success: false,
    message: "Phone OTP login is disabled. Use phoneNumber + password or Google OAuth.",
  });
};

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

    // require both phone and email verification before allowing login
    if (!user.isActive || !user.phoneVerified || !user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive. Verify your phone and email first.",
        pendingEmail: user.email,
        pendingPhoneNumber: user.phoneNumber,
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    const tokens = issueTokens(user.id);
    const responseUser = await buildUserResponse(user);

    // record event for auditing
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

exports.googleAuthStart = async (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      success: false,
      message: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI.",
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
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

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

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

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      return redirectOAuthResult(res, { error: "google_token_exchange_failed" });
    }

    const tokenPayload = await tokenResponse.json();
    const googleAccessToken = tokenPayload.access_token;

    if (!googleAccessToken) {
      return redirectOAuthResult(res, { error: "missing_google_access_token" });
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    if (!profileResponse.ok) {
      return redirectOAuthResult(res, { error: "google_profile_fetch_failed" });
    }

    const profile = await profileResponse.json();
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

exports.logout = async (_req, res) => {
  return res.json({ success: true, message: "Logged out successfully." });
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

    if (!user) {
      return res.json({ success: true, message: "If that email exists, a reset link has been sent." });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    const displayName = await resolveDisplayName(user);
    await sendPasswordResetEmail({ email: user.email, name: displayName, role: user.role }, rawToken);

    return res.json({ success: true, message: "If that email exists, a reset link has been sent." });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: "Token and new password are required." });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    }

    const tokenHash = hashToken(token);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset token." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: {
          password: hashedPassword,
          isActive: true,
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return res.json({ success: true, message: "Password reset successfully." });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res) => {
  const profile = await getMyProfile(req.user.id);
  return res.json({ success: true, user: profile || buildSafeUser(req.user) });
};
