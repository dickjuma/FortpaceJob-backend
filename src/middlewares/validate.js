/**
 * Simple request body validator middleware factory.
 * Pass an array of required field names; returns 400 if any are missing.
 */
const requireFields = (...fields) => {
  return (req, res, next) => {
    const missing = fields.filter((f) => {
      const val = req.body[f];
      return val === undefined || val === null || val === "";
    });
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }
    next();
  };
};

/**
 * Validate email format
 */
const validateEmail = (req, res, next) => {
  const { email } = req.body;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: "Invalid email format." });
  }
  next();
};

/**
 * Validate password strength
 */
const validatePassword = (req, res, next) => {
  const { password } = req.body;
  if (password && password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters.",
    });
  }
  next();
};

/**
 * Validate MongoDB ObjectId param
 */
const validateObjectId = (paramName = "id") => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({ success: false, message: `Invalid ${paramName}.` });
    }
    next();
  };
};

module.exports = { requireFields, validateEmail, validatePassword, validateObjectId };
