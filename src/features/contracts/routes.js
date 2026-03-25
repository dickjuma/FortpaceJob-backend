const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../../middlewares/auth");
const { uploadPortfolio } = require("../../middlewares/upload");
const {
  createContract,
  getMyContracts,
  getContract,
  deliverContract,
  acceptDelivery,
  requestRevision,
  cancelContract,
} = require("./controller");

router.post("/", protect, restrictTo("client"), createContract);
router.get("/", protect, getMyContracts);
router.get("/:id", protect, getContract);
router.patch("/:id/deliver", protect, restrictTo("freelancer"), uploadPortfolio.array("deliverables", 10), deliverContract);
router.patch("/:id/accept", protect, restrictTo("client"), acceptDelivery);
router.patch("/:id/revision", protect, restrictTo("client"), requestRevision);
router.patch("/:id/cancel", protect, cancelContract);

module.exports = router;

