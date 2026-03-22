const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/auth");
const {
  createRequest,
  getRequests,
  getRequest,
  getMyRequests,
  updateRequest,
  closeRequest,
} = require("../controllers/buyerRequestController");

// All routes are protected
router.use(protect);

// Public-facing routes for freelancers to find requests
router.get("/", getRequests);
router.get("/:id", getRequest);

// Routes for clients to manage their own requests
router.get("/my/requests", getMyRequests);
router.post("/", createRequest);
router.patch("/:id", updateRequest);
router.delete("/:id", closeRequest);

module.exports = router;