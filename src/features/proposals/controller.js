const Proposal = require("./model");
const BuyerRequest = require("../buyer-requests/model");
const Notification = require("../../models/Notification");
const { getPagination, paginate } = require("../../utils/helpers");
const { sendProposalNotification } = require("../../utils/email");

// ─── Submit proposal ──────────────────────────────────────────────────────────
exports.submitProposal = async (req, res, next) => {
  try {
    const { buyerRequestId, coverLetter, bidAmount, deliveryDays } = req.body;

    if (!buyerRequestId || !coverLetter || !bidAmount || !deliveryDays) {
      return res.status(400).json({ success: false, message: "buyerRequestId, coverLetter, bidAmount and deliveryDays are required." });
    }

    const request = await BuyerRequest.findById(buyerRequestId).populate("buyer");
    if (!request) return res.status(404).json({ success: false, message: "Buyer request not found." });
    if (request.status !== "open") return res.status(400).json({ success: false, message: "This request is no longer open." });
    if (request.buyer._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: "You cannot submit a proposal to your own request." });
    }

    const attachments = req.files ? req.files.map((f) => f.path) : [];

    const proposal = await Proposal.create({
      freelancer: req.user._id,
      buyerRequest: buyerRequestId,
      coverLetter,
      bidAmount,
      deliveryDays,
      attachments,
    });

    // Update proposal count on request
    await BuyerRequest.findByIdAndUpdate(buyerRequestId, {
      $inc: { proposalCount: 1 },
      $push: { proposals: proposal._id },
    });

    // Notify buyer
    await Notification.create({
      recipient: request.buyer._id,
      type: "new_proposal",
      title: "New Proposal Received",
      body: `${req.user.name || req.user.companyName} submitted a proposal for "${request.title}"`,
      link: `/find-work/requests/manager`,
      relatedProposal: proposal._id,
    });

    sendProposalNotification(request.buyer, req.user, request).catch(() => {});

    res.status(201).json({ success: true, message: "Proposal submitted.", proposal });
  } catch (error) {
    next(error);
  }
};

// ─── Get proposals for a request (buyer) ─────────────────────────────────────
exports.getProposalsForRequest = async (req, res, next) => {
  try {
    const request = await BuyerRequest.findOne({ _id: req.params.requestId, buyer: req.user._id });
    if (!request) return res.status(404).json({ success: false, message: "Request not found." });

    const proposals = await Proposal.find({ buyerRequest: req.params.requestId })
      .populate("freelancer", "name avatar level avgRating totalReviews completedOrders country skills")
      .sort({ createdAt: -1 });

    res.json({ success: true, proposals });
  } catch (error) {
    next(error);
  }
};

// ─── Get my submitted proposals (freelancer) ──────────────────────────────────
exports.getMyProposals = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { freelancer: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [proposals, total] = await Promise.all([
      Proposal.find(filter)
        .populate("buyerRequest", "title budgetMin budgetMax status buyer")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Proposal.countDocuments(filter),
    ]);

    res.json({ success: true, ...paginate(proposals, total, page, limit) });
  } catch (error) {
    next(error);
  }
};

// ─── Update proposal status (buyer: accept/reject/shortlist) ─────────────────
exports.updateProposalStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ["shortlisted", "accepted", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status." });
    }

    const proposal = await Proposal.findById(req.params.id).populate("buyerRequest");
    if (!proposal) return res.status(404).json({ success: false, message: "Proposal not found." });

    // Verify buyer owns the request
    if (proposal.buyerRequest.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized." });
    }

    proposal.status = status;
    await proposal.save();

    // Notify freelancer
    const notifType = status === "accepted" ? "proposal_accepted" : "proposal_rejected";
    await Notification.create({
      recipient: proposal.freelancer,
      type: notifType,
      title: status === "accepted" ? "Proposal Accepted!" : "Proposal Update",
      body: `Your proposal for "${proposal.buyerRequest.title}" was ${status}.`,
      link: `/find-work/requests/manager`,
      relatedProposal: proposal._id,
    });

    res.json({ success: true, message: `Proposal ${status}.`, proposal });
  } catch (error) {
    next(error);
  }
};

// ─── Withdraw proposal (freelancer) ──────────────────────────────────────────
exports.withdrawProposal = async (req, res, next) => {
  try {
    const proposal = await Proposal.findOneAndUpdate(
      { _id: req.params.id, freelancer: req.user._id, status: "pending" },
      { status: "withdrawn" },
      { new: true }
    );
    if (!proposal) return res.status(404).json({ success: false, message: "Proposal not found or cannot be withdrawn." });

    await BuyerRequest.findByIdAndUpdate(proposal.buyerRequest, { $inc: { proposalCount: -1 } });

    res.json({ success: true, message: "Proposal withdrawn.", proposal });
  } catch (error) {
    next(error);
  }
};

