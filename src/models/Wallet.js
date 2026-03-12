const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0 },          // available balance
    pendingBalance: { type: Number, default: 0 },   // escrowed / in-transit
    currency: { type: String, default: "USD" },
    totalEarned: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    // Withdrawal info
    withdrawalMethod: {
      type: String,
      enum: ["bank_transfer", "mpesa", "paypal", "stripe", ""],
      default: "",
    },
    withdrawalDetails: {
      accountName: { type: String },
      accountNumber: { type: String },
      bankName: { type: String },
      mpesaPhone: { type: String },
      paypalEmail: { type: String },
    },
    stripeAccountId: { type: String }, // Stripe Connect account
  },
  { timestamps: true }
);

walletSchema.index({ user: 1 });

module.exports = mongoose.model("Wallet", walletSchema);
