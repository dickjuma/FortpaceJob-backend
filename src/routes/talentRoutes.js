const express = require("express");
const controller = require("../controllers/talentController");

const router = express.Router();

router.get("/", controller.searchTalents);
router.get("/:id", controller.getTalentProfile);

module.exports = router;
