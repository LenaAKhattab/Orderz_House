const express = require("express");
const marketplaceArticlesController = require("../controllers/marketplaceArticlesController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const {
  articleIdParam,
  createMarketplaceArticleValidators,
  updateMarketplaceArticleValidators,
  listMarketplaceArticlesValidators,
} = require("../validators/marketplaceArticlesValidators");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

router.get(
  "/marketplace-articles",
  ...guard,
  listMarketplaceArticlesValidators,
  validateRequest,
  marketplaceArticlesController.listAdmin,
);

router.get(
  "/marketplace-articles/:id",
  ...guard,
  articleIdParam,
  validateRequest,
  marketplaceArticlesController.getAdminById,
);

router.post(
  "/marketplace-articles",
  ...guard,
  createMarketplaceArticleValidators,
  validateRequest,
  marketplaceArticlesController.create,
);

router.patch(
  "/marketplace-articles/:id",
  ...guard,
  updateMarketplaceArticleValidators,
  validateRequest,
  marketplaceArticlesController.update,
);

module.exports = router;
