const express = require("express");
const { requireAuth, requireAnyRole } = require("../middleware/rbacMiddleware");
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

const router = express.Router();

router.use(requireAuth, requireAnyRole(["admin", "super_admin"]));

router.get("/ads", adminAdsController.listAds);
router.post("/ads/upload-image", uploadAdminAdImage.single("image"), adminAdsController.uploadAdImage);
router.post("/ads", createAdValidatorsWithNote, validateRequest, adminAdsController.createAd);
router.patch("/ads/reorder", reorderAdsValidators, validateRequest, adminAdsController.reorderAds);
router.get("/ads/:id", adIdParam, validateRequest, adminAdsController.getAd);
router.patch("/ads/:id", updateAdValidatorsWithNote, validateRequest, adminAdsController.updateAd);
router.delete("/ads/:id", deleteAdValidators, validateRequest, adminAdsController.deleteAd);
router.post("/ads/:id/duplicate", duplicateAdValidatorsWithNote, validateRequest, adminAdsController.duplicateAd);

module.exports = router;
