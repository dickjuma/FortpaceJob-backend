const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    contract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", required: true },
    gig: { type: mongoose.Schema.Types.ObjectId, ref: "Gig" },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reviewee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 1000 },
    // Detailed ratings
    communication: { type: Number, min: 1, max: 5 },
    quality: { type: Number, min: 1, max: 5 },
    delivery: { type: Number, min: 1, max: 5 },
    value: { type: Number, min: 1, max: 5 },
    // Response from reviewee
    response: { type: String, maxlength: 500 },
    respondedAt: { type: Date },
    isPublic: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One review per contract per reviewer
reviewSchema.index({ contract: 1, reviewer: 1 }, { unique: true });
reviewSchema.index({ reviewee: 1 });
reviewSchema.index({ gig: 1 });
reviewSchema.index({ rating: -1 });

module.exports = mongoose.model("Review", reviewSchema);
