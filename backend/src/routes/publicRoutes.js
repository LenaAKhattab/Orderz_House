const express = require("express");
const validateRequest = require("../middleware/validateRequest");
const { optionalAuth } = require("../middleware/rbacMiddleware");
const publicHomeStatsController = require("../controllers/publicHomeStatsController");
const publicPageViewController = require("../controllers/publicPageViewController");
const publicFaqController = require("../controllers/publicFaqController");
const publicWebsitePageController = require("../controllers/publicWebsitePageController");
const publicSitePageController = require("../controllers/publicSitePageController");
const publicAdsController = require("../controllers/publicAdsController");
const {
  publicListAdsValidators,
  publicAdEventValidators,
} = require("../validators/adsValidators");
const { recordPublicPageViewValidators } = require("../validators/publicPageViewValidators");
const { sitePageSlugParam } = require("../validators/publicSitePageValidators");

const router = express.Router();

router.get("/public/home-stats", publicHomeStatsController.getPublicHomeStats);
router.get("/public/faq", publicFaqController.listPublicFaq);
router.get("/public/site-pages", publicSitePageController.listPublicSitePages);
router.get(
  "/public/site-pages/:slug",
  sitePageSlugParam,
  validateRequest,
  publicSitePageController.getPublicSitePage,
);
router.get("/public/pages/:slug", publicWebsitePageController.getPublicPage);
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
