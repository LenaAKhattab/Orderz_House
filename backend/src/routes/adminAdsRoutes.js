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
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");

const router = express.Router();

// Scope guards to /ads routes only — avoid blocking other /api/admin/* routers mounted on the same prefix.
const adsGuard = [requireAuth, requireAnyRole(["admin", "super_admin"]), requirePermission("dashboard.admin.ads")];

router.get("/ads", ...adsGuard, adminAdsController.listAds);
router.post("/ads/upload-image", ...adsGuard, adminWriteLimiter, uploadAdminAdImage.single("image"), adminAdsController.uploadAdImage);
router.post("/ads", ...adsGuard, adminWriteLimiter, createAdValidatorsWithNote, validateRequest, adminAdsController.createAd);
router.patch("/ads/reorder", ...adsGuard, adminWriteLimiter, reorderAdsValidators, validateRequest, adminAdsController.reorderAds);
router.get("/ads/:id", ...adsGuard, adIdParam, validateRequest, adminAdsController.getAd);
router.patch("/ads/:id", ...adsGuard, adminWriteLimiter, updateAdValidatorsWithNote, validateRequest, adminAdsController.updateAd);
router.delete("/ads/:id", ...adsGuard, adminWriteLimiter, deleteAdValidators, validateRequest, adminAdsController.deleteAd);
router.post("/ads/:id/duplicate", ...adsGuard, adminWriteLimiter, duplicateAdValidatorsWithNote, validateRequest, adminAdsController.duplicateAd);

router.get("/popup-ads", ...adsGuard, popupAdsController.listAds);
router.post("/popup-ads", ...adsGuard, adminWriteLimiter, popupAdBodyValidators, validateRequest, popupAdsController.createAd);
router.patch(
  "/popup-ads/:id",
  ...adsGuard,
  adminWriteLimiter,
  popupAdIdParam,
  popupAdBodyValidators,
  validateRequest,
  popupAdsController.updateAd,
);
router.delete("/popup-ads/:id", ...adsGuard, adminWriteLimiter, popupAdIdParam, validateRequest, popupAdsController.deleteAd);

module.exports = router;
