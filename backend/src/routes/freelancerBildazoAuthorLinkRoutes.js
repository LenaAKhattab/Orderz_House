const express = require("express");
const { requireAuth, requireFreelancer } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const controller = require("../controllers/bildazoAuthorLinkController");
const { submitBildazoAuthorLinkValidators } = require("../validators/bildazoAuthorLinkValidators");

const router = express.Router();
const guard = [requireAuth, requireFreelancer];

router.get("/bildazo-author-link/me", ...guard, controller.getMe);
router.post(
  "/bildazo-author-link/request",
  ...guard,
  submitBildazoAuthorLinkValidators,
  validateRequest,
  controller.submitRequest,
);

module.exports = router;
