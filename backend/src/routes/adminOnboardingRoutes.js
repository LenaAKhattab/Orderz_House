const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");
const onboardingController = require("../controllers/onboardingController");
const {
  itemIdParam,
  createItemValidators,
  upsertItemValidators,
} = require("../validators/onboardingValidators");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

router.get("/onboarding/items", ...guard, onboardingController.adminList);
router.post(
  "/onboarding/items",
  ...guard,
  adminWriteLimiter,
  createItemValidators,
  validateRequest,
  onboardingController.adminCreate,
);
router.patch(
  "/onboarding/items/:id",
  ...guard,
  adminWriteLimiter,
  itemIdParam,
  upsertItemValidators,
  validateRequest,
  onboardingController.adminUpdate,
);
router.post(
  "/onboarding/items/:id/enable",
  ...guard,
  adminWriteLimiter,
  itemIdParam,
  validateRequest,
  onboardingController.adminEnable,
);
router.post(
  "/onboarding/items/:id/disable",
  ...guard,
  adminWriteLimiter,
  itemIdParam,
  validateRequest,
  onboardingController.adminDisable,
);

module.exports = router;
