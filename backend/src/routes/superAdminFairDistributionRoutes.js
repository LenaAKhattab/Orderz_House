const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const ctrl = require("../controllers/marketplaceFairDistributionController");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

/** Super Admin explainability only — never Freelancer-facing. */
router.get(
  "/fair-distribution/orders/:orderId/decision",
  ...guard,
  ctrl.getDecisionByOrderId,
);

module.exports = router;
