const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const { getPagination, paginate } = require("../utils/helpers");

// ─── Get my wallet ────────────────────────────────────────────────────────────
exports.getWallet = async (req, res, next) => {
  try {
    let wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
      wallet = await Wallet.create({ user: req.user._id });
    }
    res.json({ success: true, wallet });
  } catch (error) {
    next(error);
  }
};

// ─── Get transaction history ──────────────────────────────────────────────────
exports.getTransactions = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { user: req.user._id };
    if (req.query.type) filter.type = req.query.type;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate("contract", "title")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(transactions, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Update withdrawal method ─────────────────────────────────────────────────
exports.updateWithdrawalMethod = async (req, res, next) => {
  try {
    const { withdrawalMethod, withdrawalDetails } = req.body;
    const wallet = await Wallet.findOneAndUpdate(
      { user: req.user._id },
      { withdrawalMethod, withdrawalDetails },
      { new: true, upsert: true }
    );
    res.json({ success: true, message: "Withdrawal method updated.", wallet });
  } catch (error) {
    next(error);
  }
};

// ─── Request withdrawal ───────────────────────────────────────────────────────
exports.requestWithdrawal = async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Valid amount required." });
    }

    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) return res.status(404).json({ success: false, message: "Wallet not found." });

    if (wallet.balance < amount) {
      return res.status(400).json({ success: false, message: "Insufficient balance." });
    }

    // Deduct from wallet
    wallet.balance -= amount;
    wallet.totalWithdrawn += amount;
    await wallet.save();

    // Record transaction
    const transaction = await Transaction.create({
      wallet: wallet._id,
      user: req.user._id,
      type: "withdrawal",
      amount,
      currency: wallet.currency,
      description: `Withdrawal via ${wallet.withdrawalMethod}`,
      status: "pending",
      balanceBefore: wallet.balance + amount,
      balanceAfter: wallet.balance,
    });

    res.json({ success: true, message: "Withdrawal request submitted.", transaction });
  } catch (error) {
    next(error);
  }
};
