const express = require("express");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const adminAdsController = require("../controllers/adminAdsController");
const { uploadAdminAdImage } = require("../middleware/adminAdImageUploadMiddleware");
const {
  createAdValidatorsWithNote,
  updateAdValidatorsWithNote,
  reorderAdsValidators,
  deleteAdValidators,
  duplicateAdValidatorsWithNote,
  adIdParam,
} = require("../validators/adsValidators");
const popupAdsController = require("../controllers/popupAdsController");
const { popupAdBodyValidators, popupAdIdParam } = require("../validators/popupAdsValidators");

const router = express.Router();

// Scope guards to /ads routes only — avoid blocking other /api/admin/* routers mounted on the same prefix.
const adsGuard = [requireAuth, requireAnyRole(["admin", "super_admin"]), requirePermission("dashboard.admin.ads")];

router.get("/ads", ...adsGuard, adminAdsController.listAds);
router.post("/ads/upload-image", ...adsGuard, uploadAdminAdImage.single("image"), adminAdsController.uploadAdImage);
router.post("/ads", ...adsGuard, createAdValidatorsWithNote, validateRequest, adminAdsController.createAd);
router.patch("/ads/reorder", ...adsGuard, reorderAdsValidators, validateRequest, adminAdsController.reorderAds);
router.get("/ads/:id", ...adsGuard, adIdParam, validateRequest, adminAdsController.getAd);
router.patch("/ads/:id", ...adsGuard, updateAdValidatorsWithNote, validateRequest, adminAdsController.updateAd);
router.delete("/ads/:id", ...adsGuard, deleteAdValidators, validateRequest, adminAdsController.deleteAd);
router.post("/ads/:id/duplicate", ...adsGuard, duplicateAdValidatorsWithNote, validateRequest, adminAdsController.duplicateAd);

router.get("/popup-ads", ...adsGuard, popupAdsController.listAds);
router.post("/popup-ads", ...adsGuard, popupAdBodyValidators, validateRequest, popupAdsController.createAd);
router.patch(
  "/popup-ads/:id",
  ...adsGuard,
  popupAdIdParam,
  popupAdBodyValidators,
  validateRequest,
  popupAdsController.updateAd,
);
router.delete("/popup-ads/:id", ...adsGuard, popupAdIdParam, validateRequest, popupAdsController.deleteAd);

module.exports = router;
