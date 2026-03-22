const { prisma } = require("../config/db");

const ensureProfileColumns = async () => {
  // No-op. Prisma migrations should manage schema in production.
  return;
};

const normalizeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch (_) {
      return value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
  }
  return [];
};

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return value;
  if (typeof value?.toNumber === "function") return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const PROFILE_FIELDS = [
  "name",
  "username",
  "professionalTitle",
  "companyName",
  "city",
  "timezone",
  "bio",
  "skills",
  "primarySkills",
  "subSkills",
  "toolsTechnologies",
  "preferredSkills",
  "industriesOfInterest",
  "experiences",
  "education",
  "certifications",
  "packages",
  "pastProjects",
  "hourlyRate",
  "currency",
  "serviceMode",
  "serviceCategory",
  "tradeCategory",
  "physicalCategory",
  "serviceArea",
  "serviceRadius",
  "yearsOfExperience",
  "skillLevel",
  "licenseNumber",
  "insured",
  "bonded",
  "availability",
  "availabilityType",
  "preferredProjectType",
  "responseTime",
  "availableHours",
  "companyDescription",
  "industry",
  "companySize",
  "hiringType",
  "budget",
  "hiringCapacity",
  "country",
  "languages",
  "coverPhoto",
  "coverPhotoPublicId",
  "coverPhotoFileName",
  "avatar",
  "avatarPublicId",
  "avatarFileName",
  "companyLogo",
  "companyLogoPublicId",
  "companyLogoFileName",
  "website",
  "linkedin",
  "github",
  "twitter",
  "facebook",
  "instagram",
  "dribbble",
  "behance",
  "medium",
  "socialLinks",
  "portfolio",
  "portfolioFileNames",
  "portfolioTitles",
  "portfolioDescriptions",
  "portfolioLinks",
  "portfolioRoles",
  "portfolioTechnologies",
  "portfolioVideos",
  "introVideo",
  "introVideoPublicId",
  "introVideoFileName",
  "introVideoTitle",
  "introVideoDescription",
  "preferredFreelancerLevel",
  "paymentVerified",
  "topRated",
  "risingTalent",
  "averageRating",
  "completedJobs",
  "repeatClients",
];

const sanitizeProfileInput = (input = {}) => {
  const output = {};
  PROFILE_FIELDS.forEach((key) => {
    if (input[key] !== undefined) output[key] = input[key];
  });
  return output;
};

