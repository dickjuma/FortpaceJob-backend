const logger = require("../utils/logger");

/**
 * 404 Not Found handler
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || "Internal Server Error";
  const introVideoLimitMb = Number(process.env.MAX_INTRO_VIDEO_MB || 500);
  const avatarLimitMb = Number(process.env.MAX_AVATAR_MB || 5);
  const portfolioLimitMb = Number(process.env.MAX_PORTFOLIO_FILE_MB || 20);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    statusCode = 400;
    const errors = Object.values(err.errors).map((e) => e.message);
    message = errors.join(", ");
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`;
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // Multer upload errors
  if (err.name === "MulterError") {
    statusCode = 413;
    if (err.code === "LIMIT_FILE_SIZE") {
      if (req.originalUrl.includes("/intro-video")) {
        message = `Intro video is too large. Maximum allowed size is ${introVideoLimitMb}MB.`;
      } else if (req.originalUrl.includes("/avatar") || req.originalUrl.includes("/company-logo")) {
        message = `Image is too large. Maximum allowed size is ${avatarLimitMb}MB.`;
      } else if (req.originalUrl.includes("/portfolio")) {
        message = `Portfolio file is too large. Maximum allowed size is ${portfolioLimitMb}MB per file.`;
      } else {
        message = "Uploaded file is too large.";
      }
    } else {
      message = err.message || "File upload error.";
    }
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token.";
  }
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired.";
  }

  // Log server errors
  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.originalUrl} — ${err.stack || err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };
