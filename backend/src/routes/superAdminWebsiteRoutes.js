const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { uploadWebsiteContentImage } = require("../middleware/websiteContentImageUploadMiddleware");
const superAdminWebsiteFaqController = require("../controllers/superAdminWebsiteFaqController");
const superAdminWebsitePageController = require("../controllers/superAdminWebsitePageController");
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

const router = express.Router();

router.use(requireAuth, requireSuperAdmin);

router.get("/website/faq", superAdminWebsiteFaqController.listFaqItems);
router.post("/website/faq", createFaqValidators, validateRequest, superAdminWebsiteFaqController.createFaqItem);
router.patch(
  "/website/faq/reorder",
  reorderFaqValidators,
  validateRequest,
  superAdminWebsiteFaqController.reorderFaqItems,
);
router.patch(
  "/website/faq/:id",
  updateFaqValidators,
  validateRequest,
  superAdminWebsiteFaqController.updateFaqItem,
);
router.delete("/website/faq/:id", faqIdParam, validateRequest, superAdminWebsiteFaqController.deleteFaqItem);

router.post(
  "/website/upload-image",
  uploadWebsiteContentImage.single("image"),
  superAdminWebsitePageController.uploadImage,
);

router.get("/website/pages", superAdminWebsitePageController.listPages);
router.get("/website/pages/:slug", pageSlugParam, validateRequest, superAdminWebsitePageController.getPage);
router.patch(
  "/website/pages/:slug",
  updatePageValidators,
  validateRequest,
  superAdminWebsitePageController.updatePage,
);
router.post(
  "/website/pages/:slug/blocks",
  createBlockValidators,
  validateRequest,
  superAdminWebsitePageController.createBlock,
);
router.patch(
  "/website/pages/:slug/blocks/reorder",
  reorderBlocksValidators,
  validateRequest,
  superAdminWebsitePageController.reorderBlocks,
);
router.patch(
  "/website/pages/:slug/blocks/:blockId",
  updateBlockValidators,
  validateRequest,
  superAdminWebsitePageController.updateBlock,
);
router.delete(
  "/website/pages/:slug/blocks/:blockId",
  [...pageSlugParam, ...blockIdParam],
  validateRequest,
  superAdminWebsitePageController.deleteBlock,
);

module.exports = router;
