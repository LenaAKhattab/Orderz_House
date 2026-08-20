const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const controller = require("../controllers/marketplaceArticleApplicationsController");
const {
  articleIdParam,
  applicationIdParam,
  listApplicationsValidators,
  requestArticleRevisionValidators,
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

router.get(
  "/marketplace-articles/:id/auto-assignment",
  ...guard,
  articleIdParam,
  validateRequest,
  controller.getAutoAssignment,
);

router.post(
  "/marketplace-articles/:id/auto-assignment/run",
  ...guard,
  articleIdParam,
  validateRequest,
  controller.runAutoAssignment,
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

router.post(
  "/article-applications/:applicationId/request-revision",
  ...guard,
  requestArticleRevisionValidators,
  validateRequest,
  controller.requestArticleRevision,
);

router.post(
  "/article-applications/:applicationId/bildazo-publish/retry",
  ...guard,
  applicationIdParam,
  validateRequest,
  controller.retryBildazoPublish,
);

router.post(
  "/marketplace-articles/:id/bildazo-publish/retry",
  ...guard,
  articleIdParam,
  validateRequest,
  controller.retryBildazoPublishForArticle,
);

module.exports = router;
