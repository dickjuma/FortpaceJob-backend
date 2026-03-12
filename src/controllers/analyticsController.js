/**
 * Analytics Controller for Forte Platform
 * Handles analytics data endpoints
 */

const analytics = require("../utils/analytics");

// ─── Get Platform Overview ────────────────────────────────────────────────────────
exports.getPlatformOverview = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const overview = await analytics.getPlatformOverview(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );
    
    res.json({ success: true, ...overview });
  } catch (error) {
    next(error);
  }
};

// ─── Get Revenue Analytics ────────────────────────────────────────────────────────
exports.getRevenueAnalytics = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const revenue = await analytics.getRevenueAnalytics(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );
    
    res.json({ success: true, ...revenue });
  } catch (error) {
    next(error);
  }
};

// ─── Get User Analytics ───────────────────────────────────────────────────────────
exports.getUserAnalytics = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const users = await analytics.getUserAnalytics(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );
    
    res.json({ success: true, ...users });
  } catch (error) {
    next(error);
  }
};

// ─── Get Contract Analytics ────────────────────────────────────────────────────────
exports.getContractAnalytics = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const contracts = await analytics.getContractAnalytics(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );
    
    res.json({ success: true, ...contracts });
  } catch (error) {
    next(error);
  }
};

// ─── Get Dispute Analytics ────────────────────────────────────────────────────────
exports.getDisputeAnalytics = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const disputes = await analytics.getDisputeAnalytics(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );
    
    res.json({ success: true, ...disputes });
  } catch (error) {
    next(error);
  }
};

// ─── Get Subscription Analytics ────────────────────────────────────────────────
exports.getSubscriptionAnalytics = async (req, res, next) => {
  try {
    const subscriptions = await analytics.getSubscriptionAnalytics();
    res.json({ success: true, ...subscriptions });
  } catch (error) {
    next(error);
  }
};

// ─── Get Freelancer Performance (for the logged-in freelancer) ────────────────
exports.getMyPerformance = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const performance = await analytics.getFreelancerPerformance(
      req.user._id,
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );
    
    res.json({ success: true, ...performance });
  } catch (error) {
    next(error);
  }
};

// ─── Get Any User's Performance (Admin) ──────────────────────────────────────
exports.getUserPerformance = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    
    const performance = await analytics.getFreelancerPerformance(
      userId,
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );
    
    res.json({ success: true, ...performance });
  } catch (error) {
    next(error);
  }
};

module.exports = exports;
