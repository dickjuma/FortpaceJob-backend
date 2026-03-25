const BuyerRequest = require("./model");
const { getPagination, paginate, buildSearchFilter } = require("../../utils/helpers");

// ─── Create buyer request ─────────────────────────────────────────────────────
exports.createRequest = async (req, res, next) => {
  try {
    const { title, description, category, budgetMin, budgetMax } = req.body;
    if (!title || !description || !category || !budgetMin || !budgetMax) {
      return res.status(400).json({ success: false, message: "title, description, category, budgetMin and budgetMax are required." });
    }

    const request = await BuyerRequest.create({
      ...req.body,
      buyer: req.user._id,
    });

    res.status(201).json({ success: true, message: "Request posted.", request });
  } catch (error) {
    next(error);
  }
};

// ─── Get all open requests (freelancer view) ──────────────────────────────────
exports.getRequests = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { q, category, serviceMode, minBudget, maxBudget, sort } = req.query;

    const filter = { status: "open", expiresAt: { $gt: new Date() } };

    if (q) Object.assign(filter, buildSearchFilter(q, ["title", "description"]));
    if (category) filter.category = category;
    if (serviceMode) filter.serviceMode = serviceMode;
    if (minBudget || maxBudget) {
      filter.budgetMin = {};
      if (minBudget) filter.budgetMin.$gte = Number(minBudget);
      if (maxBudget) filter.budgetMax = { $lte: Number(maxBudget) };
    }

    const sortMap = {
      recent: { createdAt: -1 },
      budget_high: { budgetMax: -1 },
      budget_low: { budgetMin: 1 },
      proposals: { proposalCount: 1 }, // fewest proposals first
    };
    const sortOption = sortMap[sort] || { createdAt: -1 };

    const [requests, total] = await Promise.all([
      BuyerRequest.find(filter)
        .populate("buyer", "name companyName avatar country isVerified")
        .sort(sortOption)
        .skip(skip)
        .limit(limit),
      BuyerRequest.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(requests, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Get single request ───────────────────────────────────────────────────────
exports.getRequest = async (req, res, next) => {
  try {
    const request = await BuyerRequest.findById(req.params.id)
      .populate("buyer", "name companyName avatar country isVerified")
      .populate({ path: "proposals", populate: { path: "freelancer", select: "name avatar level avgRating" } });

    if (!request) return res.status(404).json({ success: false, message: "Request not found." });

    request.views += 1;
    await request.save({ validateBeforeSave: false });

    res.json({ success: true, request });
  } catch (error) {
    next(error);
  }
};

// ─── Get my posted requests (client) ─────────────────────────────────────────
exports.getMyRequests = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { buyer: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [requests, total] = await Promise.all([
      BuyerRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      BuyerRequest.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(requests, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Update request ───────────────────────────────────────────────────────────
exports.updateRequest = async (req, res, next) => {
  try {
    const request = await BuyerRequest.findOne({ _id: req.params.id, buyer: req.user._id });
    if (!request) return res.status(404).json({ success: false, message: "Request not found." });

    const allowedFields = ["title", "description", "category", "budgetMin", "budgetMax", "deadline", "isUrgent", "tags", "serviceMode", "location"];
    allowedFields.forEach((f) => { if (req.body[f] !== undefined) request[f] = req.body[f]; });

    await request.save();
    res.json({ success: true, message: "Request updated.", request });
  } catch (error) {
    next(error);
  }
};

// ─── Close / delete request ───────────────────────────────────────────────────
exports.closeRequest = async (req, res, next) => {
  try {
    const request = await BuyerRequest.findOneAndUpdate(
      { _id: req.params.id, buyer: req.user._id },
      { status: "closed" },
      { new: true }
    );
    if (!request) return res.status(404).json({ success: false, message: "Request not found." });
    res.json({ success: true, message: "Request closed.", request });
  } catch (error) {
    next(error);
  }
};

