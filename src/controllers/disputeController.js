/**
 * Dispute Controller for Forte Platform
 * Handles dispute creation, management, and resolution
 */

const Dispute = require("../models/Dispute");
const Contract = require("../models/Contract");
const Notification = require("../models/Notification");
const { escrow } = require("../payments");
const { getPagination, paginate } = require("../utils/helpers");

// ─── Open a Dispute ───────────────────────────────────────────────────────────────
exports.openDispute = async (req, res, next) => {
  try {
    const { contractId, reason, description, attachments } = req.body;

    if (!contractId || !reason || !description) {
      return res.status(400).json({ 
        success: false, 
        message: "contractId, reason, and description are required." 
      });
    }

    const contract = await Contract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ success: false, message: "Contract not found." });
    }

    // Check if user is part of the contract
    const isClient = contract.client.toString() === req.user._id.toString();
    const isFreelancer = contract.freelancer.toString() === req.user._id.toString();
    
    if (!isClient && !isFreelancer) {
      return res.status(403).json({ success: false, message: "Not authorized." });
    }

    // Check for existing dispute
    const existingDispute = await Dispute.findOne({
      contract: contractId,
      status: { $nin: ["resolved", "closed"] },
    });

    if (existingDispute) {
      return res.status(400).json({ 
        success: false, 
        message: "An active dispute already exists for this contract." 
      });
    }

    // Determine who the dispute is against
    const against = isClient ? contract.freelancer : contract.client;

    const dispute = await Dispute.create({
      contract: contractId,
      openedBy: req.user._id,
      against,
      reason,
      description,
      attachments: attachments || [],
    });

    // Update contract status
    contract.status = "disputed";
    contract.disputeReason = description;
    await contract.save();

    // Notify the other party
    await Notification.create({
      recipient: against,
      type: "dispute_opened",
      title: "Dispute Opened",
      body: `A dispute has been opened for contract "${contract.title}".`,
      link: `/disputes/${dispute._id}`,
      relatedContract: contractId,
    });

    res.status(201).json({
      success: true,
      message: "Dispute opened successfully.",
      dispute,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get My Disputes ─────────────────────────────────────────────────────────────
exports.getMyDisputes = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { status } = req.query;

    const filter = {
      $or: [{ openedBy: req.user._id }, { against: req.user._id }],
    };

    if (status) {
      filter.status = status;
    }

    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .populate("contract", "title totalAmount status")
        .populate("openedBy", "name avatar")
        .populate("against", "name avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Dispute.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(disputes, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Get Single Dispute ─────────────────────────────────────────────────────────
exports.getDispute = async (req, res, next) => {
  try {
    const dispute = await Dispute.findById(req.params.id)
      .populate("contract")
      .populate("openedBy", "name avatar email")
      .populate("against", "name avatar email")
      .populate("messages.sender", "name avatar")
      .populate("resolvedBy", "name");

    if (!dispute) {
      return res.status(404).json({ success: false, message: "Dispute not found." });
    }

    // Check authorization
    const isParty = 
      dispute.openedBy._id.toString() === req.user._id.toString() ||
      dispute.against._id.toString() === req.user._id.toString() ||
      req.user.role === "admin";

    if (!isParty) {
      return res.status(403).json({ success: false, message: "Not authorized." });
    }

    res.json({ success: true, dispute });
  } catch (error) {
    next(error);
  }
};

// ─── Add Message to Dispute ────────────────────────────────────────────────────
exports.addMessage = async (req, res, next) => {
  try {
    const { message, attachments } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: "Message is required." });
    }

    const dispute = await Dispute.findById(req.params.id);

    if (!dispute) {
      return res.status(404).json({ success: false, message: "Dispute not found." });
    }

    // Check if user is part of the dispute
    const isParty = 
      dispute.openedBy.toString() === req.user._id.toString() ||
      dispute.against.toString() === req.user._id.toString();

    if (!isParty && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Not authorized." });
    }

    if (["resolved", "closed"].includes(dispute.status)) {
      return res.status(400).json({ success: false, message: "Dispute is already resolved." });
    }

    // Add message
    dispute.messages.push({
      sender: req.user._id,
      message,
      attachments: attachments || [],
    });

    dispute.lastActivityAt = new Date();
    dispute.status = "awaiting_response";
    await dispute.save();

    // Notify the other party
    const recipient = dispute.openedBy.toString() === req.user._id.toString()
      ? dispute.against
      : dispute.openedBy;

    await Notification.create({
      recipient,
      type: "dispute_message",
      title: "New Dispute Message",
      body: `New message in dispute for "${dispute.contract.title}".`,
      link: `/disputes/${dispute._id}`,
      relatedContract: dispute.contract,
    });

    res.json({ success: true, message: "Message added.", dispute });
  } catch (error) {
    next(error);
  }
};

// ─── Resolve Dispute (Admin) ────────────────────────────────────────────────────
exports.resolveDispute = async (req, res, next) => {
  try {
    const { resolution, resolutionAmount, resolutionNotes } = req.body;

    if (!resolution) {
      return res.status(400).json({ success: false, message: "Resolution is required." });
    }

    const dispute = await Dispute.findById(req.params.id);

    if (!dispute) {
      return res.status(404).json({ success: false, message: "Dispute not found." });
    }

    if (dispute.status === "resolved" || dispute.status === "closed") {
      return res.status(400).json({ success: false, message: "Dispute already resolved." });
    }

    // Update dispute
    dispute.status = "resolved";
    dispute.resolution = resolution;
    dispute.resolutionAmount = resolutionAmount;
    dispute.resolutionNotes = resolutionNotes;
    dispute.resolvedBy = req.user._id;
    dispute.resolvedAt = new Date();
    await dispute.save();

    // Update contract
    const contract = await Contract.findById(dispute.contract);
    if (contract) {
      contract.status = resolution === "mutual_cancellation" ? "cancelled" : "completed";
      
      // Handle payment based on resolution
      if (resolution === "client_wins" || resolution === "partial_refund") {
        // Refund to client
        await escrow.refundEscrow(
          contract._id,
          `Dispute resolved: ${resolution}`,
          req.user._id
        );
        
        if (resolution === "partial_refund" && resolutionAmount) {
          // Client gets partial refund, freelancer gets remainder
          contract.paymentStatus = "released";
        }
      } else if (resolution === "freelancer_wins") {
        // Release to freelancer
        await escrow.releaseEscrow(contract._id, req.user._id);
      }

      await contract.save();
    }

    // Notify both parties
    await Notification.create({
      recipient: dispute.openedBy,
      type: "dispute_resolved",
      title: "Dispute Resolved",
      body: `Your dispute has been resolved. Resolution: ${resolution}.`,
      link: `/disputes/${dispute._id}`,
      relatedContract: dispute.contract,
    });

    await Notification.create({
      recipient: dispute.against,
      type: "dispute_resolved",
      title: "Dispute Resolved",
      body: `Dispute has been resolved. Resolution: ${resolution}.`,
      link: `/disputes/${dispute._id}`,
      relatedContract: dispute.contract,
    });

    res.json({ success: true, message: "Dispute resolved.", dispute });
  } catch (error) {
    next(error);
  }
};

// ─── Get All Disputes (Admin) ───────────────────────────────────────────────────
exports.getAllDisputes = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { status, reason } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (reason) filter.reason = reason;

    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .populate("contract", "title totalAmount")
        .populate("openedBy", "name avatar")
        .populate("against", "name avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Dispute.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(disputes, total, page, limit) });
  } catch (error) {
    next(error);
  }
};
