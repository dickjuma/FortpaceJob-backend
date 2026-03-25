const express = require("express");
const router = express.Router();
const { protect } = require("../../middlewares/auth");
const { uploadMemory } = require("../../middlewares/upload");
const {
  getOrCreateConversation,
  getConversations,
  getMessages,
  sendMessage,
  deleteMessage,
} = require("./controller");

router.post("/conversations", protect, getOrCreateConversation);
router.get("/conversations", protect, getConversations);
router.get("/conversations/:conversationId", protect, getMessages);
router.post("/", protect, uploadMemory.array("attachments", 5), sendMessage);
router.delete("/:id", protect, deleteMessage);

module.exports = router;

