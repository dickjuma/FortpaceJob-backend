const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");
const logger = require("../utils/logger");


const CLOUDINARY_CONFIG = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLAUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY || process.env.CLAUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET || process.env.CLAUDINARY_API_SECRET,
};


const isValidConfigValue = (value) => {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed === "") return false;
  const lower = trimmed.toLowerCase();
 
  const placeholders = ["your_cloud_name", "your_api_key", "your_api_secret", "undefined", "null"];
  return !placeholders.some((p) => lower.includes(p));
};


const isCloudinaryConfigured = () => {
  return (
    isValidConfigValue(CLOUDINARY_CONFIG.cloudName) &&
    isValidConfigValue(CLOUDINARY_CONFIG.apiKey) &&
    isValidConfigValue(CLOUDINARY_CONFIG.apiSecret)
  );
};


if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CONFIG.cloudName,
    api_key: CLOUDINARY_CONFIG.apiKey,
    api_secret: CLOUDINARY_CONFIG.apiSecret,
  });
} else {
  logger.warn(
    "Cloudinary credentials missing or invalid. Uploads will fail until configured correctly."
  );
}

// ─── Error formatting ──────────────────────────────────────────────────────────
/**
 * Extract a human-readable error message from various error shapes
 */
const formatCloudinaryError = (error) => {
  if (!error) return "Unknown Cloudinary error";
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  if (error.error?.message) return error.error.message;
  if (Array.isArray(error.errors) && error.errors[0]?.message) return error.errors[0].message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

// ─── Connection verification ───────────────────────────────────────────────────
/**
 * Verify connectivity to Cloudinary by calling ping endpoint
 * @returns {Promise<boolean>} true if connection succeeds
 */
const verifyCloudinaryConnection = async () => {
  if (!isCloudinaryConfigured()) {
    logger.error(
      "Cannot verify Cloudinary connection: credentials are missing or invalid. " +
      "Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
    );
    return false;
  }

  try {
    await cloudinary.api.ping();
    logger.info(`Cloudinary connected (cloud: ${CLOUDINARY_CONFIG.cloudName})`);
    return true;
  } catch (error) {
    logger.error(`Cloudinary connection failed: ${formatCloudinaryError(error)}`);
    return false;
  }
};

// ─── Core upload function ──────────────────────────────────────────────────────
/**
 * Upload a buffer to Cloudinary
 * @param {Buffer} buffer - file content as buffer
 * @param {Object} options - Cloudinary upload options (folder, transformation, etc.)
 * @returns {Promise<Object>} Cloudinary upload result
 * @throws {Error} if credentials missing or upload fails
 */
const uploadToCloudinary = (buffer, options = {}) => {
  if (!isCloudinaryConfigured()) {
    return Promise.reject(
      new Error(
        "Cloudinary credentials are not configured. " +
        "Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
      )
    );
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });

    // Convert buffer to readable stream and pipe to upload stream
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
};

// ─── Specialised upload functions ──────────────────────────────────────────────
/**
 * Upload a user avatar (automatically resized to 400x400)
 */
const uploadAvatar = (buffer) =>
  uploadToCloudinary(buffer, {
    folder: "forte/avatars",
    transformation: [{ width: 400, height: 400, crop: "fill" }],
    resource_type: "image",
  });

/**
 * Upload a wide profile cover photo.
 */
const uploadCoverPhoto = (buffer) =>
  uploadToCloudinary(buffer, {
    folder: "forte/covers",
    transformation: [{ width: 1600, height: 500, crop: "fill" }],
    resource_type: "image",
  });

/**
 * Upload a portfolio file (image or PDF)
 * @param {Buffer} buffer
 * @param {string} mimetype - e.g., 'image/png' or 'application/pdf'
 */
const uploadPortfolioFile = (buffer, mimetype) =>
  uploadToCloudinary(buffer, {
    folder: "forte/portfolio",
    resource_type: mimetype === "application/pdf" ? "raw" : "image",
  });

/**
 * Upload an intro video
 */
const uploadVideo = (buffer) =>
  uploadToCloudinary(buffer, {
    folder: "forte/videos",
    resource_type: "video",
  });

/**
 * Delete a file from Cloudinary by its public ID
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - 'image', 'video', or 'raw'
 * @returns {Promise<Object>} deletion result
 */
const deleteFromCloudinary = (publicId, resourceType = "image") =>
  cloudinary.uploader.destroy(publicId, { resource_type: resourceType });

// ─── Module exports ────────────────────────────────────────────────────────────
module.exports = {
  cloudinary,               // raw instance (use sparingly)
  uploadToCloudinary,
  uploadAvatar,
  uploadCoverPhoto,
  uploadPortfolioFile,
  uploadVideo,
  deleteFromCloudinary,
  isCloudinaryConfigured,   // renamed from cloudinaryConfigured
  verifyCloudinaryConnection,
};
