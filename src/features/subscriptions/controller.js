/**
 * Subscription Controller for Forte Platform
 * Handles subscription plans, billing, and feature management
 */

const Subscription = require("./model");
const User = require("../../models/User");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const logger = require("../../utils/logger");

// ─── Get Available Plans ─────────────────────────────────────────────────────────
exports.getPlans = async (req, res) => {
  try {
    const plans = [
      Subscription.getPlanFeatures("free"),
      Subscription.getPlanFeatures("basic"),
      Subscription.getPlanFeatures("pro"),
      Subscription.getPlanFeatures("enterprise"),
    ];
    
    res.json({ success: true, plans });
  } catch (error) {
    next(error);
  }
};

// ─── Get My Subscription ───────────────────────────────────────────────────────
exports.getMySubscription = async (req, res, next) => {
  try {
    let subscription = await Subscription.findOne({ user: req.user._id })
      .populate("user", "name email");
    
    if (!subscription) {
      // Create free subscription for new users
      subscription = await Subscription.create({
        user: req.user._id,
        plan: "free",
        status: "active",
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        features: Subscription.getPlanFeatures("free").features,
      });
    }
    
    const planInfo = Subscription.getPlanFeatures(subscription.plan);
    
    res.json({
      success: true,
      subscription,
      plan: planInfo,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Create Subscription (Stripe Checkout) ─────────────────────────────────────
exports.createSubscription = async (req, res, next) => {
  try {
    const { plan, billingCycle } = req.body;
    
    if (!["free", "basic", "pro", "enterprise"].includes(plan)) {
      return res.status(400).json({ success: false, message: "Invalid plan." });
    }
    
    if (plan === "free") {
      // Create free subscription
      const subscription = await Subscription.create({
        user: req.user._id,
        plan: "free",
        status: "active",
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        features: Subscription.getPlanFeatures("free").features,
      });
      
      return res.json({ success: true, subscription });
    }
    
    // For paid plans, create Stripe checkout session
    const planInfo = Subscription.getPlanFeatures(plan);
    const price = billingCycle === "yearly" 
      ? planInfo.price * 12 * 0.8 // 20% discount for yearly
      : planInfo.price;
    
    // Create or get Stripe customer
    let customerId;
    const existingSub = await Subscription.findOne({ user: req.user._id });
    if (existingSub?.stripeCustomerId) {
      customerId = existingSub.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { userId: req.user._id.toString() },
      });
      customerId = customer.id;
    }
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Forte ${planInfo.name} Plan`,
              description: billingCycle === "yearly" ? "Annual subscription" : "Monthly subscription",
            },
            unit_amount: Math.round(price * 100),
            recurring: {
              interval: billingCycle === "yearly" ? "year" : "month",
            },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.CLIENT_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/subscription/cancel`,
      metadata: {
        userId: req.user._id.toString(),
        plan,
        billingCycle,
      },
    });
    
    res.json({ success: true, url: session.url, sessionId: session.id });
  } catch (error) {
    next(error);
  }
};

// ─── Handle Stripe Webhook ───────────────────────────────────────────────────
exports.handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const { userId, plan, billingCycle } = session.metadata;
        
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + (billingCycle === "yearly" ? 12 : 1));
        
        await Subscription.findOneAndUpdate(
          { user: userId },
          {
            plan,
            status: "active",
            billingCycle,
            startDate: new Date(),
            endDate,
            stripeSubscriptionId: session.subscription,
            stripeCustomerId: session.customer,
            features: Subscription.getPlanFeatures(plan).features,
            autoRenew: true,
          },
          { upsert: true }
        );
        
        // Update user
        await User.findByIdAndUpdate(userId, {
          "subscription.plan": plan,
        });
        
        logger.info(`Subscription created for user ${userId}: ${plan}`);
        break;
      }
      
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        await Subscription.findOneAndUpdate(
          { stripeSubscriptionId: subscription.id },
          {
            status: subscription.status === "active" ? "active" : "past_due",
            endDate: new Date(subscription.current_period_end * 1000),
          }
        );
        break;
      }
      
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await Subscription.findOneAndUpdate(
          { stripeSubscriptionId: subscription.id },
          {
            status: "cancelled",
            plan: "free",
            features: Subscription.getPlanFeatures("free").features,
          }
        );
        
        logger.info(`Subscription cancelled: ${subscription.id}`);
        break;
      }
      
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        await Subscription.findOneAndUpdate(
          { stripeCustomerId: invoice.customer },
          { status: "past_due" }
        );
        
        logger.warn(`Payment failed for customer: ${invoice.customer}`);
        break;
      }
    }
  } catch (error) {
    logger.error(`Webhook handler error: ${error.message}`);
  }
  
  res.json({ received: true });
};