const mapDbProfileToApi = (user, payload = {}) => {
  if (!user) return null;
  const profile = payload || {};
  const socialLinks =
    profile.socialLinks && typeof profile.socialLinks === "object"
      ? profile.socialLinks
      : {
          website: profile.website || "",
          linkedin: profile.linkedin || "",
          github: profile.github || "",
          twitter: profile.twitter || "",
          facebook: profile.facebook || "",
          instagram: profile.instagram || "",
          dribbble: profile.dribbble || "",
          behance: profile.behance || "",
          medium: profile.medium || "",
        };
  return {
    id: user.id,
    _id: user.id,
    email: user.email,
    name: profile.name || "",
    username: profile.username || "",
    professionalTitle: profile.professionalTitle || "",
    role: user.role,
    createdAt: user.createdAt,
    phoneNumber: user.phoneNumber || "",
    companyName: profile.companyName || "",
    city: profile.city || "",
    timezone: profile.timezone || "",
    bio: profile.bio || "",
    skills: normalizeArray(profile.skills),
    primarySkills: normalizeArray(profile.primarySkills),
    subSkills: normalizeArray(profile.subSkills),
    toolsTechnologies: normalizeArray(profile.toolsTechnologies),
    preferredSkills: normalizeArray(profile.preferredSkills),
    industriesOfInterest: normalizeArray(profile.industriesOfInterest),
    experiences: normalizeArray(profile.experiences),
    education: normalizeArray(profile.education),
    certifications: normalizeArray(profile.certifications),
    packages: normalizeArray(profile.packages),
    pastProjects: normalizeArray(profile.pastProjects),
    hourlyRate: toNumber(profile.hourlyRate, 10),
    currency: profile.currency || "USD",
    serviceMode: profile.serviceMode || "",
    serviceCategory: profile.serviceCategory || profile.tradeCategory || "",
    tradeCategory: profile.tradeCategory || profile.serviceCategory || "",
    physicalCategory: profile.physicalCategory || "",
    serviceArea: profile.serviceArea || "",
    serviceRadius: toNumber(profile.serviceRadius, 0),
    yearsOfExperience: toNumber(profile.yearsOfExperience, 0),
    skillLevel: profile.skillLevel || "",
    licenseNumber: profile.licenseNumber || "",
    insured: Boolean(profile.insured),
    bonded: Boolean(profile.bonded),
    availability: profile.availability || "",
    availabilityType: profile.availabilityType || "",
    preferredProjectType: profile.preferredProjectType || "",
    responseTime: profile.responseTime || "",
    availableHours: toNumber(profile.availableHours, 0),
    companyDescription: profile.companyDescription || "",
    industry: profile.industry || "",
    companySize: profile.companySize || "",
    hiringType: profile.hiringType || "",
    budget: toNumber(profile.budget, 0),
    hiringCapacity: Number(profile.hiringCapacity || 1),
    country: profile.country || "",
    languages: normalizeArray(profile.languages),
    avatar: profile.avatar || "",
    avatarPublicId: profile.avatarPublicId || "",
    avatarFileName: profile.avatarFileName || "",
    coverPhoto: profile.coverPhoto || "",
    coverPhotoPublicId: profile.coverPhotoPublicId || "",
    coverPhotoFileName: profile.coverPhotoFileName || "",
    companyLogo: profile.companyLogo || "",
    companyLogoPublicId: profile.companyLogoPublicId || "",
    companyLogoFileName: profile.companyLogoFileName || "",
    website: profile.website || "",
    linkedin: profile.linkedin || "",
    github: profile.github || "",
    twitter: profile.twitter || "",
    facebook: profile.facebook || "",
    instagram: profile.instagram || "",
    dribbble: profile.dribbble || "",
    behance: profile.behance || "",
    medium: profile.medium || "",
    socialLinks,
    portfolio: normalizeArray(profile.portfolio),
    portfolioFileNames: normalizeArray(profile.portfolioFileNames),
    portfolioTitles: normalizeArray(profile.portfolioTitles),
    portfolioDescriptions: normalizeArray(profile.portfolioDescriptions),
    portfolioLinks: normalizeArray(profile.portfolioLinks),
    portfolioRoles: normalizeArray(profile.portfolioRoles),
    portfolioTechnologies: normalizeArray(profile.portfolioTechnologies),
    portfolioVideos: normalizeArray(profile.portfolioVideos),
    introVideo: profile.introVideo || "",
    introVideoPublicId: profile.introVideoPublicId || "",
    introVideoFileName: profile.introVideoFileName || "",
    introVideoTitle: profile.introVideoTitle || "",
    introVideoDescription: profile.introVideoDescription || "",
    preferredFreelancerLevel: profile.preferredFreelancerLevel || "",
    paymentVerified: Boolean(profile.paymentVerified),
    topRated: Boolean(profile.topRated),
    risingTalent: Boolean(profile.risingTalent),
    averageRating: toNumber(profile.averageRating, 0),
    completedJobs: toNumber(profile.completedJobs, 0),
    repeatClients: toNumber(profile.repeatClients, 0),
    profileCompleted: Boolean(user.profileCompleted),
    lastProfileUpdate: user.lastProfileUpdate || null,
    reminderSent: Boolean(user.reminderSent),
    isActive: Boolean(user.isActive),
    emailVerified: Boolean(user.emailVerified),
    phoneVerified: Boolean(user.phoneVerified),
    isVerified: Boolean(user.isVerified),
  };
};

const getProfilePayload = async (userId) => {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT "payload" FROM "user_profiles" WHERE "user_id" = $1 LIMIT 1',
    Number(userId)
  );
  if (!rows || !rows.length) return null;
  return rows[0]?.payload || null;
};

const getMyProfile = async (userId) => {
  await ensureProfileColumns();
  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user) return null;
  const payload = await getProfilePayload(userId);
  return mapDbProfileToApi(user, payload);
};

