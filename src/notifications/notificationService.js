/**
 * Real-time Notification Service for Forte Platform
 * Handles in-app notifications, email notifications, and real-time events
 */

const Notification = require("../models/Notification");
const User = require("../models/User");
const logger = require("./logger");

// Notification types and their templates
const NOTIFICATION_TYPES = {
  // Auth
  WELCOME: { title: "Welcome to Forte!", template: "welcome" },
  EMAIL_VERIFIED: { title: "Email Verified", template: "email_verified" },
  
  // Contracts
  CONTRACT_CREATED: { title: "New Contract", template: "contract_created" },
  CONTRACT_STARTED: { title: "Contract Started", template: "contract_started" },
  CONTRACT_DELIVERED: { title: "Work Delivered", template: "contract_delivered" },
  CONTRACT_COMPLETED: { title: "Contract Completed", template: "contract_completed" },
  CONTRACT_CANCELLED: { title: "Contract Cancelled", template: "contract_cancelled" },
  
  // Payments
  PAYMENT_RECEIVED: { title: "Payment Received", template: "payment_received" },
  PAYMENT_RELEASED: { title: "Payment Released", template: "payment_released" },
  PAYMENT_REFUNDED: { title: "Payment Refunded", template: "payment_refunded" },
  ESCROW_HELD: { title: "Funds Held in Escrow", template: "escrow_held" },
  WITHDRAWAL_PROCESSED: { title: "Withdrawal Processed", template: "withdrawal_processed" },
  
  // Proposals
  PROPOSAL_RECEIVED: { title: "New Proposal", template: "proposal_received" },
  PROPOSAL_ACCEPTED: { title: "Proposal Accepted", template: "proposal_accepted" },
  PROPOSAL_REJECTED: { title: "Proposal Rejected", template: "proposal_rejected" },
  
  // Disputes
  DISPUTE_OPENED: { title: "Dispute Opened", template: "dispute_opened" },
  DISPUTE_RESOLVED: { title: "Dispute Resolved", template: "dispute_resolved" },
  DISPUTE_MESSAGE: { title: "New Dispute Message", template: "dispute_message" },
  
  // Messages
  NEW_MESSAGE: { title: "New Message", template: "new_message" },
  
  // Reviews
  REVIEW_RECEIVED: { title: "New Review", template: "review_received" },
  
  // General
  ACCOUNT_UPDATE: { title: "Account Updated", template: "account_update" },
  VERIFICATION_REQUIRED: { title: "Verification Required", template: "verification_required" },
};

/**
 * Create and save a notification
 */
exports.createNotification = async (data) => {
  try {
    const notification = await Notification.create({
      recipient: data.recipient,
      type: data.type,
      title: data.title,
      body: data.body,
      link: data.link,
      relatedContract: data.contractId,
      relatedUser: data.userId,
      metadata: data.metadata || {},
    });

    // Emit real-time event if socket is available
    if (global.io) {
      global.io.to(`user_${data.recipient}`).emit("notification", notification);
    }

    // Optionally send email notification
    if (data.sendEmail !== false) {
      await this.sendEmailNotification(data.recipient, notification);
    }

    return notification;
  } catch (error) {
    logger.error(`Error creating notification: ${error.message}`);
    return null;
  }
};

/**
 * Send email notification for in-app notification
 */
exports.sendEmailNotification = async (userId, notification) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // Only send email for important notifications
    const emailTypes = [
      "CONTRACT_DELIVERED",
      "CONTRACT_COMPLETED",
      "DISPUTE_OPENED",
      "DISPUTE_RESOLVED",
      "NEW_MESSAGE",
      "REVIEW_RECEIVED",
    ];

    if (!emailTypes.includes(notification.type)) return;

    const { sendEmail } = require("./email");
    
    const emailTemplates = {
      CONTRACT_DELIVERED: {
        subject: `Work Delivered - ${notification.title}`,
        body: notification.body,
      },
      CONTRACT_COMPLETED: {
        subject: `Contract Completed - ${notification.title}`,
        body: notification.body,
      },
      DISPUTE_OPENED: {
        subject: `Dispute Opened - ${notification.title}`,
        body: notification.body,
      },
      DISPUTE_RESOLVED: {
        subject: `Dispute Resolved - ${notification.title}`,
        body: notification.body,
      },
      NEW_MESSAGE: {
        subject: `New Message - ${notification.title}`,
        body: notification.body,
      },
      REVIEW_RECEIVED: {
        subject: `New Review Received - ${notification.title}`,
        body: notification.body,
      },
    };

    const template = emailTemplates[notification.type];
    if (template) {
      await sendEmail({
        to: user.email,
        subject: template.subject,
        html: `<p>${template.body}</p><p><a href="${process.env.CLIENT_URL}${notification.link}">View Details</a></p>`,
      });
    }
  } catch (error) {
    logger.error(`Error sending email notification: ${error.message}`);
  }
};

