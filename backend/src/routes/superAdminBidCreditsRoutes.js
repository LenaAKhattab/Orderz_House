const express = require("express");
const { body, param, query } = require("express-validator");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const controller = require("../controllers/marketplaceBidCreditsController");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

router.get("/bid-credit-packages", ...guard, controller.adminListPackages);

router.post(
  "/bid-credit-packages",
  ...guard,
  body("code").isString().trim().isLength({ min: 2, max: 64 }),
  body("nameAr").isString().trim().isLength({ min: 1, max: 200 }),
  body("nameEn").optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body("bidQuantity").isInt({ min: 1, max: 1000000 }),
  body("priceJod").isFloat({ min: 0 }),
  body("validityDays").optional({ nullable: true }).isInt({ min: 1, max: 3650 }),
  body("isActive").optional().isBoolean(),
  body("sortOrder").optional().isInt(),
  validateRequest,
  controller.adminCreatePackage,
);

router.patch(
  "/bid-credit-packages/:id",
  ...guard,
  param("id").isInt({ min: 1 }),
  body("nameAr").optional().isString().trim().isLength({ min: 1, max: 200 }),
  body("bidQuantity").optional().isInt({ min: 1, max: 1000000 }),
  body("priceJod").optional().isFloat({ min: 0 }),
  body("validityDays").optional({ nullable: true }).isInt({ min: 1, max: 3650 }),
  body("isActive").optional().isBoolean(),
  validateRequest,
  controller.adminUpdatePackage,
);

router.get(
  "/bid-credit-purchases",
  ...guard,
  query("limit").optional().isInt({ min: 1, max: 200 }),
  query("offset").optional().isInt({ min: 0 }),
  query("freelancerUserId").optional().isInt({ min: 1 }),
  validateRequest,
  controller.adminListPurchases,
);

router.post(
  "/bid-credit-purchases/:purchaseId/manual-review",
  ...guard,
  param("purchaseId").isInt({ min: 1 }),
  body("resolution").isIn(["keep_frozen", "release_remaining", "revoke_remaining"]),
  body("note").optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
  validateRequest,
  controller.adminResolvePurchaseManualReview,
);

router.get(
  "/bid-credits/freelancers/:freelancerUserId",
  ...guard,
  param("freelancerUserId").isInt({ min: 1 }),
  validateRequest,
  controller.adminGetFreelancerBidCredits,
);

router.post(
  "/bid-credits/grants",
  ...guard,
  body("freelancerUserId").isInt({ min: 1 }),
  body("amount").isInt({ min: 1, max: 1000000 }),
  body("expiresAt").isISO8601(),
  body("reason").isString().trim().isLength({ min: 1, max: 2000 }),
  body("internalNote").optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
  body("idempotencyKey").optional({ nullable: true }).isString().trim().isLength({ min: 8, max: 180 }),
  validateRequest,
  controller.adminGrantBidCredits,
);

module.exports = router;
