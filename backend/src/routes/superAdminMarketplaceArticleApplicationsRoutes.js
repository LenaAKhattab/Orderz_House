const express = require("express");
const { requireAuth, requireAdmin, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const controller = require("../controllers/marketplaceArticleApplicationsController");
const oz02Controller = require("../controllers/marketplaceArticleBildazoOz02Controller");
const {
  articleIdParam,
  applicationIdParam,
  listApplicationsValidators,
  requestArticleRevisionValidators,
} = require("../validators/marketplaceArticleApplicationsValidators");

const router = express.Router();
/** Article application review actions — admin + super_admin. */
const guard = [requireAuth, requireAdmin];
/** Bildazo publish retries stay super_admin-only. */
const bildazoGuard = [requireAuth, requireSuperAdmin];

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
  "/article-applications/:applicationId/bildazo-publish-preview",
  ...guard,
  applicationIdParam,
  validateRequest,
  oz02Controller.getBildazoPublishPreview,
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
  ...bildazoGuard,
  applicationIdParam,
  validateRequest,
  controller.retryBildazoPublish,
);

router.post(
  "/marketplace-articles/:id/bildazo-publish/retry",
  ...bildazoGuard,
  articleIdParam,
  validateRequest,
  controller.retryBildazoPublishForArticle,
);

module.exports = router;
