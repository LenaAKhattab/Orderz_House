const express = require("express");
const { body, param, query } = require("express-validator");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireFreelancer } = require("../middleware/rbacMiddleware");
const controller = require("../controllers/marketplaceBidCreditsController");

const router = express.Router();
const guard = [requireAuth, requireFreelancer];

router.get("/bid-credits", ...guard, controller.getMyBidCredits);

router.get("/bid-credit-packages", ...guard, controller.listFreelancerPackages);

router.post(
  "/bid-credit-purchases/checkout",
  ...guard,
  body("packageId").isInt({ min: 1 }),
  // Client may send price/quantity/validity — ignored by server (tamper protection).
  body("priceJod").optional(),
  body("bidQuantity").optional(),
  body("validityDays").optional(),
  validateRequest,
  controller.createPackageCheckout,
);

router.post(
  "/bid-credit-purchases/confirm",
  ...guard,
  body("sessionId").isString().trim().isLength({ min: 8, max: 255 }),
  validateRequest,
  controller.confirmPackageCheckout,
);

router.post(
  "/bid-credit-purchases/cancel",
  ...guard,
  body("sessionId").isString().trim().isLength({ min: 8, max: 255 }),
  validateRequest,
  controller.cancelPackageCheckout,
);

router.get(
  "/bid-credit-purchases",
  ...guard,
  query("limit").optional().isInt({ min: 1, max: 100 }),
  query("offset").optional().isInt({ min: 0 }),
  validateRequest,
  controller.listMyPurchases,
);

router.get(
  "/bid-credit-purchases/:purchaseId",
  ...guard,
  param("purchaseId").isInt({ min: 1 }),
  validateRequest,
  controller.getMyPurchase,
);

module.exports = router;
