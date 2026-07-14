const express = require("express");
const rateLimit = require("express-rate-limit");
const { rateLimitJsonHandler } = require("../middleware/rateLimitHelpers");
const translationController = require("../controllers/translationController");

const router = express.Router();

const translateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.TRANSLATION_RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJsonHandler("public_read", "تم تجاوز حد الترجمة، حاول لاحقاً"),
});

router.post("/translate", translateLimiter, translationController.translateOne);
router.post("/translate/batch", translateLimiter, translationController.translateMany);

module.exports = router;
