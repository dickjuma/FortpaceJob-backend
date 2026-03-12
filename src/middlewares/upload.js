const multer = require("multer");
const { uploadAvatar, uploadPortfolioFile, uploadVideo } = require("../config/cloudinary");

const parseUploadLimitMb = (envName, fallback) => {
  const raw = process.env[envName];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const AVATAR_LIMIT_MB = parseUploadLimitMb("MAX_AVATAR_MB", 5);
const PORTFOLIO_LIMIT_MB = parseUploadLimitMb("MAX_PORTFOLIO_FILE_MB", 20);
const INTRO_VIDEO_LIMIT_MB = parseUploadLimitMb("MAX_INTRO_VIDEO_MB", 500);

// ─── All uploads use memory storage; files are streamed to Cloudinary ─────────
const memoryStorage = multer.memoryStorage();

const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) cb(null, true);
  else cb(new Error("Only image files are allowed."), false);
};

const portfolioFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only images and PDFs are allowed."), false);
};

const videoFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("video/")) cb(null, true);
  else cb(new Error("Only video files are allowed."), false);
};

// ─── Multer instances ─────────────────────────────────────────────────────────
const uploadAvatarMW = multer({
  storage: memoryStorage,
  limits: { fileSize: AVATAR_LIMIT_MB * 1024 * 1024 },
  fileFilter: imageFilter,
});

const uploadPortfolioMW = multer({
  storage: memoryStorage,
  limits: { fileSize: PORTFOLIO_LIMIT_MB * 1024 * 1024 },
  fileFilter: portfolioFilter,
});

const uploadVideoMW = multer({
  storage: memoryStorage,
  limits: { fileSize: INTRO_VIDEO_LIMIT_MB * 1024 * 1024 },
  fileFilter: videoFilter,
});

const uploadMemory = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── Cloudinary upload helpers (called inside controllers) ────────────────────
/**
 * Upload req.file buffer to Cloudinary as avatar
 * Attaches result URL to req.uploadedUrl
 */
const processAvatarUpload = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const result = await uploadAvatar(req.file.buffer);
    req.uploadedUrl = result.secure_url;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Upload req.files buffers to Cloudinary as portfolio items
 * Attaches result URLs array to req.uploadedUrls
 */
const processPortfolioUpload = async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();
  try {
    const uploads = await Promise.all(
      req.files.map((f) => uploadPortfolioFile(f.buffer, f.mimetype))
    );
    req.uploadedUrls = uploads.map((r) => r.secure_url);
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  uploadAvatar: uploadAvatarMW,
  uploadPortfolio: uploadPortfolioMW,
  uploadVideo: uploadVideoMW,
  uploadMemory,
  processAvatarUpload,
  processPortfolioUpload,
};
