const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "new_proposal",
        "proposal_accepted",
        "proposal_rejected",
        "contract_started",
        "contract_delivered",
        "contract_completed",
        "contract_cancelled",
        "new_message",
        "new_review",
        "payment_received",
        "payment_released",
        "gig_approved",
        "gig_rejected",
        "level_up",
        "badge_earned",
        "system",
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: { type: String }, // frontend route
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    // Related entities
    relatedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    relatedGig: { type: mongoose.Schema.Types.ObjectId, ref: "Gig" },
    relatedContract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract" },
    relatedProposal: { type: mongoose.Schema.Types.ObjectId, ref: "Proposal" },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
