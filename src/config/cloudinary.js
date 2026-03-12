const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");
const logger = require("../utils/logger");

const pickFirstValid = (...values) => values.find((v) => v && !v.toLowerCase().includes("your_")) || "";

const resolvedCloudName = pickFirstValid(
  process.env.CLOUDINARY_CLOUD_NAME,
  process.env.CLAUDINARY_CLOUD_NAME
);
const resolvedApiKey = pickFirstValid(process.env.CLOUDINARY_API_KEY, process.env.CLAUDINARY_API_KEY);
const resolvedApiSecret = pickFirstValid(
  process.env.CLOUDINARY_API_SECRET,
  process.env.CLAUDINARY_API_SECRET
);

cloudinary.config({
  cloud_name: resolvedCloudName,
  api_key: resolvedApiKey,
  api_secret: resolvedApiSecret,
});

const cloudinaryConfigured = () => {
  const cloudName = resolvedCloudName;
  const apiKey = resolvedApiKey;
  const apiSecret = resolvedApiSecret;

  const invalid = (value) =>
    !value ||
    /^\*+$/.test(value.trim()) ||
    value.trim().toLowerCase() === "undefined" ||
    value.toLowerCase().includes("your_cloud_name") ||
    value.toLowerCase().includes("your_api_key") ||
    value.toLowerCase().includes("your_api_secret");

  return !invalid(cloudName) && !invalid(apiKey) && !invalid(apiSecret);
};

const formatCloudinaryError = (error) => {
  if (!error) return "Unknown Cloudinary error";
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  if (error.error?.message) return error.error.message;
  if (Array.isArray(error.errors) && error.errors[0]?.message) return error.errors[0].message;
  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
};

const verifyCloudinaryConnection = async () => {
  if (!cloudinaryConfigured()) {
    logger.error(
      "Cloudinary not configured. Provide CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET (or CLAUDINARY_* fallback)."
    );
    return false;
  }

  try {
    // Lightweight auth verification
    await cloudinary.api.ping();
    logger.info(`Cloudinary connected [cloud=${resolvedCloudName}]`);
    return true;
  } catch (error) {
    logger.error(`Cloudinary connection failed: ${formatCloudinaryError(error)}`);
    return false;
  }
};

/**
 * Upload a buffer to Cloudinary
 * @param {Buffer} buffer - file buffer
 * @param {Object} options - cloudinary upload options
 * @returns {Promise<Object>} cloudinary upload result
 */
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!cloudinaryConfigured()) {
      return reject(
        new Error(
          "Cloudinary credentials are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET."
        )
      );
    }
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Upload avatar / logo
 */
const uploadAvatar = (buffer) =>
  uploadToCloudinary(buffer, {
    folder: "forte/avatars",
    transformation: [{ width: 400, height: 400, crop: "fill" }],
    resource_type: "image",
  });

/**
 * Upload portfolio image or PDF
 */
const uploadPortfolioFile = (buffer, mimetype) =>
  uploadToCloudinary(buffer, {
    folder: "forte/portfolio",
    resource_type: mimetype === "application/pdf" ? "raw" : "image",
  });

/**
 * Upload intro video
 */
const uploadVideo = (buffer) =>
  uploadToCloudinary(buffer, {
    folder: "forte/videos",
    resource_type: "video",
  });

/**
 * Delete a file from Cloudinary by public_id
 */
const deleteFromCloudinary = (publicId, resourceType = "image") =>
  cloudinary.uploader.destroy(publicId, { resource_type: resourceType });

module.exports = {
  cloudinary,
  uploadToCloudinary,
  uploadAvatar,
  uploadPortfolioFile,
  uploadVideo,
  deleteFromCloudinary,
  cloudinaryConfigured,
  verifyCloudinaryConnection,
};
