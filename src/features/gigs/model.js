const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema({
  name: { type: String, enum: ["Basic", "Standard", "Premium"], required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 1 },
  deliveryDays: { type: Number, required: true, min: 1 },
  revisions: { type: Number, default: 1 },
  features: [{ type: String }],
});

const gigSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, unique: true },
    category: { type: String, required: true },
    subcategory: { type: String },
    serviceMode: {
      type: String,
      enum: ["Fully online", "Physical on-site", "Hybrid (online + on-site)"],
      default: "Fully online",
    },
    physicalCategory: { type: String },
    serviceArea: { type: String },
    tags: [{ type: String }],
    description: { type: String, required: true, maxlength: 5000 },
    packages: [packageSchema],
    images: [{ type: String }],       // Cloudinary URLs
    video: { type: String },          // Cloudinary video URL
    faqs: [
      {
        question: { type: String },
        answer: { type: String },
      },
    ],
    requirements: [{ type: String }],
    status: {
      type: String,
      enum: ["draft", "active", "paused", "under_review", "rejected"],
      default: "draft",
    },
    isPromoted: { type: Boolean, default: false },
    promotionExpiry: { type: Date },

    // ─── Stats ────────────────────────────────────────────────────────────────
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    completedOrders: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
gigSchema.index({ seller: 1 });
gigSchema.index({ category: 1 });
gigSchema.index({ status: 1 });
gigSchema.index({ tags: 1 });
gigSchema.index({ avgRating: -1 });
gigSchema.index({ title: "text", description: "text", tags: "text" });

module.exports = mongoose.model("Gig", gigSchema);
