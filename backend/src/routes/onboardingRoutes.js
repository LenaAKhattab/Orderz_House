const express = require("express");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const onboardingController = require("../controllers/onboardingController");
const { postEventValidators } = require("../validators/onboardingValidators");

const router = express.Router();
const guard = [requireAuth, requireRole("freelancer")];

router.get("/onboarding/my-current", ...guard, onboardingController.getMyCurrent);
router.get("/onboarding/getting-started", ...guard, onboardingController.getGettingStarted);
router.post(
  "/onboarding/events",
  ...guard,
  postEventValidators,
  validateRequest,
  onboardingController.postEvent,
);

module.exports = router;
