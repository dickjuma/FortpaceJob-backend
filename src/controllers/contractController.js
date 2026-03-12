const Contract = require("../models/Contract");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { getPagination, paginate, calculateFee } = require("../utils/helpers");
const { sendContractStartedEmail } = require("../utils/email");

// ─── Create contract (from accepted proposal or direct gig order) ─────────────
exports.createContract = async (req, res, next) => {
  try {
    const { freelancerId, gigId, buyerRequestId, proposalId, title, totalAmount, deliveryDays, requirements } = req.body;

    if (!freelancerId || !title || !totalAmount || !deliveryDays) {
      return res.status(400).json({ success: false, message: "freelancerId, title, totalAmount and deliveryDays are required." });
    }

    const { fee, net } = calculateFee(totalAmount);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + deliveryDays);

    const contract = await Contract.create({
      title,
      client: req.user._id,
      freelancer: freelancerId,
      gig: gigId,
      buyerRequest: buyerRequestId,
      proposal: proposalId,
      totalAmount,
      platformFee: fee,
      freelancerEarnings: net,
      deliveryDays,
      requirements,
      dueDate,
      status: "pending_payment",
    });

    res.status(201).json({ success: true, message: "Contract created. Awaiting payment.", contract });
  } catch (error) {
    next(error);
  }
};

// ─── Get my contracts ─────────────────────────────────────────────────────────
exports.getMyContracts = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const isClient = req.user.role === "client";
    const filter = isClient ? { client: req.user._id } : { freelancer: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [contracts, total] = await Promise.all([
      Contract.find(filter)
        .populate(isClient ? "freelancer" : "client", "name companyName avatar avgRating")
        .populate("gig", "title images")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Contract.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(contracts, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Get single contract ──────────────────────────────────────────────────────
exports.getContract = async (req, res, next) => {
  try {
    const contract = await Contract.findById(req.params.id)
      .populate("client", "name companyName avatar country")
      .populate("freelancer", "name avatar level avgRating")
      .populate("gig", "title images packages");

    if (!contract) return res.status(404).json({ success: false, message: "Contract not found." });

    const isParty = [contract.client._id.toString(), contract.freelancer._id.toString()].includes(req.user._id.toString());
    if (!isParty && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Not authorized." });
    }

    res.json({ success: true, contract });
  } catch (error) {
    next(error);
  }
};

// ─── Deliver contract (freelancer) ────────────────────────────────────────────
exports.deliverContract = async (req, res, next) => {
  try {
    const contract = await Contract.findOne({ _id: req.params.id, freelancer: req.user._id, status: "active" });
    if (!contract) return res.status(404).json({ success: false, message: "Contract not found or not active." });

    const deliverables = req.files ? req.files.map((f) => f.path) : [];

    contract.status = "delivered";
    contract.deliveredAt = new Date();
    if (deliverables.length) contract.deliverables = [...contract.deliverables, ...deliverables];
    await contract.save();

    await Notification.create({
      recipient: contract.client,
      type: "contract_delivered",
      title: "Work Delivered",
      body: `Your contract "${contract.title}" has been delivered. Please review and approve.`,
      link: `/contracts/${contract._id}`,
      relatedContract: contract._id,
    });

    res.json({ success: true, message: "Contract delivered.", contract });
  } catch (error) {
    next(error);
  }
};

// ─── Accept delivery (client) ─────────────────────────────────────────────────
exports.acceptDelivery = async (req, res, next) => {
  try {
    const contract = await Contract.findOne({ _id: req.params.id, client: req.user._id, status: "delivered" });
    if (!contract) return res.status(404).json({ success: false, message: "Contract not found or not delivered." });

    contract.status = "completed";
    contract.completedAt = new Date();
    contract.paymentStatus = "released";
    await contract.save();

    // Update freelancer stats
    await User.findByIdAndUpdate(contract.freelancer, {
      $inc: { completedOrders: 1, totalEarnings: contract.freelancerEarnings },
    });

    await Notification.create({
      recipient: contract.freelancer,
      type: "contract_completed",
      title: "Contract Completed!",
      body: `"${contract.title}" has been completed. Earnings released to your wallet.`,
      link: `/contracts/${contract._id}`,
      relatedContract: contract._id,
    });

    res.json({ success: true, message: "Delivery accepted. Contract completed.", contract });
  } catch (error) {
    next(error);
  }
};

// ─── Request revision (client) ────────────────────────────────────────────────
exports.requestRevision = async (req, res, next) => {
  try {
    const contract = await Contract.findOne({ _id: req.params.id, client: req.user._id, status: "delivered" });
    if (!contract) return res.status(404).json({ success: false, message: "Contract not found." });

    if (contract.revisionCount >= contract.maxRevisions) {
      return res.status(400).json({ success: false, message: "Maximum revisions reached." });
    }

    contract.status = "revision_requested";
    contract.revisionCount += 1;
    await contract.save();

    await Notification.create({
      recipient: contract.freelancer,
      type: "contract_delivered",
      title: "Revision Requested",
      body: `Client requested a revision for "${contract.title}". Reason: ${req.body.reason || "No reason provided."}`,
      link: `/contracts/${contract._id}`,
      relatedContract: contract._id,
    });

    res.json({ success: true, message: "Revision requested.", contract });
  } catch (error) {
    next(error);
  }
};

// ─── Cancel contract ──────────────────────────────────────────────────────────
exports.cancelContract = async (req, res, next) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ success: false, message: "Contract not found." });

    const isParty = [contract.client.toString(), contract.freelancer.toString()].includes(req.user._id.toString());
    if (!isParty) return res.status(403).json({ success: false, message: "Not authorized." });

    if (["completed", "cancelled"].includes(contract.status)) {
      return res.status(400).json({ success: false, message: "Cannot cancel a completed or already cancelled contract." });
    }

    contract.status = "cancelled";
    contract.cancellationReason = req.body.reason || "";
    contract.paymentStatus = "refunded";
    await contract.save();

    res.json({ success: true, message: "Contract cancelled.", contract });
  } catch (error) {
    next(error);
  }
};
