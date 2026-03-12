/**
 * Forte Platform — Shared Utility Helpers
 */

/**
 * Build a paginated response object
 */
const paginate = (data, total, page, limit) => ({
  data,
  pagination: {
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    pages: Math.ceil(total / limit),
  },
});

/**
 * Parse pagination query params with defaults
 */
const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, parseInt(query.limit) || 20);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Slugify a string
 */
const slugify = (str) =>
  str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Calculate platform fee (Forte takes 10%)
 */
const calculateFee = (amount) => {
  const fee = parseFloat((amount * 0.1).toFixed(2));
  const net = parseFloat((amount - fee).toFixed(2));
  return { fee, net, gross: amount };
};

/**
 * Format currency
 */
const formatCurrency = (amount, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

/**
 * Generate a random 6-digit OTP
 */
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

/**
 * Sanitize user object (remove sensitive fields)
 */
const sanitizeUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.refreshToken;
  delete obj.__v;
  return obj;
};

/**
 * Build a MongoDB text search filter
 */
const buildSearchFilter = (query, fields) => {
  if (!query) return {};
  const regex = new RegExp(query, "i");
  return { $or: fields.map((f) => ({ [f]: regex })) };
};

/**
 * Compute average rating from an array of numbers
 */
const avgRating = (ratings) => {
  if (!ratings || ratings.length === 0) return 0;
  return parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1));
};

module.exports = {
  paginate,
  getPagination,
  slugify,
  calculateFee,
  formatCurrency,
  generateOTP,
  sanitizeUser,
  buildSearchFilter,
  avgRating,
};
