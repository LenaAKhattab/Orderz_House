const express = require("express");
const publicPlansContentController = require("../controllers/publicPlansContentController");

const router = express.Router();

/** Public/read-safe: hero copy + initial Training/Work section for `/plans`. */
router.get("/public-plans-content", publicPlansContentController.getPublic);

module.exports = router;
