/**
 * External (WhatsApp) order intake routes.
 *  - Freelancer: mounted at /api/freelancer (freelancer role only; id derived from auth).
 *  - Admin / Super Admin: mounted at /api/admin (orders permission; approval = create-order permission).
 */
const express = require("express");
const { requireAuth, requireRole, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const {
  adminOrderCreateLimiter,
  adminWriteLimiter,
  externalOrderIntakeSubmitLimiter,
} = require("../middleware/orderWriteRateLimiters");
const ctrl = require("../controllers/externalOrderIntakeController");

const freelancerRouter = express.Router();
freelancerRouter.post(
  "/external-order-intakes",
  requireAuth,
  requireRole("freelancer"),
  externalOrderIntakeSubmitLimiter,
  ctrl.submitIntake,
);
freelancerRouter.get("/external-order-intakes", requireAuth, requireRole("freelancer"), ctrl.listMyIntakes);

const adminRouter = express.Router();
const adminGuard = [requireAuth, requireAnyRole(["super_admin", "admin"])];
const ordersPerm = requirePermission("dashboard.admin.orders");
const createOrderPerm = requirePermission("dashboard.admin.create_order");

adminRouter.get("/external-order-intakes", ...adminGuard, ordersPerm, ctrl.adminListIntakes);
adminRouter.get("/external-order-intakes/pending-count", ...adminGuard, ordersPerm, ctrl.adminPendingCount);
adminRouter.get("/external-order-intakes/:id", ...adminGuard, ordersPerm, ctrl.adminGetIntake);
adminRouter.post(
  "/external-order-intakes/:id/approve",
  ...adminGuard,
  ordersPerm,
  createOrderPerm,
  adminOrderCreateLimiter,
  ctrl.adminApproveIntake,
);
adminRouter.post(
  "/external-order-intakes/:id/reject",
  ...adminGuard,
  ordersPerm,
  adminWriteLimiter,
  ctrl.adminRejectIntake,
);

module.exports = { freelancerRouter, adminRouter };
