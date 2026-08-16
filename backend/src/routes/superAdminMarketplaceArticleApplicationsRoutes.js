const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const controller = require("../controllers/marketplaceArticleApplicationsController");
const {
  articleIdParam,
  applicationIdParam,
  listApplicationsValidators,
} = require("../validators/marketplaceArticleApplicationsValidators");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

router.get(
  "/marketplace-articles/:id/applications",
  ...guard,
  articleIdParam,
  listApplicationsValidators,
  validateRequest,
  controller.listForArticleAdmin,
);

router.get(
  "/marketplace-articles/:id/fair-ranking",
  ...guard,
  articleIdParam,
  validateRequest,
  controller.getFairRanking,
);

router.get(
  "/article-applications/:applicationId",
  ...guard,
  applicationIdParam,
  validateRequest,
  controller.getApplicationAdmin,
);

router.post(
  "/article-applications/:applicationId/select",
  ...guard,
  applicationIdParam,
  validateRequest,
  controller.select,
);

router.post(
  "/article-applications/:applicationId/reject",
  ...guard,
  applicationIdParam,
  validateRequest,
  controller.reject,
);

router.post(
  "/article-applications/:applicationId/finalize-approval",
  ...guard,
  applicationIdParam,
  validateRequest,
  controller.finalizeApproval,
);

module.exports = router;
