const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const http = require("http");
const app = require("./src/app");
const { initSocket } = require("./src/chat/socket"); // This file will need refactoring from Mongoose to Prisma
const { connectDB, prisma } = require("./src/config/db");
const { verifyCloudinaryConnection } = require("./src/config/cloudinary");
const { verifyFluxSMSConnection } = require("./src/utils/sms");
const { verifyResendConnection } = require("./src/utils/email");
const logger = require("./src/utils/logger");
const { scheduleInactiveUserCleanup } = require("./src/controllers/userCleanup");
const { initCronJob } = require("./src/services/cronService");

const INITIAL_PORT = Number(process.env.PORT) || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO and attach io to app for use in controllers
const io = initSocket(server, { prisma }); // Pass prisma to socket setup
app.set("io", io);
app.set("prisma", prisma); // Make prisma available to routes if needed

const listenWithFallback = (port) =>
  new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      if (
        error.code === "EADDRINUSE" &&
        process.env.NODE_ENV !== "production" &&
        port < INITIAL_PORT + 10
      ) {
        const nextPort = port + 1;
        logger.warn(`Port ${port} is in use. Retrying on ${nextPort}...`);
        resolve(listenWithFallback(nextPort));
        return;
      }
      reject(error);
    };

    const onListening = () => {
      server.off("error", onError);
      logger.info(
        `Forte server running on port ${port} [${process.env.NODE_ENV || "development"}]`
      );
      resolve(port);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port);
  });

const startServer = async () => {
  try {
    await connectDB();

    await verifyCloudinaryConnection();
    await verifyResendConnection();
    await verifyFluxSMSConnection();
    await listenWithFallback(INITIAL_PORT);

    // Initialize scheduled jobs after server starts
    scheduleInactiveUserCleanup();
    initCronJob();
  } catch (err) {
    logger.error(`Server startup failed: ${err.message}`);
    process.exit(1);
  }
};


startServer();

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});