const updateMyProfile = async (userId, input = {}) => {
  await ensureProfileColumns();

  const existing = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!existing) return null;

  const sanitized = sanitizeProfileInput(input);
  const allowed = {
    ...sanitized,
    skills: sanitized.skills !== undefined ? normalizeArray(sanitized.skills) : undefined,
    primarySkills: sanitized.primarySkills !== undefined ? normalizeArray(sanitized.primarySkills) : undefined,
    subSkills: sanitized.subSkills !== undefined ? normalizeArray(sanitized.subSkills) : undefined,
    toolsTechnologies:
      sanitized.toolsTechnologies !== undefined ? normalizeArray(sanitized.toolsTechnologies) : undefined,
    preferredSkills:
      sanitized.preferredSkills !== undefined ? normalizeArray(sanitized.preferredSkills) : undefined,
    industriesOfInterest:
      sanitized.industriesOfInterest !== undefined ? normalizeArray(sanitized.industriesOfInterest) : undefined,
    experiences: sanitized.experiences !== undefined ? normalizeArray(sanitized.experiences) : undefined,
    education: sanitized.education !== undefined ? normalizeArray(sanitized.education) : undefined,
    certifications:
      sanitized.certifications !== undefined ? normalizeArray(sanitized.certifications) : undefined,
    packages: sanitized.packages !== undefined ? normalizeArray(sanitized.packages) : undefined,
    pastProjects: sanitized.pastProjects !== undefined ? normalizeArray(sanitized.pastProjects) : undefined,
    languages: sanitized.languages !== undefined ? normalizeArray(sanitized.languages) : undefined,
    portfolio: sanitized.portfolio !== undefined ? normalizeArray(sanitized.portfolio) : undefined,
    portfolioFileNames:
      sanitized.portfolioFileNames !== undefined ? normalizeArray(sanitized.portfolioFileNames) : undefined,
    portfolioTitles:
      sanitized.portfolioTitles !== undefined ? normalizeArray(sanitized.portfolioTitles) : undefined,
    portfolioDescriptions:
      sanitized.portfolioDescriptions !== undefined ? normalizeArray(sanitized.portfolioDescriptions) : undefined,
    portfolioLinks:
      sanitized.portfolioLinks !== undefined ? normalizeArray(sanitized.portfolioLinks) : undefined,
    portfolioRoles:
      sanitized.portfolioRoles !== undefined ? normalizeArray(sanitized.portfolioRoles) : undefined,
    portfolioTechnologies:
      sanitized.portfolioTechnologies !== undefined ? normalizeArray(sanitized.portfolioTechnologies) : undefined,
    portfolioVideos:
      sanitized.portfolioVideos !== undefined ? normalizeArray(sanitized.portfolioVideos) : undefined,
    paymentVerified: sanitized.paymentVerified,
    topRated: sanitized.topRated,
    risingTalent: sanitized.risingTalent,
    averageRating: sanitized.averageRating,
    completedJobs: sanitized.completedJobs,
    repeatClients: sanitized.repeatClients,
  };

  const data = Object.fromEntries(
    Object.entries(allowed).filter(([, value]) => value !== undefined)
  );

  if (!Object.keys(data).length) {
    const payload = await getProfilePayload(userId);
    return mapDbProfileToApi(existing, payload);
  }

  const payloadJson = JSON.stringify(data);
  await prisma.$executeRawUnsafe(
    'INSERT INTO "user_profiles" ("user_id","payload","created_at","updated_at") VALUES ($1, $2::jsonb, now(), now()) ' +
      'ON CONFLICT ("user_id") DO UPDATE SET "payload" = "user_profiles"."payload" || EXCLUDED."payload", "updated_at" = now()',
    Number(userId),
    payloadJson
  );

  const payload = await getProfilePayload(userId);
  return mapDbProfileToApi(existing, payload);
};

const getPortfolioState = (profile = {}) => ({
  portfolio: normalizeArray(profile.portfolio),
  portfolioFileNames: normalizeArray(profile.portfolioFileNames),
  portfolioTitles: normalizeArray(profile.portfolioTitles),
  portfolioDescriptions: normalizeArray(profile.portfolioDescriptions),
  portfolioLinks: normalizeArray(profile.portfolioLinks),
  portfolioRoles: normalizeArray(profile.portfolioRoles),
  portfolioTechnologies: normalizeArray(profile.portfolioTechnologies),
});

const updatePortfolioItem = async (userId, index, input = {}) => {
  const existing = await getMyProfile(userId);
  if (!existing) return null;

  const itemIndex = Number(index);
  if (!Number.isInteger(itemIndex) || itemIndex < 0) return null;

  const current = getPortfolioState(existing);
  if (!current.portfolio[itemIndex]) return null;

  const next = {
    portfolio: [...current.portfolio],
    portfolioFileNames: [...current.portfolioFileNames],
    portfolioTitles: [...current.portfolioTitles],
    portfolioDescriptions: [...current.portfolioDescriptions],
    portfolioLinks: [...current.portfolioLinks],
    portfolioRoles: [...current.portfolioRoles],
    portfolioTechnologies: [...current.portfolioTechnologies],
  };

  if (input.url !== undefined) next.portfolio[itemIndex] = input.url;
  if (input.name !== undefined) next.portfolioFileNames[itemIndex] = input.name;
  if (input.title !== undefined) next.portfolioTitles[itemIndex] = input.title;
  if (input.description !== undefined) next.portfolioDescriptions[itemIndex] = input.description;
  if (input.liveLink !== undefined) next.portfolioLinks[itemIndex] = input.liveLink;
  if (input.role !== undefined) next.portfolioRoles[itemIndex] = input.role;
  if (input.technologies !== undefined) {
    next.portfolioTechnologies[itemIndex] = normalizeArray(input.technologies);
  }

  return updateMyProfile(userId, next);
};

