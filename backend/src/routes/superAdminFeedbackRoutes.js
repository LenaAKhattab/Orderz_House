const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
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

/** Super Admin only — manage all Problems & Suggestions submissions, categories, and topics. */
const guard = [requireAuth, requireSuperAdmin];

router.get(
  "/feedback/categories",
  ...guard,
  feedbackCategoriesController.adminListCategories,
);

router.post(
  "/feedback/categories",
  ...guard,
  adminWriteLimiter,
  adminCreateCategoryValidators,
  validateRequest,
  feedbackCategoriesController.adminCreateCategory,
);

router.patch(
  "/feedback/categories/reorder",
  ...guard,
  adminWriteLimiter,
  adminReorderCategoriesValidators,
  validateRequest,
  feedbackCategoriesController.adminReorderCategories,
);

router.patch(
  "/feedback/categories/:id",
  ...guard,
  adminWriteLimiter,
  adminUpdateCategoryValidators,
  validateRequest,
  feedbackCategoriesController.adminUpdateCategory,
);

router.delete(
  "/feedback/categories/:id",
  ...guard,
  adminWriteLimiter,
  categoryIdParam,
  validateRequest,
  feedbackCategoriesController.adminDeleteCategory,
);

router.get(
  "/feedback/topics",
  ...guard,
  adminListTopicsValidators,
  validateRequest,
  feedbackTopicsController.adminListTopics,
);

router.post(
  "/feedback/topics",
  ...guard,
  adminWriteLimiter,
  adminCreateTopicValidators,
  validateRequest,
  feedbackTopicsController.adminCreateTopic,
);

router.patch(
  "/feedback/topics/reorder",
  ...guard,
  adminWriteLimiter,
  adminReorderTopicsValidators,
  validateRequest,
  feedbackTopicsController.adminReorderTopics,
);

router.patch(
  "/feedback/topics/:id",
  ...guard,
  adminWriteLimiter,
  adminUpdateTopicValidators,
  validateRequest,
  feedbackTopicsController.adminUpdateTopic,
);

router.delete(
  "/feedback/topics/:id",
  ...guard,
  adminWriteLimiter,
  topicIdParam,
  validateRequest,
  feedbackTopicsController.adminDeleteTopic,
);

router.get(
  "/feedback",
  ...guard,
  adminListFeedbackValidators,
  validateRequest,
  feedbackController.adminListFeedback,
);

router.get(
  "/feedback/:id",
  ...guard,
  feedbackIdParam,
  validateRequest,
  feedbackController.adminGetFeedback,
);

router.patch(
  "/feedback/:id",
  ...guard,
  adminWriteLimiter,
  adminUpdateFeedbackValidators,
  validateRequest,
  feedbackController.adminUpdateFeedback,
);

module.exports = router;
