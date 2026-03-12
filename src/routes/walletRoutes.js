const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/auth");
const {
  getWallet,
  getTransactions,
  updateWithdrawalMethod,
  requestWithdrawal,
} = require("../controllers/walletController");

router.get("/", protect, getWallet);
router.get("/transactions", protect, getTransactions);
router.patch("/withdrawal-method", protect, updateWithdrawalMethod);
router.post("/withdraw", protect, requestWithdrawal);

module.exports = router;
