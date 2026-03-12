const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { PrismaClient } = require("@prisma/client");
const logger = require("../utils/logger");

// Handle Supabase connection string for PgBouncer
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes("pooler.supabase.com")) {
  if (!process.env.DATABASE_URL.includes("pgbouncer=true")) {
    const separator = process.env.DATABASE_URL.includes("?") ? "&" : "?";
    process.env.DATABASE_URL = `${process.env.DATABASE_URL}${separator}pgbouncer=true`;
  }
  // Some shells/IDEs inject PRISMA_CLIENT_ENGINE_TYPE=dataproxy, which rejects postgresql:// URLs.
  if (process.env.DATABASE_URL.startsWith("postgresql://")) {
    delete process.env.PRISMA_CLIENT_ENGINE_TYPE;
  }
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

const connectDB = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Set it in .env.");
  }
  if (process.env.DATABASE_URL.includes("[YOUR-PASSWORD]")) {
    throw new Error("Replace [YOUR-PASSWORD] in DATABASE_URL before starting the server.");
  }

  try {
    await prisma.$connect();
    logger.info("Supabase PostgreSQL connected via Prisma.");
  } catch (error) {
    logger.error(`Prisma connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = { connectDB, prisma };
