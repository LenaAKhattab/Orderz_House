const express = require("express");
const marketplaceArticlesController = require("../controllers/marketplaceArticlesController");
const validateRequest = require("../middleware/validateRequest");
const {
  articleIdParam,
  listMarketplaceArticlesValidators,
} = require("../validators/marketplaceArticlesValidators");

const router = express.Router();

/** Read-only published Articles foundation (A2). No apply/Token charge. */
router.get(
  "/marketplace-articles",
  listMarketplaceArticlesValidators,
  validateRequest,
  marketplaceArticlesController.listPublished,
);

router.get(
  "/marketplace-articles/:id",
  articleIdParam,
  validateRequest,
  marketplaceArticlesController.getPublishedById,
);

module.exports = router;
