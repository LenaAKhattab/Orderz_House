const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");
const controller = require("../controllers/bildazoAuthorLinkAdminController");
const integrationController = require("../controllers/superAdminFreelancerBildazoIntegrationController");
const {
  listBildazoAuthorLinkValidators,
  manualLinkValidators,
  updateStatusValidators,
} = require("../validators/bildazoAuthorLinkAdminValidators");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

router.get(
  "/freelancers/:freelancerUserId/bildazo-integration",
  ...guard,
  integrationController.getSummary,
);

router.get(
  "/bildazo-author-links",
  ...guard,
  listBildazoAuthorLinkValidators,
  validateRequest,
  controller.list,
);

router.patch(
  "/bildazo-author-links/:id/manual-link",
  ...guard,
  adminWriteLimiter,
  manualLinkValidators,
  validateRequest,
  controller.manualLink,
);

router.patch(
  "/bildazo-author-links/:id/status",
  ...guard,
  adminWriteLimiter,
  updateStatusValidators,
  validateRequest,
  controller.updateStatus,
);

module.exports = router;
