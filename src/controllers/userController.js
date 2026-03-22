const User = require("../models/User");
const Review = require("../models/Review");
const { sendPasswordChangedEmail } = require("../utils/email");
const { sanitizeUser, getPagination, paginate, buildSearchFilter } = require("../utils/helpers");

// ─── Get public profile ───────────────────────────────────────────────────────
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select(
      "-password -refreshToken -passwordResetToken -passwordResetExpires -isBanned"
    );
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    // Fetch recent reviews
    const reviews = await Review.find({ reviewee: user._id, isPublic: true })
      .populate("reviewer", "name avatar companyName role")
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({ success: true, user, reviews });
  } catch (error) {
    next(error);
  }
};

// ─── Update own profile ───────────────────────────────────────────────────────
exports.updateProfile = async (req, res, next) => {
  try {
    const allowedFields = [
      "name", "companyName", "bio", "skills", "hourlyRate", "currency",
      "serviceMode", "physicalCategory", "serviceArea",
      "companyDescription", "industry", "budget", "hiringCapacity",
      "country", "languages", "phoneNumber",
    ];

    const updates = {};
    allowedFields.forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    // Handle avatar upload
    if (req.file) {
      updates.avatar = req.file.path; // Cloudinary URL
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, message: "Profile updated.", user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};

// ─── Search / list freelancers (talent directory) ─────────────────────────────
exports.searchTalent = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { q, category, serviceMode, country, minRate, maxRate, sort } = req.query;

    const filter = { role: "freelancer", isActive: true, isBanned: false };

    if (q) {
      const searchFilter = buildSearchFilter(q, ["name", "bio", "skills"]);
      Object.assign(filter, searchFilter);
    }
    if (serviceMode) filter.serviceMode = serviceMode;
    if (country) filter.country = country;
    if (category) filter.physicalCategory = category;
    if (minRate || maxRate) {
      filter.hourlyRate = {};
      if (minRate) filter.hourlyRate.$gte = Number(minRate);
      if (maxRate) filter.hourlyRate.$lte = Number(maxRate);
    }

    const sortMap = {
      rating: { avgRating: -1 },
      orders: { completedOrders: -1 },
      rate_asc: { hourlyRate: 1 },
      rate_desc: { hourlyRate: -1 },
      newest: { createdAt: -1 },
    };
    const sortOption = sortMap[sort] || { avgRating: -1 };

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("name avatar bio skills hourlyRate currency serviceMode country avgRating totalReviews level badges completedOrders")
        .sort(sortOption)
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(users, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Change password ──────────────────────────────────────────────────────────
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Both passwords are required." });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ success: false, message: "Current password is incorrect." });
    }

    user.password = newPassword;
    await user.save();

    if (user.email) {
      sendPasswordChangedEmail(
        { email: user.email, name: user.name || "", companyName: user.companyName || "" },
        { time: new Date().toISOString(), ip: req.ip, userAgent: req.headers["user-agent"] }
      ).catch(() => {});
    }

    res.json({ success: true, message: "Password changed successfully." });
  } catch (error) {
    next(error);
  }
};

// ─── Upload portfolio files ───────────────────────────────────────────────────
exports.uploadPortfolio = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "No files uploaded." });
    }

    const urls = req.files.map((f) => f.path);
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $push: { portfolio: { $each: urls } } },
      { new: true }
    );

    res.json({ success: true, message: "Portfolio updated.", portfolio: user.portfolio });
  } catch (error) {
    next(error);
  }
};

// ─── Delete portfolio item ────────────────────────────────────────────────────
exports.deletePortfolioItem = async (req, res, next) => {
  try {
    const { url } = req.body;
    await User.findByIdAndUpdate(req.user._id, { $pull: { portfolio: url } });
    res.json({ success: true, message: "Portfolio item removed." });
  } catch (error) {
    next(error);
  }
};

// ─── Get own analytics summary ────────────────────────────────────────────────
exports.getMyStats = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      "totalEarnings completedOrders cancelledOrders avgRating totalReviews level badges avgResponseTime"
    );
    res.json({ success: true, stats: user });
  } catch (error) {
    next(error);
  }
};
