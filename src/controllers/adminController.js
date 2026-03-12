const User = require("../models/User");
const Gig = require("../models/Gig");
const Contract = require("../models/Contract");
const Transaction = require("../models/Transaction");
const BuyerRequest = require("../models/BuyerRequest");
const { getPagination, paginate } = require("../utils/helpers");

// ─── Dashboard stats ──────────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalFreelancers,
      totalClients,
      totalGigs,
      totalContracts,
      completedContracts,
      totalRevenue,
    ] = await Promise.all([
      User.countDocuments({ isBanned: false }),
      User.countDocuments({ role: "freelancer", isBanned: false }),
      User.countDocuments({ role: "client", isBanned: false }),
      Gig.countDocuments({ status: "active" }),
      Contract.countDocuments(),
      Contract.countDocuments({ status: "completed" }),
      Transaction.aggregate([
        { $match: { type: "platform_fee", status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalFreelancers,
        totalClients,
        totalGigs,
        totalContracts,
        completedContracts,
        totalRevenue: totalRevenue[0]?.total || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── List all users ───────────────────────────────────────────────────────────
exports.getUsers = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.banned === "true") filter.isBanned = true;

    const [users, total] = await Promise.all([
      User.find(filter).select("-password -refreshToken").sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(users, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Ban / unban user ─────────────────────────────────────────────────────────
exports.toggleBanUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (user.role === "admin") return res.status(403).json({ success: false, message: "Cannot ban an admin." });

    user.isBanned = !user.isBanned;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: `User ${user.isBanned ? "banned" : "unbanned"}.`, isBanned: user.isBanned });
  } catch (error) {
    next(error);
  }
};

// ─── Approve / reject gig ─────────────────────────────────────────────────────
exports.reviewGig = async (req, res, next) => {
  try {
    const { action } = req.body; // "approve" | "reject"
    const gig = await Gig.findById(req.params.id);
    if (!gig) return res.status(404).json({ success: false, message: "Gig not found." });

    gig.status = action === "approve" ? "active" : "rejected";
    await gig.save();

    res.json({ success: true, message: `Gig ${gig.status}.`, gig });
  } catch (error) {
    next(error);
  }
};

// ─── Get all contracts ────────────────────────────────────────────────────────
exports.getContracts = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [contracts, total] = await Promise.all([
      Contract.find(filter)
        .populate("client", "name companyName email")
        .populate("freelancer", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Contract.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(contracts, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Resolve dispute ──────────────────────────────────────────────────────────
exports.resolveDispute = async (req, res, next) => {
  try {
    const { resolution, refundClient } = req.body;
    const contract = await Contract.findOne({ _id: req.params.id, status: "disputed" });
    if (!contract) return res.status(404).json({ success: false, message: "Disputed contract not found." });

    contract.status = refundClient ? "cancelled" : "completed";
    contract.paymentStatus = refundClient ? "refunded" : "released";
    contract.cancellationReason = resolution;
    await contract.save();

    res.json({ success: true, message: "Dispute resolved.", contract });
  } catch (error) {
    next(error);
  }
};
