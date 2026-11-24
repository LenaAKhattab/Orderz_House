/**
 * Smart Orders S5/S6 — Admin finance API (mounted at /api/admin).
 * View: dashboard.admin.finance_view · Records: finance_manage · Policies: finance_policy.
 * Super Admin bypasses permission checks (existing RBAC). Freelancers/clients never reach these routes.
 */
const express = require("express");
const { param } = require("express-validator");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");
const finance = require("../services/finance/orderFinanceService");
const pricing = require("../services/finance/pricingEngine");
const items = require("../services/finance/orderServiceItemsService");
const rewards = require("../services/finance/rewardPoolService");
const reports = require("../services/finance/financeReportsService");

const router = express.Router();
const staff = [requireAuth, requireAnyRole(["super_admin", "admin"])];
const view = requirePermission("dashboard.admin.finance_view");
const manage = requirePermission("dashboard.admin.finance_manage");
const policyPerm = requirePermission("dashboard.admin.finance_policy");
const createPerm = requirePermission("dashboard.admin.create_order");
const ordersPerm = requirePermission("dashboard.admin.orders");
const rewardPerm = requirePermission("dashboard.admin.reward_manage");
const payoutPerm = requirePermission("dashboard.admin.payout_approve");

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};
const ok = (res, data, status = 200) => {
  res.set("Cache-Control", "no-store");
  return res.status(status).json({ success: true, data });
};
const idParam = (name = "id") => [param(name).isInt({ min: 1 }).withMessage("Invalid id."), validateRequest];
const fxIds = (req) =>
  String(req.query.fx || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);

// ---- Policies ----
router.get("/finance/policies", ...staff, view, wrap(async (req, res) => ok(res, await finance.getPolicies())));
router.get(
  "/finance/policies/:key/history",
  ...staff,
  view,
  wrap(async (req, res) => ok(res, await finance.getPolicyHistory(String(req.params.key)))),
);
router.post(
  "/finance/policies/:key",
  ...staff,
  policyPerm,
  adminWriteLimiter,
  wrap(async (req, res) =>
    ok(
      res,
      await finance.setPolicy({
        key: String(req.params.key),
        status: req.body?.status,
        config: req.body?.config,
        approvalReference: req.body?.approvalReference,
        note: req.body?.note,
        actorUserId: req.auth.userId,
      }),
      201,
    ),
  ),
);

// ---- FX ----
router.get("/finance/fx-snapshots", ...staff, view, wrap(async (req, res) => ok(res, await finance.listFxSnapshots({ quoteCurrency: req.query.currency || null }))));
router.post(
  "/finance/fx-snapshots",
  ...staff,
  manage,
  adminWriteLimiter,
  wrap(async (req, res) => ok(res, await finance.createFxSnapshot({ ...(req.body || {}), actorUserId: req.auth.userId }), 201)),
);

// ---- Payment exceptions ----
router.get(
  "/finance/payment-exceptions",
  ...staff,
  view,
  wrap(async (req, res) => ok(res, await finance.listPaymentExceptions({ status: String(req.query.status || "open"), limit: req.query.limit }))),
);
router.post(
  "/finance/payment-exceptions/:id/resolve",
  ...staff,
  manage,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) =>
    ok(
      res,
      await finance.resolvePaymentException({
        exceptionId: req.params.id,
        resolution: req.body?.resolution,
        note: req.body?.note,
        actorUserId: req.auth.userId,
      }),
    ),
  ),
);

// ---- Per-order finance ----
router.get(
  "/orders/:id/finance",
  ...staff,
  view,
  ...idParam(),
  wrap(async (req, res) => ok(res, await finance.getOrderFinance({ orderId: req.params.id, fxSnapshotIds: fxIds(req) }))),
);
router.post(
  "/orders/:id/finance/costs",
  ...staff,
  manage,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) =>
    ok(
      res,
      await finance.recordCost({
        orderId: req.params.id,
        kind: req.body?.kind,
        amount: req.body?.amount,
        currency: req.body?.currency,
        description: req.body?.description,
        sourceRef: req.body?.sourceRef,
        qcProvider: req.body?.qcProvider,
        qcResult: req.body?.qcResult,
        actorUserId: req.auth.userId,
      }),
      201,
    ),
  ),
);
router.post(
  "/finance/costs/:id/void",
  ...staff,
  manage,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await finance.voidCost({ costEntryId: req.params.id, reason: req.body?.reason, actorUserId: req.auth.userId }))),
);
router.post(
  "/orders/:id/finance/adjustments",
  ...staff,
  manage,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) =>
    ok(
      res,
      await finance.recordAdjustment({
        orderId: req.params.id,
        kind: req.body?.kind,
        amount: req.body?.amount,
        currency: req.body?.currency,
        reason: req.body?.reason,
        actorUserId: req.auth.userId,
      }),
      201,
    ),
  ),
);
router.post(
  "/orders/:id/finance/settlements",
  ...staff,
  manage,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) =>
    ok(
      res,
      await finance.closeSettlement({
        orderId: req.params.id,
        expectedVersion: req.body?.expectedVersion,
        fxSnapshotIds: Array.isArray(req.body?.fxSnapshotIds) ? req.body.fxSnapshotIds.slice(0, 5) : [],
        correctionReason: req.body?.correctionReason,
        actorUserId: req.auth.userId,
      }),
      201,
    ),
  ),
);

