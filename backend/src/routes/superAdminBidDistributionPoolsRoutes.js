/**
 * Super Admin Bid Distribution Pool routes — Phase D1.
 * Mounted under /api/super-admin with requireSuperAdmin.
 */
const express = require("express");
const { body, param, query } = require("express-validator");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const controller = require("../controllers/marketplaceBidDistributionPoolController");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

router.post(
  "/bid-distribution-pools/preview-calculation",
  ...guard,
  body("budgetJod").exists(),
  body("bidUnitPriceJod").exists(),
  validateRequest,
  controller.previewPoolCalculation,
);

router.get(
  "/bid-distribution-pools",
  ...guard,
  query("limit").optional().isInt({ min: 1, max: 200 }),
  query("offset").optional().isInt({ min: 0 }),
  query("status").optional().isIn(["active", "closed"]),
  validateRequest,
  controller.listPools,
);

router.post(
  "/bid-distribution-pools",
  ...guard,
  body("name").isString().trim().isLength({ min: 1, max: 200 }),
  body("budgetJod").exists(),
  body("bidUnitPriceJod").exists(),
  validateRequest,
  controller.createPool,
);

router.get(
  "/bid-distribution-pools/:poolId",
  ...guard,
  param("poolId").isInt({ min: 1 }),
  validateRequest,
  controller.getPool,
);

router.post(
  "/bid-distribution-pools/:poolId/allocate",
  ...guard,
  param("poolId").isInt({ min: 1 }),
  body("distributionMode").isIn(["manual", "random"]),
  body("bidsPerFreelancer").isInt({ min: 1, max: 1000000 }),
  body("freelancerUserIds").optional().isArray({ min: 1 }),
  body("freelancerUserIds.*").optional().isInt({ min: 1 }),
  body("recipientCount").optional().isInt({ min: 1, max: 10000 }),
  body("expirationMode").isIn(["days", "weeks", "exact_datetime"]),
  body("expirationValue").optional({ nullable: true }).isInt({ min: 1, max: 3650 }),
  body("expiresAt").optional({ nullable: true }).isISO8601(),
  body("idempotencyKey").optional({ nullable: true }).isString().trim().isLength({ min: 8, max: 180 }),
  body("reason").optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  validateRequest,
  controller.allocateBatch,
);

module.exports = router;
