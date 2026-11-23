/**
 * Smart Orders S1 — customer linkage routes.
 *  - adminRouter  (mounted at /api/admin): Admin / Super Admin, orders permissions.
 *  - claimRouter  (mounted at /api): public claim preview (IP rate-limited) + authenticated claim.
 */
const express = require("express");
const rateLimit = require("express-rate-limit");
const { param } = require("express-validator");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");
const { rateLimitJsonHandler, userOrIpKey } = require("../middleware/rateLimitHelpers");
const ctrl = require("../controllers/orderCustomerController");

const CLAIM_MSG = "محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.";

const orderIdParam = [param("id").isInt({ min: 1 }).withMessage("Invalid order id."), validateRequest];

const adminRouter = express.Router();
const adminGuard = [requireAuth, requireAnyRole(["super_admin", "admin"])];
const ordersPerm = requirePermission("dashboard.admin.orders");
const createOrderPerm = requirePermission("dashboard.admin.create_order");

adminRouter.get("/customer-accounts/search", ...adminGuard, createOrderPerm, ctrl.searchCustomers);
adminRouter.post("/customer-accounts/phone-check", ...adminGuard, createOrderPerm, ctrl.checkPhone);
adminRouter.get("/customer-accounts/account-managers", ...adminGuard, ordersPerm, ctrl.listAccountManagers);
adminRouter.get("/customer-orders/summary", ...adminGuard, ordersPerm, ctrl.getSummary);
adminRouter.get("/orders/:id/customer", ...adminGuard, ordersPerm, ...orderIdParam, ctrl.getOrderCustomer);
adminRouter.post(
  "/orders/:id/customer/reveal-contact",
  ...adminGuard,
  ordersPerm,
  adminWriteLimiter,
  ...orderIdParam,
  ctrl.revealContact,
);
adminRouter.patch(
  "/orders/:id/customer/account-manager",
  ...adminGuard,
  ordersPerm,
  adminWriteLimiter,
  ...orderIdParam,
  ctrl.updateAccountManager,
);
adminRouter.patch(
  "/orders/:id/customer/pricing",
  ...adminGuard,
  createOrderPerm,
  adminWriteLimiter,
  ...orderIdParam,
  ctrl.updatePricing,
);
adminRouter.post(
  "/orders/:id/customer/activation-link",
  ...adminGuard,
  createOrderPerm,
  adminWriteLimiter,
  ...orderIdParam,
  ctrl.regenerateActivationLink,
);
adminRouter.post(
  "/orders/:id/customer/conversion-link",
  ...adminGuard,
  createOrderPerm,
  adminWriteLimiter,
  ...orderIdParam,
  ctrl.createConversionLink,
);
adminRouter.post(
  "/orders/:id/customer/revoke-link",
  ...adminGuard,
  createOrderPerm,
  adminWriteLimiter,
  ...orderIdParam,
  ctrl.revokeLink,
);

const claimPreviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => userOrIpKey("order_claim_preview", req),
  handler: rateLimitJsonHandler("order_claim_preview", CLAIM_MSG, { windowMsFallback: 15 * 60 * 1000 }),
});
const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => userOrIpKey("order_claim", req),
  handler: rateLimitJsonHandler("order_claim", CLAIM_MSG, { windowMsFallback: 15 * 60 * 1000 }),
});

const claimRouter = express.Router();
claimRouter.post("/order-claims/preview", claimPreviewLimiter, ctrl.previewClaim);
claimRouter.post("/client/order-claims/claim", requireAuth, claimLimiter, ctrl.claimOrder);

module.exports = { adminRouter, claimRouter };
