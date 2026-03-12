const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth");
const { uploadPortfolio } = require("../middlewares/upload");
const {
  submitProposal,
  getProposalsForRequest,
  getMyProposals,
  updateProposalStatus,
  withdrawProposal,
} = require("../controllers/proposalController");

router.post("/", protect, restrictTo("freelancer"), uploadPortfolio.array("attachments", 5), submitProposal);
router.get("/mine", protect, restrictTo("freelancer"), getMyProposals);
router.get("/request/:requestId", protect, restrictTo("client"), getProposalsForRequest);
router.patch("/:id/status", protect, restrictTo("client"), updateProposalStatus);
router.patch("/:id/withdraw", protect, restrictTo("freelancer"), withdrawProposal);

module.exports = router;
