const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const rateLimitExemptionsController = require("../controllers/rateLimitExemptionsController");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");

const router = express.Router();

/** Super Admin only — never assignable to regular admin. */
const guard = [requireAuth, requireSuperAdmin];

router.get("/rate-limit-exemptions", ...guard, rateLimitExemptionsController.listExemptions);
router.get("/rate-limit-exemptions/users", ...guard, rateLimitExemptionsController.searchUsers);
router.post(
  "/rate-limit-exemptions",
  ...guard,
  adminWriteLimiter,
  rateLimitExemptionsController.createExemption,
);
router.patch(
  "/rate-limit-exemptions/:id",
  ...guard,
  adminWriteLimiter,
  rateLimitExemptionsController.updateExemption,
);
router.post(
  "/rate-limit-exemptions/:id/revoke",
  ...guard,
  adminWriteLimiter,
  rateLimitExemptionsController.revokeExemption,
);

module.exports = router;
