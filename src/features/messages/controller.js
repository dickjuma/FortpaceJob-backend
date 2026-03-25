const { Message, Conversation } = require("./model");
const { getPagination, paginate } = require("../../utils/helpers");

// ─── Get or create conversation ───────────────────────────────────────────────
exports.getOrCreateConversation = async (req, res, next) => {
  try {
    const { participantId } = req.body;
    if (!participantId) return res.status(400).json({ success: false, message: "participantId required." });

    let conversation = await Conversation.findOne({
      participants: { $all: [req.user._id, participantId] },
    }).populate("participants", "name companyName avatar role");

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.user._id, participantId],
      });
      await conversation.populate("participants", "name companyName avatar role");
    }

    res.json({ success: true, conversation });
  } catch (error) {
    next(error);
  }
};

// ─── Get my conversations ─────────────────────────────────────────────────────
exports.getConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
      isArchived: false,
    })
      .populate("participants", "name companyName avatar role")
      .populate("lastMessage", "content createdAt sender")
      .sort({ lastMessageAt: -1 });

    res.json({ success: true, conversations });
  } catch (error) {
    next(error);
  }
};

// ─── Get messages in a conversation ──────────────────────────────────────────
exports.getMessages = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      participants: req.user._id,
    });
    if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found." });

    const [messages, total] = await Promise.all([
      Message.find({ conversation: req.params.conversationId, isDeleted: false })
        .populate("sender", "name companyName avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Message.countDocuments({ conversation: req.params.conversationId, isDeleted: false }),
    ]);

    // Mark messages as read
    await Message.updateMany(
      { conversation: req.params.conversationId, sender: { $ne: req.user._id }, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({ success: true, ...paginate(messages.reverse(), total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Send message ─────────────────────────────────────────────────────────────
exports.sendMessage = async (req, res, next) => {
  try {
    const { conversationId, content, type } = req.body;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user._id,
    });
    if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found." });

    const attachments = req.files
      ? req.files.map((f) => ({ url: f.path, type: "file", name: f.originalname }))
      : [];

    const message = await Message.create({
      conversation: conversationId,
      sender: req.user._id,
      content,
      attachments,
      type: type || "text",
    });

    await message.populate("sender", "name companyName avatar");

    // Update conversation
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    // Emit via socket (handled in socket.js)
    const io = req.app.get("io");
    if (io) {
      conversation.participants.forEach((pid) => {
        if (pid.toString() !== req.user._id.toString()) {
          io.to(`user:${pid}`).emit("new_message", { message, conversationId });
        }
      });
    }

    res.status(201).json({ success: true, message });
  } catch (error) {
    next(error);
  }
};

// ─── Delete message ───────────────────────────────────────────────────────────
exports.deleteMessage = async (req, res, next) => {
  try {
    const message = await Message.findOneAndUpdate(
      { _id: req.params.id, sender: req.user._id },
      { isDeleted: true, content: "This message was deleted." },
      { new: true }
    );
    if (!message) return res.status(404).json({ success: false, message: "Message not found." });
    res.json({ success: true, message: "Message deleted." });
  } catch (error) {
    next(error);
  }
};

