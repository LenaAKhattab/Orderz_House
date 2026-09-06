const express = require("express");
const marketplaceArticlesController = require("../controllers/marketplaceArticlesController");
const oz02Controller = require("../controllers/marketplaceArticleBildazoOz02Controller");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireAdmin, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const {
  articleIdParam,
  createMarketplaceArticleValidators,
  updateMarketplaceArticleValidators,
  listMarketplaceArticlesValidators,
} = require("../validators/marketplaceArticlesValidators");

const router = express.Router();
/** Review/list/update marketplace articles — admin + super_admin. */
const guard = [requireAuth, requireAdmin];
const superGuard = [requireAuth, requireSuperAdmin];

router.get(
  "/marketplace-articles/bildazo-categories",
  ...guard,
  oz02Controller.listBildazoCategories,
);

router.get(
  "/marketplace-articles/package-requirements",
  ...guard,
  oz02Controller.listPackageRequirements,
);

router.put(
  "/marketplace-articles/package-requirements",
  ...superGuard,
  oz02Controller.updatePackageRequirements,
);

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

router.post(
  "/marketplace-articles/release-batch",
  ...superGuard,
  marketplaceArticlesController.releaseDraftInventoryBatch,
);

router.post(
  "/marketplace-articles/:id/release",
  ...superGuard,
  articleIdParam,
  validateRequest,
  marketplaceArticlesController.releaseDraftInventory,
);

router.patch(
  "/marketplace-articles/:id",
  ...guard,
  articleIdParam,
  updateMarketplaceArticleValidators,
  validateRequest,
  marketplaceArticlesController.update,
);

router.post(
  "/marketplace-articles/:id/relist-bid-collection",
  ...guard,
  articleIdParam,
  validateRequest,
  marketplaceArticlesController.relistBidCollection,
);

module.exports = router;
