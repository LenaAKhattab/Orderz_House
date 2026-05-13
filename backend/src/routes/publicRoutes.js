const express = require("express");
const validateRequest = require("../middleware/validateRequest");
const publicHomeStatsController = require("../controllers/publicHomeStatsController");
const publicAdsController = require("../controllers/publicAdsController");
const {
  publicListAdsValidators,
  publicAdEventValidators,
} = require("../validators/adsValidators");

const router = express.Router();

router.get("/public/home-stats", publicHomeStatsController.getPublicHomeStats);

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
