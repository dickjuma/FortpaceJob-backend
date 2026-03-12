/**
 * Analytics Service for Forte Platform
 * Provides comprehensive analytics and reporting
 */

const User = require("../models/User");
const Contract = require("../models/Contract");
const Transaction = require("../models/Transaction");
const Gig = require("../models/Gig");
const Proposal = require("../models/Proposal");
const Dispute = require("../models/Dispute");
const Subscription = require("../models/Subscription");

class AnalyticsService {
  // ─── Platform Overview ─────────────────────────────────────────────────────────
  async getPlatformOverview(startDate, endDate) {
    const dateFilter = {
      createdAt: {
        $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate || new Date(),
      },
    };

    const [
      totalUsers,
      activeFreelancers,
      activeClients,
      totalContracts,
      activeContracts,
      completedContracts,
      totalRevenue,
      platformFees,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "freelancer", isActive: true }),
      User.countDocuments({ role: "client", isActive: true }),
      Contract.countDocuments(dateFilter),
      Contract.countDocuments({ ...dateFilter, status: "active" }),
      Contract.countDocuments({ ...dateFilter, status: "completed" }),
      Transaction.aggregate([
        { $match: { ...dateFilter, type: "escrow_release", status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Transaction.aggregate([
        { $match: { ...dateFilter, type: "platform_fee", status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    return {
      totalUsers,
      activeFreelancers,
      activeClients,
      totalContracts,
      activeContracts,
      completedContracts,
      totalRevenue: totalRevenue[0]?.total || 0,
      platformFees: platformFees[0]?.total || 0,
      completionRate: totalContracts > 0 
        ? ((completedContracts / totalContracts) * 100).toFixed(2) 
        : 0,
    };
  }

  // ─── Revenue Analytics ────────────────────────────────────────────────────────
  async getRevenueAnalytics(startDate, endDate) {
    const dateFilter = {
      createdAt: {
        $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate || new Date(),
      },
    };

    // Daily revenue
    const dailyRevenue = await Transaction.aggregate([
      { $match: { ...dateFilter, type: "escrow_release", status: "completed" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$amount" },
          fees: { $sum: "$platformFee" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Revenue by category (from gigs)
    const revenueByCategory = await Contract.aggregate([
      { $match: { ...dateFilter, status: "completed" } },
      {
        $lookup: {
          from: "gigs",
          localField: "gig",
          foreignField: "_id",
          as: "gigData",
        },
      },
      { $unwind: "$gigData" },
      {
        $group: {
          _id: "$gigData.category",
          revenue: { $sum: "$totalAmount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    // Payment methods
    const paymentMethods = await Transaction.aggregate([
      { $match: dateFilter },
      { $group: { _id: "$type", count: { $sum: 1 }, total: { $sum: "$amount" } } },
    ]);

    return {
      dailyRevenue,
      revenueByCategory,
      paymentMethods,
    };
  }

  // ─── User Analytics ───────────────────────────────────────────────────────────
  async getUserAnalytics(startDate, endDate) {
    const dateFilter = {
      createdAt: {
        $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate || new Date(),
      },
    };

    // New users over time
    const userGrowth = await User.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          freelancers: { $sum: { $cond: [{ $eq: ["$role", "freelancer"] }, 1, 0] } },
          clients: { $sum: { $cond: [{ $eq: ["$role", "client"] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Top countries
    const topCountries = await User.aggregate([
      { $match: { country: { $ne: "" } } },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Skill distribution (for freelancers)
    const skillDistribution = await User.aggregate([
      { $match: { role: "freelancer", skills: { $exists: true, $ne: [] } } },
      { $unwind: "$skills" },
      { $group: { _id: "$skills", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    return {
      userGrowth,
      topCountries,
      skillDistribution,
    };
  }

  // ─── Contract Analytics ────────────────────────────────────────────────────────
  async getContractAnalytics(startDate, endDate) {
    const dateFilter = {
      createdAt: {
        $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate || new Date(),
      },
    };

    // Contract status distribution
    const statusDistribution = await Contract.aggregate([
      { $match: dateFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Average contract value
    const avgContractValue = await Contract.aggregate([
      { $match: { ...dateFilter, status: { $in: ["completed", "active"] } } },
      { $group: { _id: null, avg: { $avg: "$totalAmount" } } },
    ]);

    // Contracts by freelancer
    const topFreelancers = await Contract.aggregate([
      { $match: { ...dateFilter, status: "completed" } },
      {
        $group: {
          _id: "$freelancer",
          completedContracts: { $sum: 1 },
          totalEarnings: { $sum: "$freelancerEarnings" },
        },
      },
      { $sort: { totalEarnings: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "freelancer",
        },
      },
      { $unwind: "$freelancer" },
      {
        $project: {
          name: "$freelancer.name",
          email: "$freelancer.email",
          completedContracts: 1,
          totalEarnings: 1,
        },
      },
    ]);

    // Contracts by client
    const topClients = await Contract.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$client",
          totalSpent: { $sum: "$totalAmount" },
          contractCount: { $sum: 1 },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "client",
        },
      },
      { $unwind: "$client" },
      {
        $project: {
          name: "$client.companyName",
          email: "$client.email",
          totalSpent: 1,
          contractCount: 1,
        },
      },
    ]);

    return {
      statusDistribution,
      avgContractValue: avgContractValue[0]?.avg || 0,
      topFreelancers,
      topClients,
    };
  }

  // ─── Dispute Analytics ────────────────────────────────────────────────────────
  async getDisputeAnalytics(startDate, endDate) {
    const dateFilter = {
      createdAt: {
        $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate || new Date(),
      },
    };

    const [totalDisputes, openDisputes, resolvedDisputes, byReason, byResolution] = await Promise.all([
      Dispute.countDocuments(dateFilter),
      Dispute.countDocuments({ ...dateFilter, status: { $in: ["open", "under_review"] } }),
      Dispute.countDocuments({ ...dateFilter, status: "resolved" }),
      Dispute.aggregate([
        { $match: dateFilter },
        { $group: { _id: "$reason", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Dispute.aggregate([
        { $match: { ...dateFilter, status: "resolved" } },
        { $group: { _id: "$resolution", count: { $sum: 1 } } },
      ]),
    ]);

    return {
      totalDisputes,
      openDisputes,
      resolvedDisputes,
      resolutionRate: totalDisputes > 0 
        ? ((resolvedDisputes / totalDisputes) * 100).toFixed(2) 
        : 0,
      byReason,
      byResolution,
    };
  }

  // ─── Subscription Analytics ────────────────────────────────────────────────
  async getSubscriptionAnalytics() {
    const [subscriptionStats, revenueByPlan] = await Promise.all([
      Subscription.aggregate([
        { $group: { _id: "$plan", count: { $sum: 1 } } },
      ]),
      Subscription.aggregate([
        { $match: { status: "active" } },
        {
          $group: {
            _id: "$plan",
            monthlyRevenue: {
              $sum: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$plan", "basic"] }, then: 9.99 },
                    { case: { $eq: ["$plan", "pro"] }, then: 29.99 },
                    { case: { $eq: ["$plan", "enterprise"] }, then: 99.99 },
                  ],
                  default: 0,
                },
              },
            },
          },
        },
      ]),
    ]);

    return {
      subscriptionStats,
      revenueByPlan,
    };
  }

  // ─── Freelancer Performance ────────────────────────────────────────────────
  async getFreelancerPerformance(freelancerId, startDate, endDate) {
    const dateFilter = {
      createdAt: {
        $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate || new Date(),
      },
    };

    const freelancer = await User.findById(freelancerId);
    if (!freelancer) throw new Error("Freelancer not found");

    const contracts = await Contract.find({
      freelancer: freelancerId,
      ...dateFilter,
    });

    const totalEarnings = contracts
      .filter((c) => c.status === "completed")
      .reduce((sum, c) => sum + c.freelancerEarnings, 0);

    const completedCount = contracts.filter((c) => c.status === "completed").length;
    const cancelledCount = contracts.filter((c) => c.status === "cancelled").length;

    // Monthly earnings
    const monthlyEarnings = await Contract.aggregate([
      {
        $match: {
          freelancer: freelancerId,
          status: "completed",
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$completedAt" } },
          earnings: { $sum: "$freelancerEarnings" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Response time
    const avgResponseTime = freelancer.avgResponseTime || 0;

    // Rating
    const avgRating = freelancer.avgRating || 0;
    const totalReviews = freelancer.totalReviews || 0;

    return {
      totalEarnings,
      completedContracts: completedCount,
      cancelledContracts: cancelledCount,
      monthlyEarnings,
      avgResponseTime,
      avgRating,
      totalReviews,
      level: freelancer.level,
      badges: freelancer.badges,
    };
  }
}

module.exports = new AnalyticsService();
