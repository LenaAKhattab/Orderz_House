const express = require("express");
const { requireAuth, requireFreelancer } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const controller = require("../controllers/marketplaceArticleApplicationsController");
const {
  articleIdParam,
  applicationIdParam,
  submitArticleApplicationValidators,
  editArticleApplicationValidators,
  submitFinalArticleManuscriptValidators,
  listApplicationsValidators,
} = require("../validators/marketplaceArticleApplicationsValidators");

const router = express.Router();
const guard = [requireAuth, requireFreelancer];

router.get(
  "/article-applications",
  ...guard,
  listApplicationsValidators,
  validateRequest,
  controller.listMine,
);

router.get(
  "/marketplace-articles/:id/application",
  ...guard,
  articleIdParam,
  validateRequest,
  controller.getMineForArticle,
);

router.post(
  "/marketplace-articles/:id/applications",
  ...guard,
  submitArticleApplicationValidators,
  validateRequest,
  controller.submit,
);

router.patch(
  "/article-applications/:applicationId",
  ...guard,
  editArticleApplicationValidators,
  validateRequest,
  controller.edit,
);

router.post(
  "/article-applications/:applicationId/withdraw",
  ...guard,
  applicationIdParam,
  validateRequest,
  controller.withdraw,
);

router.post(
  "/article-applications/:applicationId/final-manuscript",
  ...guard,
  submitFinalArticleManuscriptValidators,
  validateRequest,
  controller.submitFinalManuscript,
);

module.exports = router;