/**
 * Bulk create notifications for multiple users
 */
exports.createBulkNotifications = async (notifications) => {
  try {
    const created = await Notification.insertMany(notifications);
    
    // Emit real-time events
    if (global.io) {
      notifications.forEach((n) => {
        global.io.to(`user_${n.recipient}`).emit("notification", n);
      });
    }
    
    return created;
  } catch (error) {
    logger.error(`Error creating bulk notifications: ${error.message}`);
    return [];
  }
};

/**
 * Get unread notification count for a user
 */
exports.getUnreadCount = async (userId) => {
  try {
    const count = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });
    return count;
  } catch (error) {
    logger.error(`Error getting unread count: ${error.message}`);
    return 0;
  }
};

/**
 * Mark notification as read
 */
exports.markAsRead = async (notificationId, userId) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    return notification;
  } catch (error) {
    logger.error(`Error marking notification as read: ${error.message}`);
    return null;
  }
};

/**
 * Mark all notifications as read for a user
 */
exports.markAllAsRead = async (userId) => {
  try {
    await Notification.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    return true;
  } catch (error) {
    logger.error(`Error marking all notifications as read: ${error.message}`);
    return false;
  }
};

/**
 * Delete old notifications (cleanup job)
 */
exports.cleanupOldNotifications = async (daysOld = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await Notification.deleteMany({
      createdAt: { $lt: cutoffDate },
      isRead: true,
    });

    logger.info(`Cleaned up ${result.deletedCount} old notifications`);
    return result.deletedCount;
  } catch (error) {
    logger.error(`Error cleaning up notifications: ${error.message}`);
    return 0;
  }
};

// Export notification types
exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;

// Helper function to create specific notifications
exports.notifyContractEvent = async (contract, eventType, extraData = {}) => {
  const notificationMap = {
    created: {
      recipient: contract.freelancer,
      type: "CONTRACT_CREATED",
      title: "New Contract Created",
      body: `A new contract "${contract.title}" has been created.`,
      link: `/contracts/${contract._id}`,
      contractId: contract._id,
    },
    started: {
      recipient: contract.freelancer,
      type: "CONTRACT_STARTED",
      title: "Contract Started",
      body: `Contract "${contract.title}" is now active.`,
      link: `/contracts/${contract._id}`,
      contractId: contract._id,
    },
    delivered: {
      recipient: contract.client,
      type: "CONTRACT_DELIVERED",
      title: "Work Delivered",
      body: `Work has been delivered for "${contract.title}". Please review.`,
      link: `/contracts/${contract._id}`,
      contractId: contract._id,
    },
    completed: {
      recipient: contract.freelancer,
      type: "CONTRACT_COMPLETED",
      title: "Contract Completed",
      body: `Contract "${contract.title}" has been completed.`,
      link: `/contracts/${contract._id}`,
      contractId: contract._id,
    },
    cancelled: {
      recipient: contract.freelancer,
      type: "CONTRACT_CANCELLED",
      title: "Contract Cancelled",
      body: `Contract "${contract.title}" has been cancelled.`,
      link: `/contracts/${contract._id}`,
      contractId: contract._id,
    },
  };

  const notificationData = notificationMap[eventType];
  if (notificationData) {
    await exports.createNotification({ ...notificationData, ...extraData });
  }
};

exports.notifyPaymentEvent = async (userId, amount, currency, eventType, extraData = {}) => {
  const notificationMap = {
    received: {
      type: "PAYMENT_RECEIVED",
      title: "Payment Received",
      body: "You received " + currency + " " + amount + ".",
      link: "/wallet",
    },
    released: {
      type: "PAYMENT_RELEASED",
      title: "Payment Released",
      body: `${currency} ${amount} has been released to your wallet.`,
      link: "/wallet",
    },
    refunded: {
      type: "PAYMENT_REFUNDED",
      title: "Payment Refunded",
      body: `A refund of ${currency} ${amount} has been processed.`,
      link: "/wallet",
    },
    withdrawal: {
      type: "WITHDRAWAL_PROCESSED",
      title: "Withdrawal Processed",
      body: `Your withdrawal of ${currency} ${amount} has been processed.`,
      link: "/wallet",
    },
  };

  const notificationData = notificationMap[eventType];
  if (notificationData) {
    await exports.createNotification({
      recipient: userId,
      ...notificationData,
      ...extraData,
    });
  }
};

module.exports = exports;
