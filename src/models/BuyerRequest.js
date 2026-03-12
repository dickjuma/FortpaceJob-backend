const mongoose = require("mongoose");

const buyerRequestSchema = new mongoose.Schema(
  {
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 3000 },
    category: { type: String, required: true },
    subcategory: { type: String },
    serviceMode: {
      type: String,
      enum: ["Fully online", "Physical on-site", "Hybrid (online + on-site)"],
      default: "Fully online",
    },
    location: { type: String, default: "Remote" },
    tags: [{ type: String }],
    budgetMin: { type: Number, required: true },
    budgetMax: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    deadline: { type: Date },
    isUrgent: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["open", "in_progress", "closed", "expired"],
      default: "open",
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    proposals: [{ type: mongoose.Schema.Types.ObjectId, ref: "Proposal" }],
    proposalCount: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    matchScore: { type: Number, default: 0 }, // computed per-user
  },
  { timestamps: true }
);

buyerRequestSchema.index({ buyer: 1 });
buyerRequestSchema.index({ category: 1 });
buyerRequestSchema.index({ status: 1 });
buyerRequestSchema.index({ expiresAt: 1 });
buyerRequestSchema.index({ title: "text", description: "text" });

module.exports = mongoose.model("BuyerRequest", buyerRequestSchema);
