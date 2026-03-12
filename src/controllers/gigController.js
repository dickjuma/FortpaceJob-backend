const Gig = require("../models/Gig");
const { getPagination, paginate, slugify, buildSearchFilter } = require("../utils/helpers");

// ─── Create Gig ───────────────────────────────────────────────────────────────
exports.createGig = async (req, res, next) => {
  try {
    const { title, category, description, packages } = req.body;
    if (!title || !category || !description || !packages) {
      return res.status(400).json({ success: false, message: "title, category, description and packages are required." });
    }

    const slug = slugify(title) + "-" + Date.now();
    const images = req.files ? req.files.map((f) => f.path) : [];

    const gig = await Gig.create({
      ...req.body,
      seller: req.user._id,
      slug,
      images,
      packages: typeof packages === "string" ? JSON.parse(packages) : packages,
      status: "active",
    });

    res.status(201).json({ success: true, message: "Gig created.", gig });
  } catch (error) {
    next(error);
  }
};

// ─── Get all gigs (public) ────────────────────────────────────────────────────
exports.getGigs = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { q, category, serviceMode, minPrice, maxPrice, sort } = req.query;

    const filter = { status: "active" };

    if (q) {
      Object.assign(filter, buildSearchFilter(q, ["title", "description", "tags"]));
    }
    if (category) filter.category = category;
    if (serviceMode) filter.serviceMode = serviceMode;
    if (minPrice || maxPrice) {
      filter["packages.price"] = {};
      if (minPrice) filter["packages.price"].$gte = Number(minPrice);
      if (maxPrice) filter["packages.price"].$lte = Number(maxPrice);
    }

    const sortMap = {
      rating: { avgRating: -1 },
      orders: { completedOrders: -1 },
      newest: { createdAt: -1 },
      price_asc: { "packages.0.price": 1 },
      price_desc: { "packages.0.price": -1 },
    };
    const sortOption = sortMap[sort] || { avgRating: -1 };

    const [gigs, total] = await Promise.all([
      Gig.find(filter)
        .populate("seller", "name avatar level avgRating country")
        .sort(sortOption)
        .skip(skip)
        .limit(limit),
      Gig.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(gigs, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Get single gig ───────────────────────────────────────────────────────────
exports.getGig = async (req, res, next) => {
  try {
    const gig = await Gig.findOne({
      $or: [{ _id: req.params.id }, { slug: req.params.id }],
    }).populate("seller", "name avatar bio level avgRating totalReviews country completedOrders");

    if (!gig) return res.status(404).json({ success: false, message: "Gig not found." });

    // Increment views
    gig.views += 1;
    await gig.save({ validateBeforeSave: false });

    res.json({ success: true, gig });
  } catch (error) {
    next(error);
  }
};

// ─── Get my gigs ──────────────────────────────────────────────────────────────
exports.getMyGigs = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { seller: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [gigs, total] = await Promise.all([
      Gig.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Gig.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(gigs, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Update gig ───────────────────────────────────────────────────────────────
exports.updateGig = async (req, res, next) => {
  try {
    const gig = await Gig.findOne({ _id: req.params.id, seller: req.user._id });
    if (!gig) return res.status(404).json({ success: false, message: "Gig not found or not yours." });

    const allowedFields = [
      "title", "category", "subcategory", "serviceMode", "physicalCategory",
      "serviceArea", "tags", "description", "packages", "faqs", "requirements",
      "status",
    ];

    allowedFields.forEach((f) => {
      if (req.body[f] !== undefined) gig[f] = req.body[f];
    });

    if (req.files && req.files.length > 0) {
      gig.images = [...gig.images, ...req.files.map((f) => f.path)];
    }

    await gig.save();
    res.json({ success: true, message: "Gig updated.", gig });
  } catch (error) {
    next(error);
  }
};

// ─── Delete gig ───────────────────────────────────────────────────────────────
exports.deleteGig = async (req, res, next) => {
  try {
    const gig = await Gig.findOneAndDelete({ _id: req.params.id, seller: req.user._id });
    if (!gig) return res.status(404).json({ success: false, message: "Gig not found or not yours." });
    res.json({ success: true, message: "Gig deleted." });
  } catch (error) {
    next(error);
  }
};

// ─── Toggle gig status (pause/activate) ──────────────────────────────────────
exports.toggleGigStatus = async (req, res, next) => {
  try {
    const gig = await Gig.findOne({ _id: req.params.id, seller: req.user._id });
    if (!gig) return res.status(404).json({ success: false, message: "Gig not found." });

    gig.status = gig.status === "active" ? "paused" : "active";
    await gig.save();

    res.json({ success: true, message: `Gig ${gig.status}.`, status: gig.status });
  } catch (error) {
    next(error);
  }
};
