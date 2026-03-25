const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    
    // Subscription plan
    plan: {
      type: String,
      enum: ["free", "basic", "pro", "enterprise"],
      default: "free",
    },
    
    // Subscription status
    status: {
      type: String,
      enum: ["active", "cancelled", "expired", "paused", "past_due"],
      default: "active",
    },
    
    // Billing
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },
    
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    nextBillingDate: { type: Date },
    
    // Payment info
    stripeSubscriptionId: { type: String },
    stripeCustomerId: { type: String },
    paymentMethod: { type: String, default: "stripe" },
    
    // Feature limits
    features: {
      maxGigs: { type: Number, default: 3 },
      maxProposals: { type: Number, default: 10 },
      featuredSlots: { type: Number, default: 0 },
      prioritySupport: { type: Boolean, default: false },
      analyticsAccess: { type: Boolean, default: false },
      customPortfolio: { type: Boolean, default: false },
      verifiedBadge: { type: Boolean, default: false },
    },
    
    // Usage tracking
    usage: {
      gigsUsed: { type: Number, default: 0 },
      proposalsUsed: { type: Number, default: 0 },
      messagesSent: { type: Number, default: 0 },
    },
    
    // Cancellation
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
    
    // Auto-renewal
    autoRenew: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexes
subscriptionSchema.index({ user: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });

// Virtual for checking if subscription is valid
subscriptionSchema.virtual("isValid").get(function () {
  return (
    this.status === "active" &&
    this.endDate > new Date()
  );
});

// Static method to get plan features
subscriptionSchema.statics.getPlanFeatures = (plan) => {
  const plans = {
    free: {
      name: "Free",
      price: 0,
      features: {
        maxGigs: 3,
        maxProposals: 10,
        featuredSlots: 0,
        prioritySupport: false,
        analyticsAccess: false,
        customPortfolio: false,
        verifiedBadge: false,
      },
    },
    basic: {
      name: "Basic",
      price: 9.99,
      features: {
        maxGigs: 10,
        maxProposals: 25,
        featuredSlots: 1,
        prioritySupport: false,
        analyticsAccess: true,
        customPortfolio: false,
        verifiedBadge: false,
      },
    },
    pro: {
      name: "Pro",
      price: 29.99,
      features: {
        maxGigs: 25,
        maxProposals: 100,
        featuredSlots: 3,
        prioritySupport: true,
        analyticsAccess: true,
        customPortfolio: true,
        verifiedBadge: true,
      },
    },
    enterprise: {
      name: "Enterprise",
      price: 99.99,
      features: {
        maxGigs: -1, // unlimited
        maxProposals: -1, // unlimited
        featuredSlots: 10,
        prioritySupport: true,
        analyticsAccess: true,
        customPortfolio: true,
        verifiedBadge: true,
      },
    },
  };
  
  return plans[plan] || plans.free;
};

module.exports = mongoose.model("Subscription", subscriptionSchema);
