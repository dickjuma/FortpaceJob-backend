const jwt = require("jsonwebtoken");

const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "30d",
  });
};

const verifyToken = (token, secret = process.env.JWT_SECRET) => {
  return jwt.verify(token, secret);
};

const generatePasswordResetToken = (userId) => {
  return jwt.sign({ id: userId, purpose: "reset" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  generatePasswordResetToken,
};
