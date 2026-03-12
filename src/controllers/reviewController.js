const Review = require("../models/Review");
const Contract = require("../models/Contract");
const Gig = require("../models/Gig");
const User = require("../models/User");
const { getPagination, paginate, avgRating } = require("../utils/helpers");

// ─── Submit review ────────────────────────────────────────────────────────────
exports.submitReview = async (req, res, next) => {
  try {
    const { contractId, rating, comment, communication, quality, delivery, value } = req.body;

    if (!contractId || !rating) {
      return res.status(400).json({ success: false, message: "contractId and rating are required." });
    }

    const contract = await Contract.findById(contractId);
    if (!contract) return res.status(404).json({ success: false, message: "Contract not found." });
    if (contract.status !== "completed") {
      return res.status(400).json({ success: false, message: "Can only review completed contracts." });
    }

    const isClient = contract.client.toString() === req.user._id.toString();
    const isFreelancer = contract.freelancer.toString() === req.user._id.toString();

    if (!isClient && !isFreelancer) {
      return res.status(403).json({ success: false, message: "Not authorized." });
    }

    const revieweeId = isClient ? contract.freelancer : contract.client;

    const review = await Review.create({
      contract: contractId,
      gig: contract.gig,
      reviewer: req.user._id,
      reviewee: revieweeId,
      rating,
      comment,
      communication,
      quality,
      delivery,
      value,
    });

    // Update reviewee's average rating
    const allReviews = await Review.find({ reviewee: revieweeId });
    const newAvg = avgRating(allReviews.map((r) => r.rating));

    await User.findByIdAndUpdate(revieweeId, {
      avgRating: newAvg,
      totalReviews: allReviews.length,
    });

    // Update gig rating if applicable
    if (contract.gig) {
      const gigReviews = await Review.find({ gig: contract.gig });
      const gigAvg = avgRating(gigReviews.map((r) => r.rating));
      await Gig.findByIdAndUpdate(contract.gig, {
        avgRating: gigAvg,
        totalReviews: gigReviews.length,
      });
    }

    res.status(201).json({ success: true, message: "Review submitted.", review });
  } catch (error) {
    next(error);
  }
};

// ─── Get reviews for a user ───────────────────────────────────────────────────
exports.getUserReviews = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { reviewee: req.params.userId, isPublic: true };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("reviewer", "name avatar companyName role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(reviews, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Get reviews for a gig ────────────────────────────────────────────────────
exports.getGigReviews = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { gig: req.params.gigId, isPublic: true };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("reviewer", "name avatar country")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(reviews, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Respond to a review (reviewee) ──────────────────────────────────────────
exports.respondToReview = async (req, res, next) => {
  try {
    const review = await Review.findOne({ _id: req.params.id, reviewee: req.user._id });
    if (!review) return res.status(404).json({ success: false, message: "Review not found." });
    if (review.response) return res.status(400).json({ success: false, message: "Already responded." });

    review.response = req.body.response;
    review.respondedAt = new Date();
    await review.save();

    res.json({ success: true, message: "Response added.", review });
  } catch (error) {
    next(error);
  }
};
