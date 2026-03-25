const mongoose = require("mongoose");

const proposalSchema = new mongoose.Schema(
  {
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    buyerRequest: { type: mongoose.Schema.Types.ObjectId, ref: "BuyerRequest", required: true },
    coverLetter: { type: String, required: true, maxlength: 3000 },
    bidAmount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "USD" },
    deliveryDays: { type: Number, required: true, min: 1 },
    attachments: [{ type: String }], // Cloudinary URLs
    status: {
      type: String,
      enum: ["pending", "shortlisted", "accepted", "rejected", "withdrawn"],
      default: "pending",
    },
    isRead: { type: Boolean, default: false },
    clientNote: { type: String, maxlength: 500 }, // client's internal note
  },
  { timestamps: true }
);

proposalSchema.index({ freelancer: 1 });
proposalSchema.index({ buyerRequest: 1 });
proposalSchema.index({ status: 1 });

// Prevent duplicate proposals from same freelancer on same request
proposalSchema.index({ freelancer: 1, buyerRequest: 1 }, { unique: true });

module.exports = mongoose.model("Proposal", proposalSchema);
