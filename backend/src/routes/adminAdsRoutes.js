const express = require("express");
const { requireAuth, requireAnyRole } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const adminAdsController = require("../controllers/adminAdsController");
const {
  createAdValidators,
  updateAdValidators,
  reorderAdsValidators,
  duplicateAdValidators,
  adIdParam,
} = require("../validators/adsValidators");

const router = express.Router();

router.use(requireAuth, requireAnyRole(["admin", "super_admin"]));

router.get("/ads", adminAdsController.listAds);
router.post("/ads", createAdValidators, validateRequest, adminAdsController.createAd);
router.patch("/ads/reorder", reorderAdsValidators, validateRequest, adminAdsController.reorderAds);
router.get("/ads/:id", adIdParam, validateRequest, adminAdsController.getAd);
router.patch("/ads/:id", updateAdValidators, validateRequest, adminAdsController.updateAd);
router.delete("/ads/:id", adIdParam, validateRequest, adminAdsController.deleteAd);
router.post("/ads/:id/duplicate", duplicateAdValidators, validateRequest, adminAdsController.duplicateAd);

module.exports = router;
