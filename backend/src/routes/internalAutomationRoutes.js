/**
 * Optional trigger for fake-orders automation when in-process setInterval is disabled
 * (e.g. multi-instance: run crons/pg_cron against one URL with the shared secret).
 * Also: Marketplace Membership cycle reconciliation (Phase 3).
 */
const express = require("express");
const fakeOrdersService = require("../services/fakeOrdersService");
const marketplaceMembershipsController = require("../controllers/marketplaceMembershipsController");
const { getAutomationCronSecret } = require("../config/fakeOrdersAutomation");
const { getMarketplaceMembershipReconcileSecret } = require("../config/marketplaceMembershipReconcile");
const { isProduction } = require("../config/env");

const router = express.Router();

router.post("/fake-orders/automation-tick", async (req, res, next) => {
  const secret = getAutomationCronSecret();
  if (!secret) {
    return res.status(isProduction() ? 404 : 503).json({
      success: false,
      code: "AUTOMATION_NOT_CONFIGURED",
      message: isProduction()
        ? "غير متاح."
        : "FAKE_ORDERS_AUTOMATION_CRON_SECRET غير مضبوط (16+ حرف).",
    });
  }
  const hdr = req.headers["x-fake-orders-automation-secret"];
  if (typeof hdr !== "string" || hdr !== secret) {
    return res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "غير مصرح.",
    });
  }
  try {
    await fakeOrdersService.runAutomationTick();
    return res.status(200).json({ success: true });
  } catch (e) {
    return next(e);
  }
});

router.post("/marketplace-memberships/reconcile-tick", async (req, res, next) => {
  const secret = getMarketplaceMembershipReconcileSecret();
  if (!secret) {
    return res.status(isProduction() ? 404 : 503).json({
      success: false,
      code: "RECONCILE_NOT_CONFIGURED",
      message: isProduction()
        ? "غير متاح."
        : "MARKETPLACE_MEMBERSHIP_RECONCILE_SECRET غير مضبوط (16+ حرف).",
    });
  }
  const hdr = req.headers["x-marketplace-membership-reconcile-secret"];
  if (typeof hdr !== "string" || hdr !== secret) {
    return res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "غير مصرح.",
    });
  }
  return marketplaceMembershipsController.runMembershipCyclesReconcileTick(req, res, next);
});

module.exports = router;
