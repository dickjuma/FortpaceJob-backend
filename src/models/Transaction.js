const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    contract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract" },
    type: {
      type: String,
      enum: [
        "credit",          // money added to wallet
        "debit",           // money removed from wallet
        "escrow_hold",     // funds held in escrow
        "escrow_release",  // funds released from escrow
        "platform_fee",    // Forte's 10% cut
        "withdrawal",      // user withdraws to bank/mpesa
        "refund",          // refund to client
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    description: { type: String },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "reversed"],
      default: "completed",
    },
    stripePaymentIntentId: { type: String },
    stripeTransferId: { type: String },
    reference: { type: String }, // external reference (M-Pesa, PayPal, etc.)
    balanceBefore: { type: Number },
    balanceAfter: { type: Number },
  },
  { timestamps: true }
);

transactionSchema.index({ wallet: 1 });
transactionSchema.index({ user: 1 });
transactionSchema.index({ contract: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);
