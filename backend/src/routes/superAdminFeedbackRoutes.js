const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const feedbackController = require("../controllers/feedbackController");
const {
  adminListFeedbackValidators,
  adminUpdateFeedbackValidators,
  feedbackIdParam,
} = require("../validators/feedbackValidators");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");

const router = express.Router();

/** Super Admin only — manage all Problems & Suggestions submissions. */
const guard = [requireAuth, requireSuperAdmin];

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
