const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/auth");
const {
  getConversations,
  getMessages,
  sendMessage,
  getOrCreateConversation,
} = require("../controllers/messageController");

// All message routes are protected
router.use(protect);

router.route("/")
  .get(getConversations)
  .post(sendMessage);

router.post("/get-or-create", getOrCreateConversation);
router.get("/:conversationId", getMessages);

module.exports = router;