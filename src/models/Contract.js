const mongoose = require("mongoose");

const milestoneSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  amount: { type: Number, required: true },
  dueDate: { type: Date },
  status: {
    type: String,
    enum: ["pending", "in_progress", "submitted", "approved", "revision_requested"],
    default: "pending",
  },
  deliverables: [{ type: String }], // Cloudinary URLs
  submittedAt: { type: Date },
  approvedAt: { type: Date },
});

const contractSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    gig: { type: mongoose.Schema.Types.ObjectId, ref: "Gig" },
    buyerRequest: { type: mongoose.Schema.Types.ObjectId, ref: "BuyerRequest" },
    proposal: { type: mongoose.Schema.Types.ObjectId, ref: "Proposal" },

    // ─── Financials ───────────────────────────────────────────────────────────
    totalAmount: { type: Number, required: true },
    platformFee: { type: Number, required: true },
    freelancerEarnings: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    paymentStatus: {
      type: String,
      enum: ["pending", "escrowed", "released", "refunded", "disputed"],
      default: "pending",
    },
    stripePaymentIntentId: { type: String },

    // ─── Delivery ─────────────────────────────────────────────────────────────
    deliveryDays: { type: Number, required: true },
    startDate: { type: Date },
    dueDate: { type: Date },
    deliveredAt: { type: Date },
    completedAt: { type: Date },

    // ─── Status ───────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        "pending_payment",
        "active",
        "delivered",
        "revision_requested",
        "completed",
        "cancelled",
        "disputed",
      ],
      default: "pending_payment",
    },
    cancellationReason: { type: String },
    disputeReason: { type: String },
    revisionCount: { type: Number, default: 0 },
    maxRevisions: { type: Number, default: 1 },

    // ─── Milestones ───────────────────────────────────────────────────────────
    milestones: [milestoneSchema],

    // ─── Requirements ─────────────────────────────────────────────────────────
    requirements: { type: String },
    deliverables: [{ type: String }], // final Cloudinary URLs
  },
  { timestamps: true }
);

contractSchema.index({ client: 1 });
contractSchema.index({ freelancer: 1 });
contractSchema.index({ status: 1 });
contractSchema.index({ gig: 1 });

module.exports = mongoose.model("Contract", contractSchema);
