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
  "companyName",
  "bio",
  "skills",
  "hourlyRate",
  "currency",
  "serviceMode",
  "physicalCategory",
  "serviceArea",
  "companyDescription",
  "industry",
  "budget",
  "hiringCapacity",
  "country",
  "languages",
  "avatar",
  "avatarPublicId",
  "avatarFileName",
  "companyLogo",
  "companyLogoPublicId",
  "companyLogoFileName",
  "portfolio",
  "portfolioFileNames",
  "portfolioVideos",
  "introVideo",
  "introVideoPublicId",
  "introVideoFileName",
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
  return {
    id: user.id,
    _id: user.id,
    email: user.email,
    name: profile.name || "",
    role: user.role,
    createdAt: user.createdAt,
    phoneNumber: user.phoneNumber || "",
    companyName: profile.companyName || "",
    bio: profile.bio || "",
    skills: normalizeArray(profile.skills),
    hourlyRate: toNumber(profile.hourlyRate, 10),
    currency: profile.currency || "USD",
    serviceMode: profile.serviceMode || "",
    physicalCategory: profile.physicalCategory || "",
    serviceArea: profile.serviceArea || "",
    companyDescription: profile.companyDescription || "",
    industry: profile.industry || "",
    budget: toNumber(profile.budget, 0),
    hiringCapacity: Number(profile.hiringCapacity || 1),
    country: profile.country || "",
    languages: normalizeArray(profile.languages),
    avatar: profile.avatar || "",
    avatarPublicId: profile.avatarPublicId || "",
    avatarFileName: profile.avatarFileName || "",
    companyLogo: profile.companyLogo || "",
    companyLogoPublicId: profile.companyLogoPublicId || "",
    companyLogoFileName: profile.companyLogoFileName || "",
    portfolio: normalizeArray(profile.portfolio),
    portfolioFileNames: normalizeArray(profile.portfolioFileNames),
    portfolioVideos: normalizeArray(profile.portfolioVideos),
    introVideo: profile.introVideo || "",
    introVideoPublicId: profile.introVideoPublicId || "",
    introVideoFileName: profile.introVideoFileName || "",
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
    languages: sanitized.languages !== undefined ? normalizeArray(sanitized.languages) : undefined,
    portfolio: sanitized.portfolio !== undefined ? normalizeArray(sanitized.portfolio) : undefined,
    portfolioFileNames:
      sanitized.portfolioFileNames !== undefined ? normalizeArray(sanitized.portfolioFileNames) : undefined,
    portfolioVideos:
      sanitized.portfolioVideos !== undefined ? normalizeArray(sanitized.portfolioVideos) : undefined,
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

const savePendingProfile = async (userId, input = {}) => {
  if (!prisma.pendingProfile) {
    // Prisma client not generated with PendingProfile yet.
    return null;
  }
  const sanitized = sanitizeProfileInput(input);
  const payload = {
    ...sanitized,
    skills: sanitized.skills !== undefined ? normalizeArray(sanitized.skills) : undefined,
    languages: sanitized.languages !== undefined ? normalizeArray(sanitized.languages) : undefined,
    portfolio: sanitized.portfolio !== undefined ? normalizeArray(sanitized.portfolio) : undefined,
    portfolioFileNames:
      sanitized.portfolioFileNames !== undefined ? normalizeArray(sanitized.portfolioFileNames) : undefined,
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
  savePendingProfile,
  applyPendingProfile,
  sanitizeProfileInput,
};