// ---- Pricing suggestion + multi-service items (order operations) ----
router.get(
  "/orders/:id/quote-suggestion",
  ...staff,
  ordersPerm,
  ...idParam(),
  wrap(async (req, res) => ok(res, await pricing.suggestQuoteForOrder(req.params.id))),
);
router.get("/orders/:id/service-items", ...staff, ordersPerm, ...idParam(), wrap(async (req, res) => ok(res, await items.listItems(req.params.id, { includeRemoved: true }))));
router.post(
  "/orders/:id/service-items",
  ...staff,
  createPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await items.addItem({ orderId: req.params.id, input: req.body || {}, actorUserId: req.auth.userId }), 201)),
);
router.post(
  "/orders/:id/service-items/:itemId/remove",
  ...staff,
  createPerm,
  adminWriteLimiter,
  ...idParam(),
  ...idParam("itemId"),
  wrap(async (req, res) => ok(res, await items.removeItem({ orderId: req.params.id, itemId: req.params.itemId, actorUserId: req.auth.userId }))),
);

// ---- S6: management report ----
router.get(
  "/finance/reports/summary",
  ...staff,
  view,
  wrap(async (req, res) => ok(res, await reports.getManagementReport({ from: req.query.from, to: req.query.to, categoryId: req.query.categoryId || null }))),
);

// ---- S6: employee reward pool ----
router.get("/finance/rewards/mine", ...staff, wrap(async (req, res) => ok(res, await rewards.myRewards(req.auth.userId))));
router.get("/finance/rewards/staff", ...staff, rewardPerm, wrap(async (req, res) => ok(res, await rewards.listEligibleStaff())));
router.get("/finance/rewards/periods", ...staff, rewardPerm, wrap(async (req, res) => ok(res, await rewards.listPeriods())));
router.post(
  "/finance/rewards/periods",
  ...staff,
  rewardPerm,
  adminWriteLimiter,
  wrap(async (req, res) => ok(res, await rewards.createPeriod({ month: req.body?.month, actorUserId: req.auth.userId }), 201)),
);
router.get("/finance/rewards/periods/:id", ...staff, rewardPerm, ...idParam(), wrap(async (req, res) => ok(res, await rewards.getPeriod(req.params.id))));
router.put(
  "/finance/rewards/periods/:id/weights",
  ...staff,
  rewardPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await rewards.setWeights({ periodId: req.params.id, weights: req.body?.weights }))),
);
router.post(
  "/finance/rewards/periods/:id/copy-previous-weights",
  ...staff,
  rewardPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await rewards.copyPreviousWeights({ periodId: req.params.id }))),
);
router.post(
  "/finance/rewards/periods/:id/approve",
  ...staff,
  payoutPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await rewards.approvePeriod({ periodId: req.params.id, actorUserId: req.auth.userId }))),
);
router.post(
  "/finance/rewards/periods/:id/close",
  ...staff,
  payoutPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await rewards.closePeriod({ periodId: req.params.id, actorUserId: req.auth.userId }))),
);
router.post(
  "/finance/rewards/periods/:id/mark-paid",
  ...staff,
  payoutPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await rewards.markPaid({ periodId: req.params.id, paymentReference: req.body?.paymentReference, actorUserId: req.auth.userId }))),
);
router.post(
  "/finance/rewards/periods/:id/adjustments",
  ...staff,
  payoutPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) =>
    ok(res, await rewards.addAdjustment({ periodId: req.params.id, userId: req.body?.userId, amount: req.body?.amount, reason: req.body?.reason, actorUserId: req.auth.userId }), 201),
  ),
);

module.exports = router;
