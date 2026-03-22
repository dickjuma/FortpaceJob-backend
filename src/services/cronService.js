const cron = require("node-cron");
const { Resend } = require("resend");
const { prisma } = require("../config/db");
const logger = require("../utils/logger");

const resend = new Resend(process.env.RESEND_API_KEY);

const initCronJob = () => {
  // Run every hour: "0 * * * *"
  cron.schedule("0 * * * *", async () => {
    logger.info("Running profile completion reminder job...");
    
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Find users who need a reminder
      // Logic: Incomplete profile, reminder NOT sent recently (or ever),
      // and last update/creation was > 24 hours ago.
      const usersToRemind = await prisma.user.findMany({
        where: {
          profileCompleted: false,
          reminderSent: false,
          OR: [
            { lastProfileUpdate: { lt: twentyFourHoursAgo } },
            { 
              // Fallback if they never updated profile
              lastProfileUpdate: null, 
              createdAt: { lt: twentyFourHoursAgo } 
            }
          ]
        },
        take: 50 // Process in batches to avoid rate limits
      });

      logger.info(`Found ${usersToRemind.length} users to remind.`);

      for (const user of usersToRemind) {
        if (!user.email) continue;

        try {
          await resend.emails.send({
            from: "Forte Team <no-reply@forte.com>",
            to: user.email,
            subject: "Complete Your Forte Profile 🚀",
            html: `
              <div style="font-family: sans-serif; color: #333;">
                <h2>Hi ${user.name || "there"},</h2>
                <p>You’re just one step away from unlocking full access on Forte.</p>
                
                <p>Complete your profile to:</p>
                <ul>
                  <li>Get hired faster (freelancers)</li>
                  <li>Attract top talent (clients)</li>
                </ul>
                
                <p>
                  <a href="${process.env.CLIENT_URL}/profile" style="background: #D34079; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    Update Profile
                  </a>
                </p>
                <br/>
                <p>– Forte Team</p>
              </div>
            `
          });

          // Update User State
          await prisma.user.update({
            where: { id: user.id },
            data: { reminderSent: true }
          });
        } catch (emailError) {
          logger.error(`Failed to email user ${user.id}: ${emailError.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error in profile reminder cron job: ${error.message}`);
    }
  });

  // Run daily at midnight: "0 0 * * *"
  cron.schedule("0 0 * * *", async () => {
    logger.info("Running expired OTP cleanup job...");
    try {
      const result = await prisma.otpCode.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      logger.info(`Cleanup job: Deleted ${result.count} expired OTPs.`);
    } catch (error) {
      logger.error(`Error during expired OTP cleanup job: ${error.message}`);
    }
  });
  
  logger.info("Cron service initialized.");
};

module.exports = { initCronJob };
