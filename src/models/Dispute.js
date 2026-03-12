const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true },
  attachments: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

const disputeSchema = new mongoose.Schema(
  {
    contract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", required: true },
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    against: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    
    // Dispute details
    reason: {
      type: String,
      enum: [
        "quality_issues",
        "non_delivery",
        "late_delivery",
        "scope_change",
        "communication",
        "payment_issue",
        "other",
      ],
      required: true,
    },
    description: { type: String, required: true, maxlength: 2000 },
    attachments: [{ type: String }],
    
    // Resolution
    status: {
      type: String,
      enum: ["open", "under_review", "awaiting_response", "resolved", "closed"],
      default: "open",
    },
    resolution: {
      type: String,
      enum: ["freelancer_wins", "client_wins", "partial_refund", "mutual_cancellation", "no_resolution"],
    },
    resolutionAmount: { type: Number }, // Amount refunded if partial
    resolutionNotes: { type: String },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
    
    // Communication
    messages: [messageSchema],
    
    // Timestamps for tracking
    lastActivityAt: { type: Date, default: Date.now },
    adminAssignedAt: { type: Date },
  },
  { timestamps: true }
);

// Indexes
disputeSchema.index({ contract: 1 });
disputeSchema.index({ openedBy: 1 });
disputeSchema.index({ against: 1 });
disputeSchema.index({ status: 1 });

module.exports = mongoose.model("Dispute", disputeSchema);