// ─── Cancel Subscription ───────────────────────────────────────────────────────
exports.cancelSubscription = async (req, res, next) => {
  try {
    const { immediately } = req.body;
    
    const subscription = await Subscription.findOne({ user: req.user._id });
    
    if (!subscription) {
      return res.status(404).json({ success: false, message: "No active subscription." });
    }
    
    if (subscription.plan === "free") {
      return res.status(400).json({ success: false, message: "Free plan cannot be cancelled." });
    }
    
    if (subscription.stripeSubscriptionId) {
      // Cancel in Stripe
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: !immediately,
      });
    }
    
    // Update in our DB
    if (immediately) {
      subscription.status = "cancelled";
      subscription.plan = "free";
      subscription.features = Subscription.getPlanFeatures("free").features;
      subscription.autoRenew = false;
    } else {
      subscription.autoRenew = false;
    }
    
    subscription.cancelledAt = new Date();
    await subscription.save();
    
    // Update user
    await User.findByIdAndUpdate(req.user._id, {
      "subscription.plan": "free",
    });
    
    res.json({
      success: true,
      message: immediately 
        ? "Subscription cancelled immediately." 
        : "Subscription will be cancelled at the end of billing period.",
    });
  } catch (error) {
    next(error);
  }
};

// ─── Check Feature Access ─────────────────────────────────────────────────────
exports.checkFeatureAccess = async (req, res, next) => {
  try {
    const { feature } = req.params;
    
    const subscription = await Subscription.findOne({ user: req.user._id });
    
    if (!subscription) {
      return res.json({ success: true, hasAccess: false, plan: "free" });
    }
    
    const planInfo = Subscription.getPlanFeatures(subscription.plan);
    const hasAccess = planInfo.features[feature] === true || 
                      planInfo.features[feature] === -1; // -1 means unlimited
    
    res.json({
      success: true,
      hasAccess,
      plan: subscription.plan,
      value: planInfo.features[feature],
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get Usage Stats ─────────────────────────────────────────────────────────
exports.getUsageStats = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({ user: req.user._id });
    
    if (!subscription) {
      return res.json({
        success: true,
        usage: { gigsUsed: 0, proposalsUsed: 0 },
        limits: Subscription.getPlanFeatures("free").features,
      });
    }
    
    const planInfo = Subscription.getPlanFeatures(subscription.plan);
    
    res.json({
      success: true,
      usage: subscription.usage,
      limits: planInfo.features,
      plan: subscription.plan,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Update Usage ────────────────────────────────────────────────────────────
exports.updateUsage = async (userId, type) => {
  try {
    const subscription = await Subscription.findOne({ user: userId });
    if (!subscription) return;
    
    const usageField = type === "gig" ? "gigsUsed" : 
                       type === "proposal" ? "proposalsUsed" : 
                       "messagesSent";
    
    subscription.usage[usageField] = (subscription.usage[usageField] || 0) + 1;
    await subscription.save();
  } catch (error) {
    logger.error(`Error updating usage: ${error.message}`);
  }
};

module.exports = exports;