const deletePortfolioItem = async (userId, index) => {
  const existing = await getMyProfile(userId);
  if (!existing) return null;

  const itemIndex = Number(index);
  if (!Number.isInteger(itemIndex) || itemIndex < 0) return null;

  const current = getPortfolioState(existing);
  if (!current.portfolio[itemIndex]) return null;

  const next = {
    portfolio: [...current.portfolio],
    portfolioFileNames: [...current.portfolioFileNames],
    portfolioTitles: [...current.portfolioTitles],
    portfolioDescriptions: [...current.portfolioDescriptions],
    portfolioLinks: [...current.portfolioLinks],
    portfolioRoles: [...current.portfolioRoles],
    portfolioTechnologies: [...current.portfolioTechnologies],
  };

  Object.values(next).forEach((arr) => arr.splice(itemIndex, 1));
  return updateMyProfile(userId, next);
};

const savePendingProfile = async (userId, input = {}) => {
  if (!prisma.pendingProfile) {
    // Prisma client not generated with PendingProfile yet.
    return null;
  }
  const sanitized = sanitizeProfileInput(input);
  const payload = {
    ...sanitized,
    skills: sanitized.skills !== undefined ? normalizeArray(sanitized.skills) : undefined,
    primarySkills: sanitized.primarySkills !== undefined ? normalizeArray(sanitized.primarySkills) : undefined,
    subSkills: sanitized.subSkills !== undefined ? normalizeArray(sanitized.subSkills) : undefined,
    toolsTechnologies:
      sanitized.toolsTechnologies !== undefined ? normalizeArray(sanitized.toolsTechnologies) : undefined,
    preferredSkills:
      sanitized.preferredSkills !== undefined ? normalizeArray(sanitized.preferredSkills) : undefined,
    industriesOfInterest:
      sanitized.industriesOfInterest !== undefined ? normalizeArray(sanitized.industriesOfInterest) : undefined,
    languages: sanitized.languages !== undefined ? normalizeArray(sanitized.languages) : undefined,
    portfolio: sanitized.portfolio !== undefined ? normalizeArray(sanitized.portfolio) : undefined,
    portfolioFileNames:
      sanitized.portfolioFileNames !== undefined ? normalizeArray(sanitized.portfolioFileNames) : undefined,
    portfolioTitles:
      sanitized.portfolioTitles !== undefined ? normalizeArray(sanitized.portfolioTitles) : undefined,
    portfolioDescriptions:
      sanitized.portfolioDescriptions !== undefined ? normalizeArray(sanitized.portfolioDescriptions) : undefined,
    portfolioLinks:
      sanitized.portfolioLinks !== undefined ? normalizeArray(sanitized.portfolioLinks) : undefined,
    portfolioRoles:
      sanitized.portfolioRoles !== undefined ? normalizeArray(sanitized.portfolioRoles) : undefined,
    portfolioTechnologies:
      sanitized.portfolioTechnologies !== undefined ? normalizeArray(sanitized.portfolioTechnologies) : undefined,
    portfolioVideos:
      sanitized.portfolioVideos !== undefined ? normalizeArray(sanitized.portfolioVideos) : undefined,
  };

  const data = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  if (!Object.keys(data).length) return null;

  return prisma.pendingProfile.upsert({
    where: { userId: Number(userId) },
    update: { payload: data },
    create: { userId: Number(userId), payload: data },
  });
};

const applyPendingProfile = async (userId) => {
  if (!prisma.pendingProfile) {
    // Prisma client not generated with PendingProfile yet.
    return null;
  }
  const pending = await prisma.pendingProfile.findUnique({
    where: { userId: Number(userId) },
  });

  if (!pending) return null;

  const updated = await updateMyProfile(userId, pending.payload || {});

  await prisma.pendingProfile.delete({ where: { userId: Number(userId) } });

  return updated;
};

module.exports = {
  ensureProfileColumns,
  getMyProfile,
  updateMyProfile,
  updatePortfolioItem,
  deletePortfolioItem,
  savePendingProfile,
  applyPendingProfile,
  sanitizeProfileInput,
  mapDbProfileToApi,
};
