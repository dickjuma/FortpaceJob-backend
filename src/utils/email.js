require("dotenv").config();
const { Resend } = require("resend");
const dns = require("dns").promises;
const logger = require("./logger");

const resend = new Resend(process.env.RESEND_API_KEY);
const configuredFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER || "ForteSpace <noreply@smassystems.com>";

const extractEmailAddress = (from = "") => {
  const match = String(from).match(/<([^>]+)>/);
  return match ? match[1].trim().toLowerCase() : String(from).trim().toLowerCase();
};

const validateRecipientEmail = async (email) => {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new Error(`Invalid recipient email address: ${email}`);
  }
  const domain = normalized.split("@")[1];
  if (!domain) {
    throw new Error(`Invalid recipient email address: ${email}`);
  }

  // Fail fast for typo domains (e.g. zetech.ake) so API doesn't report a misleading "sent".
  try {
    const mx = await dns.resolveMx(domain);
    if (!mx || !mx.length) {
      throw new Error("No MX records found");
    }
  } catch (_) {
    throw new Error(`Recipient email domain cannot receive mail: ${domain}`);
  }
};

const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is missing. Email delivery requires Resend.");
  }

  const recipients = Array.isArray(to) ? to : [to];
  const skipMxValidation = String(process.env.SKIP_EMAIL_MX_CHECK || "").toLowerCase() === "true";
  if (!skipMxValidation) {
    await Promise.all(recipients.map((recipient) => validateRecipientEmail(recipient)));
  }

  const payloadBase = {
    to: recipients,
    subject,
    html,
    text,
  };

  try {
    const data = await resend.emails.send({ ...payloadBase, from: configuredFrom });
    const messageId = data?.id || data?.data?.id || data?.messageId || "accepted";
    logger.info(`Email sent to ${to}: ${messageId} [from=${extractEmailAddress(configuredFrom)}]`);
    return data;
  } catch (error) {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Unknown email error";
    logger.error(`Email send failed to ${to}: ${message}`);
    throw error;
  }
};

const verifyResendConnection = async () => {
  if (!process.env.RESEND_API_KEY) {
    logger.warn("Resend not configured. Set RESEND_API_KEY to enable email OTPs.");
    return false;
  }
  const fromAddress = extractEmailAddress(configuredFrom);
  const fromDomain = fromAddress.includes("@") ? fromAddress.split("@")[1] : "";
  try {
    const response = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (!response.ok) {
      const body = await response.text();
      logger.error(`Resend connection failed: HTTP ${response.status} ${body.slice(0, 160)}`);
      return false;
    }
    const payload = await response.json();
    const domains = Array.isArray(payload?.data) ? payload.data : [];
    const matching = domains.find((d) => String(d.name || "").toLowerCase() === fromDomain);
    if (!matching) {
      logger.warn(`Resend connected, but sender domain ${fromDomain} is not listed in Resend domains.`);
    } else if (String(matching.status || "").toLowerCase() !== "verified") {
      logger.warn(`Resend domain ${fromDomain} is not verified yet [status=${matching.status}].`);
    } else {
      logger.info(`Resend connected [from=${fromAddress}, domain=${fromDomain}]`);
    }
    return true;
  } catch (error) {
    logger.error(`Resend connection failed: ${error.message}`);
    return false;
  }
};

// ─── Email Templates ──────────────────────────────────────────────────────────

const sendWelcomeEmail = (user) =>
  sendEmail({
    to: user.email,
    subject: "Welcome to Forte! 🎉",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#C9452F">Welcome to Forte, ${user.name || user.companyName}!</h2>
        <p>Your account has been created successfully. You can now start ${
          user.role === "freelancer" ? "offering your services" : "hiring top talent"
        }.</p>
        <a href="${process.env.CLIENT_URL}" style="background:#C9452F;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">
          Go to Forte
        </a>
      </div>
    `,
  });

const sendPasswordResetEmail = (user, resetToken) =>
  sendEmail({
    to: user.email,
    subject: "Reset your Forte password",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#C9452F">Password Reset Request</h2>
        <p>Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${process.env.CLIENT_URL}/reset-password?token=${resetToken}" 
           style="background:#C9452F;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">
          Reset Password
        </a>
        <p style="color:#999;margin-top:24px;font-size:12px">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });

const sendProposalNotification = (client, freelancer, gig) =>
  sendEmail({
    to: client.email,
    subject: `New proposal on "${gig.title}"`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#C9452F">New Proposal Received</h2>
        <p><strong>${freelancer.name}</strong> has submitted a proposal for your gig: <strong>${gig.title}</strong>.</p>
        <a href="${process.env.CLIENT_URL}/find-work/requests/manager" 
           style="background:#C9452F;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">
          View Proposal
        </a>
      </div>
    `,
  });

const sendContractStartedEmail = (user, contract) =>
  sendEmail({
    to: user.email,
    subject: `Contract started: "${contract.title}"`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#C9452F">Your Contract Has Started</h2>
        <p>Contract <strong>${contract.title}</strong> is now active. Good luck!</p>
        <a href="${process.env.CLIENT_URL}/contracts/${contract._id}" 
           style="background:#C9452F;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">
          View Contract
        </a>
      </div>
    `,
  });

const sendVerificationEmail = (user, otp) =>
  sendEmail({
    to: user.email,
    subject: "Verify your Forte account",
    text: `Your Forte verification code is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#C9452F">Verify Your Email</h2>
        <p>Your verification code is: <strong style="font-size:24px;letter-spacing:4px">${otp}</strong></p>
        <p>This code expires in 10 minutes.</p>
        <p style="color:#999;margin-top:24px;font-size:12px">If you didn't create an account, ignore this email.</p>
      </div>
    `,
  });

const sendLoginAlertEmail = (user, metadata = {}) =>
  sendEmail({
    to: user.email,
    subject: "New login to your Forte account",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#C9452F">New Login Detected</h2>
        <p>Hello ${user.name || user.companyName || "User"}, we detected a new login to your account.</p>
        <p><strong>Time:</strong> ${metadata.time || new Date().toISOString()}</p>
        <p><strong>IP:</strong> ${metadata.ip || "Unknown"}</p>
        <p><strong>Device:</strong> ${metadata.userAgent || "Unknown"}</p>
        <p style="color:#999;margin-top:24px;font-size:12px">If this was not you, reset your password immediately.</p>
      </div>
    `,
  });

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendProposalNotification,
  sendContractStartedEmail,
  sendVerificationEmail,
  sendLoginAlertEmail,
  verifyResendConnection,
};
