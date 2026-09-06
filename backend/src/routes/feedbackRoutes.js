const express = require("express");
const { requireAuth, requireAnyRole } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const feedbackController = require("../controllers/feedbackController");
const feedbackTopicsController = require("../controllers/feedbackTopicsController");
const feedbackCategoriesController = require("../controllers/feedbackCategoriesController");
const {
  createFeedbackValidators,
  listMyFeedbackValidators,
  listActiveTopicsValidators,
  feedbackIdParam,
} = require("../validators/feedbackValidators");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");

const router = express.Router();

const userGuard = [requireAuth, requireAnyRole(["client", "freelancer"])];

router.get(
  "/feedback/categories",
  ...userGuard,
  feedbackCategoriesController.listActiveCategories,
);

router.get(
  "/feedback/topics",
  ...userGuard,
  listActiveTopicsValidators,
  validateRequest,
  feedbackTopicsController.listActiveTopics,
);

router.post(
  "/feedback",
  ...userGuard,
  adminWriteLimiter,
  createFeedbackValidators,
  validateRequest,
  feedbackController.createFeedback,
);

router.get(
  "/feedback/my",
  ...userGuard,
  listMyFeedbackValidators,
  validateRequest,
  feedbackController.listMyFeedback,
);

router.get(
  "/feedback/my/:id",
  ...userGuard,
  feedbackIdParam,
  validateRequest,
  feedbackController.getMyFeedback,
);

module.exports = router;
