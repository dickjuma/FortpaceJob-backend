const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, maxlength: 5000 },
    attachments: [
      {
        url: { type: String },
        type: { type: String, enum: ["image", "file", "video"] },
        name: { type: String },
      },
    ],
    type: {
      type: String,
      enum: ["text", "offer", "system"],
      default: "text",
    },
    offerDetails: {
      amount: { type: Number },
      deliveryDays: { type: Number },
      description: { type: String },
      status: { type: String, enum: ["pending", "accepted", "declined"] },
    },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });

// ─── Conversation Model ───────────────────────────────────────────────────────
const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    contract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract" },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    lastMessageAt: { type: Date },
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });

const Message = mongoose.model("Message", messageSchema);
const Conversation = mongoose.model("Conversation", conversationSchema);

module.exports = { Message, Conversation };
