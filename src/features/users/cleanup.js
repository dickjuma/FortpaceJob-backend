const cron = require("node-cron");
const { prisma } = require("../../config/db");
const logger = require("../../utils/logger");

/**
 * Deletes inactive users who signed up more than 24 hours ago.
 * This job runs at the top of every hour.
 */
const scheduleInactiveUserCleanup = () => {
  cron.schedule("0 * * * *", async () => {
    logger.info("Running scheduled job: cleaning up inactive users...");

    try {
      const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const result = await prisma.user.deleteMany({
        where: {
          isActive: false, // Target users who have not completed verification
          createdAt: {
            lt: cutoffDate, // Target users created more than 24 hours ago
          },
        },
      });

      if (result.count > 0) {
        logger.info(`Cleanup job: Deleted ${result.count} inactive user(s).`);
      }
    } catch (error) {
      logger.error(`Error during inactive user cleanup job: ${error.message}`);
    }
  });

  logger.info("Scheduled job for inactive user cleanup is registered.");
};

module.exports = {
  scheduleInactiveUserCleanup,
};
