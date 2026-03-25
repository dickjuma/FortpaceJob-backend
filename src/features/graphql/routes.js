const express = require("express");
const { verifyToken } = require("../../utils/jwt");
const { prisma } = require("../../config/db");
const { sanitizeUser } = require("../../utils/helpers");
const { getMyProfile, updateMyProfile } = require("../../utils/profileStore");

const router = express.Router();

const loadUserFromAuthHeader = async (req) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  const userId = Number(decoded.id);
  if (!Number.isFinite(userId)) return null;
  return prisma.user.findUnique({ where: { id: userId } });
};

router.post("/", async (req, res, next) => {
  try {
    const { query = "", operationName, variables = {} } = req.body || {};
    const op = operationName || (query.includes("updateMyProfile") ? "UpdateMyProfile" : "Me");

    const user = await loadUserFromAuthHeader(req);
    if (!user) return res.status(401).json({ errors: [{ message: "Unauthorized" }] });

    if (op === "Me") {
      const profile = await getMyProfile(user.id);
      return res.json({ data: { me: profile || sanitizeUser({ ...user, _id: user.id }) } });
    }

    if (op === "UpdateMyProfile") {
      const input = variables.input || {};
      const updated = await updateMyProfile(user.id, input);
      return res.json({ data: { updateMyProfile: updated } });
    }

    return res.status(400).json({
      errors: [{ message: "Unsupported operation. Available: Me, UpdateMyProfile" }],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

