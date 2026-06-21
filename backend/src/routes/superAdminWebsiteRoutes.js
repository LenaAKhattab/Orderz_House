const express = require("express");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");
const { uploadWebsiteContentImage } = require("../middleware/websiteContentImageUploadMiddleware");
const superAdminWebsiteFaqController = require("../controllers/superAdminWebsiteFaqController");
const superAdminWebsitePageController = require("../controllers/superAdminWebsitePageController");
const superAdminSitePageController = require("../controllers/superAdminSitePageController");
const {
  faqIdParam,
  createFaqValidators,
  updateFaqValidators,
  reorderFaqValidators,
} = require("../validators/websiteFaqValidators");
const {
  pageSlugParam,
  blockIdParam,
  updatePageValidators,
  createBlockValidators,
  updateBlockValidators,
  reorderBlocksValidators,
} = require("../validators/websitePageValidators");
const {
  sitePageIdParam,
  updateSitePageValidators,
} = require("../validators/publicSitePageValidators");

const router = express.Router();

const editWebsiteGuard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requirePermission(PERMISSION_KEYS.EDIT_WEBSITE),
];

router.get("/website/faq", ...editWebsiteGuard, superAdminWebsiteFaqController.listFaqItems);
router.post("/website/faq", ...editWebsiteGuard, createFaqValidators, validateRequest, superAdminWebsiteFaqController.createFaqItem);
router.patch(
  "/website/faq/reorder",
  ...editWebsiteGuard,
  reorderFaqValidators,
  validateRequest,
  superAdminWebsiteFaqController.reorderFaqItems,
);
router.patch(
  "/website/faq/:id",
  ...editWebsiteGuard,
  updateFaqValidators,
  validateRequest,
  superAdminWebsiteFaqController.updateFaqItem,
);
router.delete("/website/faq/:id", ...editWebsiteGuard, faqIdParam, validateRequest, superAdminWebsiteFaqController.deleteFaqItem);

router.post(
  "/website/upload-image",
  ...editWebsiteGuard,
  uploadWebsiteContentImage.single("image"),
  superAdminWebsitePageController.uploadImage,
);

router.get("/website/pages", ...editWebsiteGuard, superAdminWebsitePageController.listPages);
router.get("/website/pages/:slug", ...editWebsiteGuard, pageSlugParam, validateRequest, superAdminWebsitePageController.getPage);
router.patch(
  "/website/pages/:slug",
  ...editWebsiteGuard,
  updatePageValidators,
  validateRequest,
  superAdminWebsitePageController.updatePage,
);
router.post(
  "/website/pages/:slug/blocks",
  ...editWebsiteGuard,
  createBlockValidators,
  validateRequest,
  superAdminWebsitePageController.createBlock,
);
router.patch(
  "/website/pages/:slug/blocks/reorder",
  ...editWebsiteGuard,
  reorderBlocksValidators,
  validateRequest,
  superAdminWebsitePageController.reorderBlocks,
);
router.patch(
  "/website/pages/:slug/blocks/:blockId",
  ...editWebsiteGuard,
  updateBlockValidators,
  validateRequest,
  superAdminWebsitePageController.updateBlock,
);
router.delete(
  "/website/pages/:slug/blocks/:blockId",
  ...editWebsiteGuard,
  [...pageSlugParam, ...blockIdParam],
  validateRequest,
  superAdminWebsitePageController.deleteBlock,
);

router.get("/site-pages", ...editWebsiteGuard, superAdminSitePageController.listSitePages);
router.get("/site-pages/:id", ...editWebsiteGuard, sitePageIdParam, validateRequest, superAdminSitePageController.getSitePage);
router.patch(
  "/site-pages/:id",
  ...editWebsiteGuard,
  updateSitePageValidators,
  validateRequest,
  superAdminSitePageController.updateSitePage,
);

module.exports = router;
