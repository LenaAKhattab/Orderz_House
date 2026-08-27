const express = require("express");
const { requireAuth, requireAdmin, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const feedbackController = require("../controllers/feedbackController");
const feedbackTopicsController = require("../controllers/feedbackTopicsController");
const feedbackCategoriesController = require("../controllers/feedbackCategoriesController");
const {
  adminListFeedbackValidators,
  adminUpdateFeedbackValidators,
  adminListTopicsValidators,
  adminCreateTopicValidators,
  adminUpdateTopicValidators,
  adminReorderTopicsValidators,
  adminCreateCategoryValidators,
  adminUpdateCategoryValidators,
  adminReorderCategoriesValidators,
  topicIdParam,
  categoryIdParam,
  feedbackIdParam,
} = require("../validators/feedbackValidators");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");

const router = express.Router();

/** Review inbox actions — Flutter Super Admin parity for Web Admin. */
const actionGuard = [requireAuth, requireAdmin];
/** Topic/category catalog management remains super_admin-only. */
const configGuard = [requireAuth, requireSuperAdmin];

router.get(
  "/feedback/categories",
  ...actionGuard,
  feedbackCategoriesController.adminListCategories,
);

router.post(
  "/feedback/categories",
  ...configGuard,
  adminWriteLimiter,
  adminCreateCategoryValidators,
  validateRequest,
  feedbackCategoriesController.adminCreateCategory,
);

router.patch(
  "/feedback/categories/reorder",
  ...configGuard,
  adminWriteLimiter,
  adminReorderCategoriesValidators,
  validateRequest,
  feedbackCategoriesController.adminReorderCategories,
);

router.patch(
  "/feedback/categories/:id",
  ...configGuard,
  adminWriteLimiter,
  adminUpdateCategoryValidators,
  validateRequest,
  feedbackCategoriesController.adminUpdateCategory,
);

router.delete(
  "/feedback/categories/:id",
  ...configGuard,
  adminWriteLimiter,
  categoryIdParam,
  validateRequest,
  feedbackCategoriesController.adminDeleteCategory,
);

router.get(
  "/feedback/topics",
  ...actionGuard,
  adminListTopicsValidators,
  validateRequest,
  feedbackTopicsController.adminListTopics,
);

router.post(
  "/feedback/topics",
  ...configGuard,
  adminWriteLimiter,
  adminCreateTopicValidators,
  validateRequest,
  feedbackTopicsController.adminCreateTopic,
);

router.patch(
  "/feedback/topics/reorder",
  ...configGuard,
  adminWriteLimiter,
  adminReorderTopicsValidators,
  validateRequest,
  feedbackTopicsController.adminReorderTopics,
);

router.patch(
  "/feedback/topics/:id",
  ...configGuard,
  adminWriteLimiter,
  adminUpdateTopicValidators,
  validateRequest,
  feedbackTopicsController.adminUpdateTopic,
);

router.delete(
  "/feedback/topics/:id",
  ...configGuard,
  adminWriteLimiter,
  topicIdParam,
  validateRequest,
  feedbackTopicsController.adminDeleteTopic,
);

router.get(
  "/feedback",
  ...actionGuard,
  adminListFeedbackValidators,
  validateRequest,
  feedbackController.adminListFeedback,
);

router.get(
  "/feedback/:id",
  ...actionGuard,
  feedbackIdParam,
  validateRequest,
  feedbackController.adminGetFeedback,
);

router.patch(
  "/feedback/:id",
  ...actionGuard,
  adminWriteLimiter,
  adminUpdateFeedbackValidators,
  validateRequest,
  feedbackController.adminUpdateFeedback,
);

module.exports = router;
