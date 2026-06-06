const express = require("express");
const validateRequest = require("../middleware/validateRequest");
const { optionalAuth } = require("../middleware/rbacMiddleware");
const publicHomeStatsController = require("../controllers/publicHomeStatsController");
const publicPageViewController = require("../controllers/publicPageViewController");
const publicAdsController = require("../controllers/publicAdsController");
const {
  publicListAdsValidators,
  publicAdEventValidators,
} = require("../validators/adsValidators");
const { recordPublicPageViewValidators } = require("../validators/publicPageViewValidators");

const router = express.Router();

router.get("/public/home-stats", publicHomeStatsController.getPublicHomeStats);
router.post(
  "/public/analytics/pageview",
  optionalAuth,
  recordPublicPageViewValidators,
  validateRequest,
  publicPageViewController.recordPageView,
);

router.get("/public/ads", publicListAdsValidators, validateRequest, publicAdsController.listAds);
router.post(
  "/public/ads/:id/impression",
  publicAdEventValidators,
  validateRequest,
  publicAdsController.recordImpression,
);
router.post(
  "/public/ads/:id/click",
  publicAdEventValidators,
  validateRequest,
  publicAdsController.recordClick,
);

module.exports = router;
