const Notification = require("../models/Notification");
const { getPagination, paginate } = require("../utils/helpers");

// ─── Get my notifications ─────────────────────────────────────────────────────
exports.getNotifications = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { recipient: req.user._id };
    if (req.query.unread === "true") filter.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: req.user._id, isRead: false }),
    ]);

    res.json({ success: true, unreadCount, ...paginate(notifications, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Mark notification as read ────────────────────────────────────────────────
exports.markAsRead = async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true, message: "Notification marked as read." });
  } catch (error) {
    next(error);
  }
};

// ─── Mark all as read ─────────────────────────────────────────────────────────
exports.markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true, message: "All notifications marked as read." });
  } catch (error) {
    next(error);
  }
};

// ─── Delete notification ──────────────────────────────────────────────────────
exports.deleteNotification = async (req, res, next) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
    res.json({ success: true, message: "Notification deleted." });
  } catch (error) {
    next(error);
  }
};
