const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "https://fortpace-job.vercel.app/api",
  "https://fortpacejob-1.onrender.com",
];

const normalizeOrigin = (origin) => {
  if (!origin || typeof origin !== "string") {
    return null;
  }

  return origin.trim().replace(/\/+$/, "");
};

const parseOrigins = (value) =>
  String(value || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

const getAllowedOrigins = () => {
  const origins = new Set(DEFAULT_ORIGINS.map(normalizeOrigin));

  parseOrigins(process.env.CLIENT_URL).forEach((origin) => origins.add(origin));
  parseOrigins(process.env.CLIENT_URLS).forEach((origin) => origins.add(origin));
  parseOrigins(process.env.ALLOWED_ORIGINS).forEach((origin) => origins.add(origin));

  return [...origins];
};

module.exports = {
  getAllowedOrigins,
  normalizeOrigin,
};
