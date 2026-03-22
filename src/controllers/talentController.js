const { prisma } = require("../config/db");
const { paginate, getPagination } = require("../utils/helpers");
const { mapDbProfileToApi } = require("../utils/profileStore");

const normalize = (value) => String(value || "").toLowerCase().trim();

const tokenize = (value) =>
  normalize(value)
    .split(/[^a-z0-9+#]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);

const uniq = (arr) => [...new Set((arr || []).filter(Boolean))];

const normalizeServiceMode = (value) => {
  const v = normalize(value);
  if (!v) return "";
  if (["remote", "online", "fully online"].includes(v)) return "online";
  if (["onsite", "on-site", "on site", "physical on-site", "physical"].includes(v)) return "onsite";
  if (["hybrid"].includes(v)) return "hybrid";
  return v;
};

const textFieldsForProfile = (profile) =>
  [
    profile?.name,
    profile?.username,
    profile?.companyName,
    profile?.professionalTitle,
    profile?.bio,
    profile?.country,
    profile?.city,
    profile?.serviceMode,
    profile?.serviceCategory,
    profile?.tradeCategory,
    profile?.physicalCategory,
    profile?.serviceArea,
    profile?.industry,
    profile?.preferredFreelancerLevel,
    ...(Array.isArray(profile?.skills) ? profile.skills : []),
    ...(Array.isArray(profile?.primarySkills) ? profile.primarySkills : []),
    ...(Array.isArray(profile?.subSkills) ? profile.subSkills : []),
    ...(Array.isArray(profile?.toolsTechnologies) ? profile.toolsTechnologies : []),
    ...(Array.isArray(profile?.preferredSkills) ? profile.preferredSkills : []),
    ...(Array.isArray(profile?.languages) ? profile.languages : []),
  ]
    .map(normalize)
    .filter(Boolean)
    .join(" ");

const getArrayLength = (value) => (Array.isArray(value) ? value.length : 0);

const calculateCompleteness = (profile) => {
  let score = 0;
  if (profile?.avatar) score += 8;
  if (profile?.coverPhoto) score += 4;
  if (profile?.introVideo) score += 3;
  if (profile?.name || profile?.companyName) score += 5;
  if (profile?.professionalTitle) score += 5;
  if (profile?.bio) score += 7;
  if (profile?.country) score += 4;
  if (profile?.city) score += 3;
  if (profile?.serviceMode) score += 4;
  if (profile?.serviceCategory || profile?.tradeCategory || profile?.physicalCategory) score += 6;
  if (profile?.hourlyRate) score += 4;
  score += Math.min(getArrayLength(profile?.skills), 5) * 2;
  score += Math.min(getArrayLength(profile?.primarySkills), 5) * 2;
  score += Math.min(getArrayLength(profile?.portfolio), 5) * 1.5;
  score += Math.min(getArrayLength(profile?.experiences), 3) * 2;
  score += Math.min(getArrayLength(profile?.education), 2) * 1.5;
  score += Math.min(getArrayLength(profile?.certifications), 2) * 1.5;
  return Math.min(score, 35);
};

const scoreTextMatch = (tokens, profile) => {
  if (!tokens.length) return 0;
  const text = textFieldsForProfile(profile);
  let score = 0;

  tokens.forEach((token) => {
    if (!token) return;
    const exactSkillHit =
      (profile?.skills || []).some((item) => normalize(item) === token) ||
      (profile?.primarySkills || []).some((item) => normalize(item) === token) ||
      (profile?.subSkills || []).some((item) => normalize(item) === token) ||
      normalize(profile?.serviceCategory) === token ||
      normalize(profile?.tradeCategory) === token ||
      normalize(profile?.physicalCategory) === token;

    const partialHit = text.includes(token);

    if (exactSkillHit) {
      score += 12;
    } else if (partialHit) {
      score += 6;
    }
  });

  return Math.min(score, 40);
};

const scoreFilterFit = (profile, filters) => {
  let score = 0;

  const queryMode = normalizeServiceMode(filters.serviceMode);
  const profileMode = normalizeServiceMode(profile?.serviceMode);
  if (queryMode) {
    if (profileMode === queryMode) score += 12;
    else if (
      (queryMode === "online" && profileMode === "hybrid") ||
      (queryMode === "onsite" && profileMode === "hybrid")
    ) {
      score += 6;
    } else {
      score -= 4;
    }
  }

  const category = normalize(filters.category);
  if (category) {
    const categoryMatch =
      normalize(profile?.serviceCategory).includes(category) ||
      normalize(profile?.tradeCategory).includes(category) ||
      normalize(profile?.physicalCategory).includes(category) ||
      normalize(profile?.bio).includes(category) ||
      (profile?.skills || []).some((skill) => normalize(skill).includes(category));
    score += categoryMatch ? 16 : -5;
  }

  const country = normalize(filters.country);
  if (country) score += normalize(profile?.country).includes(country) ? 8 : -4;

  const q = normalize(filters.q);
  if (q) {
    const qMatch =
      normalize(profile?.name).includes(q) ||
      normalize(profile?.professionalTitle).includes(q) ||
      normalize(profile?.bio).includes(q) ||
      normalize(profile?.serviceCategory).includes(q) ||
      normalize(profile?.tradeCategory).includes(q) ||
      normalize(profile?.physicalCategory).includes(q) ||
      normalize(profile?.serviceArea).includes(q) ||
      normalize(profile?.country).includes(q) ||
      normalize(profile?.city).includes(q) ||
      (profile?.skills || []).some((skill) => normalize(skill).includes(q)) ||
      (profile?.primarySkills || []).some((skill) => normalize(skill).includes(q));
    score += qMatch ? 10 : -3;
  }

  return score;
};

const scoreTrust = (profile, reviewStats, contractStats) => {
  let score = 0;
  const avgRating = reviewStats?.avgRating || 0;
  const reviewCount = reviewStats?._count?._all || 0;
  const completedJobs = contractStats?._count?._all || 0;

  score += Math.min(avgRating * 4, 20);
  score += Math.min(reviewCount, 25) * 0.4;
  score += Math.min(completedJobs, 50) * 0.2;
  score += profile?.isVerified ? 5 : 0;
  score += profile?.emailVerified ? 2 : 0;
  score += profile?.phoneVerified ? 2 : 0;
  score += profile?.profileCompleted ? 3 : 0;
  score += profile?.avatar ? 1 : 0;

  return score;
};

const deriveBadge = (profile, avgRating, reviewCount, completedJobs, matchScore) => {
  if (avgRating >= 4.8 && reviewCount >= 10) return "Top Rated";
  if (avgRating >= 4.5 && completedJobs >= 8) return "Pro";
  if (profile?.isVerified || profile?.profileCompleted) return "Verified";
  if (completedJobs >= 3 || matchScore >= 70) return "Rising";
  return "New";
};

const enrichTalent = (user, reviewStats, contractStats, filters = {}) => {
  const profile = mapDbProfileToApi(user, user.profile?.payload || {});
  const tokens = tokenize(filters.q);

  const avgRating = reviewStats?.avgRating ? Number(reviewStats.avgRating.toFixed(1)) : 0;
  const reviewCount = reviewStats?._count?._all || 0;
  const completedJobs = contractStats?._count?._all || 0;

  const score =
    scoreTextMatch(tokens, profile) +
    scoreFilterFit(profile, filters) +
    scoreTrust(profile, reviewStats, contractStats) +
    calculateCompleteness(profile);

  const matchScore = Math.max(0, Math.min(100, Math.round(score)));
  const badge = deriveBadge(profile, avgRating, reviewCount, completedJobs, matchScore);
  const serviceMode = profile.serviceMode || "Remote";

  return {
    ...profile,
    id: profile.id,
    _id: profile.id,
    matchScore,
    badge,
    level: badge,
    avgRating,
    totalReviews: reviewCount,
    completedJobs,
    hourlyRate: profile.hourlyRate || 0,
    currency: profile.currency || "USD",
    serviceMode,
    location: [profile.city, profile.country].filter(Boolean).join(", ") || profile.country || "Remote",
    recentReviews: [],
  };
};

const sortResults = (results, sort = "relevance") => {
  const sortKey = normalize(sort);

  return results.sort((a, b) => {
    if (sortKey === "rating") {
      return (
        b.avgRating - a.avgRating ||
        b.totalReviews - a.totalReviews ||
        b.matchScore - a.matchScore ||
        a.hourlyRate - b.hourlyRate
      );
    }

    if (sortKey === "jobs") {
      return b.completedJobs - a.completedJobs || b.avgRating - a.avgRating || b.matchScore - a.matchScore;
    }

    if (sortKey === "price_asc") {
      return a.hourlyRate - b.hourlyRate || b.matchScore - a.matchScore;
    }

    if (sortKey === "price_desc") {
      return b.hourlyRate - a.hourlyRate || b.matchScore - a.matchScore;
    }

    if (sortKey === "newest") {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || b.matchScore - a.matchScore;
    }

    return (
      b.matchScore - a.matchScore ||
      b.avgRating - a.avgRating ||
      b.totalReviews - a.totalReviews ||
      a.hourlyRate - b.hourlyRate
    );
  });
};

exports.searchTalents = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filters = {
      q: req.query.q || "",
      category: req.query.category || "",
      serviceMode: req.query.serviceMode || "",
      country: req.query.country || "",
      sort: req.query.sort || "relevance",
      minRate: req.query.minRate !== undefined ? Number(req.query.minRate) : null,
      maxRate: req.query.maxRate !== undefined ? Number(req.query.maxRate) : null,
    };

    const users = await prisma.user.findMany({
      where: { role: "freelancer", isActive: true },
      include: { profile: true },
      orderBy: { createdAt: "desc" },
    });

    const ids = users.map((user) => user.id);

    const [reviewRows, contractRows, recentReviewRows] = await Promise.all([
      ids.length
        ? prisma.review.groupBy({
            by: ["revieweeId"],
            where: { revieweeId: { in: ids }, isPublic: true },
            _avg: { rating: true },
            _count: { _all: true },
          })
        : [],
      ids.length
        ? prisma.contract.groupBy({
            by: ["freelancerId"],
            where: { freelancerId: { in: ids }, status: "completed" },
            _count: { _all: true },
          })
        : [],
      ids.length
        ? prisma.review.findMany({
            where: { revieweeId: { in: ids }, isPublic: true },
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              revieweeId: true,
              rating: true,
              comment: true,
              createdAt: true,
              reviewer: { select: { id: true, name: true, avatar: true, companyName: true, role: true } },
            },
          })
        : [],
    ]);

    const reviewMap = new Map(
      reviewRows.map((row) => [
        row.revieweeId,
        {
          avgRating: row._avg?.rating || 0,
          _count: row._count || { _all: 0 },
        },
      ])
    );
    const contractMap = new Map(contractRows.map((row) => [row.freelancerId, { _count: row._count || { _all: 0 } }]));
    const recentReviewMap = new Map();
    recentReviewRows.forEach((row) => {
      if (!recentReviewMap.has(row.revieweeId)) recentReviewMap.set(row.revieweeId, []);
      recentReviewMap.get(row.revieweeId).push(row);
    });

    const ranked = users
      .map((user) => {
        const profileUser = {
          ...user,
          profileCompleted: Boolean(user.profileCompleted),
          isVerified: Boolean(user.isVerified),
          emailVerified: Boolean(user.emailVerified),
          phoneVerified: Boolean(user.phoneVerified),
          isActive: Boolean(user.isActive),
        };
        const item = enrichTalent(profileUser, reviewMap.get(user.id), contractMap.get(user.id), filters);
        item.recentReviews = recentReviewMap.get(user.id) || [];
        return item;
      })
      .filter((item) => {
        const minRate = Number.isFinite(filters.minRate) ? filters.minRate : null;
        const maxRate = Number.isFinite(filters.maxRate) ? filters.maxRate : null;
        if (minRate !== null && item.hourlyRate && item.hourlyRate < minRate) return false;
        if (maxRate !== null && item.hourlyRate && item.hourlyRate > maxRate) return false;
        if (filters.country && normalize(item.country).indexOf(normalize(filters.country)) === -1) return false;
        if (filters.serviceMode && normalizeServiceMode(item.serviceMode) !== normalizeServiceMode(filters.serviceMode)) {
          const queryMode = normalizeServiceMode(filters.serviceMode);
          const itemMode = normalizeServiceMode(item.serviceMode);
          if (!(queryMode && itemMode === "hybrid")) return false;
        }
        if (filters.category) {
          const category = normalize(filters.category);
          const haystack = [
            item.serviceCategory,
            item.tradeCategory,
            item.physicalCategory,
            item.bio,
            ...(item.skills || []),
          ]
            .map(normalize)
            .join(" ");
          if (!haystack.includes(category)) return false;
        }
        if (filters.q) {
          const q = normalize(filters.q);
          const haystack = [
            item.name,
            item.companyName,
            item.professionalTitle,
            item.bio,
            item.country,
            item.city,
            item.serviceCategory,
            item.tradeCategory,
            item.physicalCategory,
            item.serviceArea,
            ...(item.skills || []),
            ...(item.primarySkills || []),
          ]
            .map(normalize)
            .join(" ");
          if (!haystack.includes(q)) return false;
        }
        return true;
      });

    const sorted = sortResults(ranked, filters.sort);
    const total = sorted.length;
    const paged = sorted.slice(skip, skip + limit);

    return res.json({
      success: true,
      ...paginate(paged, total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

exports.getTalentProfile = async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ success: false, message: "Invalid talent id." });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || user.role !== "freelancer") {
      return res.status(404).json({ success: false, message: "Talent not found." });
    }

    const [reviewStats, contractStats, recentReviews] = await Promise.all([
      prisma.review.aggregate({
        where: { revieweeId: userId, isPublic: true },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.contract.aggregate({
        where: { freelancerId: userId, status: "completed" },
        _count: { _all: true },
      }),
      prisma.review.findMany({
        where: { revieweeId: userId, isPublic: true },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          reviewer: { select: { id: true, name: true, avatar: true, companyName: true, role: true } },
        },
      }),
    ]);

    const profile = mapDbProfileToApi(user, user.profile?.payload || {});
    const avgRating = reviewStats?._avg?.rating ? Number(reviewStats._avg.rating.toFixed(1)) : 0;
    const totalReviews = reviewStats?._count?._all || 0;
    const completedJobs = contractStats?._count?._all || 0;

    const talent = {
      ...profile,
      avgRating,
      totalReviews,
      completedJobs,
      badge: deriveBadge(profile, avgRating, totalReviews, completedJobs, 0),
      level: deriveBadge(profile, avgRating, totalReviews, completedJobs, 0),
      reviews: recentReviews,
      location: [profile.city, profile.country].filter(Boolean).join(", ") || profile.country || "Remote",
      serviceSummary:
        profile.serviceCategory ||
        profile.tradeCategory ||
        profile.physicalCategory ||
        profile.professionalTitle ||
        "Freelancer",
    };

    return res.json({ success: true, user: talent });
  } catch (error) {
    next(error);
  }
};
