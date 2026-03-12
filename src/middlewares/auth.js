const { verifyToken } = require("../utils/jwt");
const { prisma } = require("../config/db");

const toNumericId = (id) => {
  const value = Number(id);
  return Number.isFinite(value) ? value : null;
};

/**
 * Protect routes - requires valid JWT
 */
const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: "Not authorized. No token provided." });
    }

    const decoded = verifyToken(token);
    const userId = toNumericId(decoded.id);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Invalid token payload." });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(401).json({ success: false, message: "User no longer exists." });
    }

    req.user = user;
    next();
  } catch (_) {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
};

/**
 * Restrict to specific roles
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(" or ")}.`,
      });
    }
    next();
  };
};

/**
 * Optional auth - attaches user if token present
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (token) {
      const decoded = verifyToken(token);
      const userId = toNumericId(decoded.id);
      if (userId) {
        req.user = await prisma.user.findUnique({ where: { id: userId } });
      }
    }
  } catch (_) {
    // ignore invalid token
  }
  next();
};

module.exports = { protect, restrictTo, optionalAuth };
