/**
 * Optional trigger for fake-orders automation when in-process setInterval is disabled
 * (e.g. multi-instance: run crons/pg_cron against one URL with the shared secret).
 * Also: Marketplace Membership cycle reconciliation (Phase 3).
 */
const express = require("express");
const fakeOrdersService = require("../services/fakeOrdersService");
const marketplaceMembershipsController = require("../controllers/marketplaceMembershipsController");
const marketplacePriorityAuctionController = require("../controllers/marketplacePriorityAuctionController");
const { getAutomationCronSecret } = require("../config/fakeOrdersAutomation");
const { getMarketplaceMembershipReconcileSecret } = require("../config/marketplaceMembershipReconcile");
const { getPriorityAuctionResolveSecret } = require("../config/marketplacePriorityAuctionResolve");
const { getEliteDirectOfferExpireSecret } = require("../config/marketplaceEliteDirectOfferExpire");
const marketplaceEliteDirectOrdersController = require("../controllers/marketplaceEliteDirectOrdersController");
const marketplaceBidCreditsController = require("../controllers/marketplaceBidCreditsController");
const { getBidCreditReconcileSecret } = require("../config/marketplaceBidCreditReconcile");
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

router.post("/priority-auctions/resolve-tick", async (req, res, next) => {
  const secret = getPriorityAuctionResolveSecret();
  if (!secret) {
    return res.status(isProduction() ? 404 : 503).json({
      success: false,
      code: "PRIORITY_AUCTION_RESOLVE_NOT_CONFIGURED",
      message: isProduction()
        ? "غير متاح."
        : "PRIORITY_AUCTION_RESOLVE_SECRET غير مضبوط (16+ حرف).",
    });
  }
  const hdr = req.headers["x-priority-auction-resolve-secret"];
  if (typeof hdr !== "string" || hdr !== secret) {
    return res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "غير مصرح.",
    });
  }
  return marketplacePriorityAuctionController.runPriorityAuctionResolveTick(req, res, next);
});

router.post("/elite-direct-offers/expire-tick", async (req, res, next) => {
  const secret = getEliteDirectOfferExpireSecret();
  if (!secret) {
    return res.status(isProduction() ? 404 : 503).json({
      success: false,
      code: "ELITE_EXPIRE_NOT_CONFIGURED",
      message: isProduction()
        ? "غير متاح."
        : "ELITE_DIRECT_OFFER_EXPIRE_SECRET غير مضبوط (16+ حرف).",
    });
  }
  const hdr = req.headers["x-elite-direct-offer-expire-secret"];
  if (typeof hdr !== "string" || hdr !== secret) {
    return res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "غير مصرح.",
    });
  }
  return marketplaceEliteDirectOrdersController.runEliteDirectOfferExpireTick(req, res, next);
});

router.post("/bid-credits/reconcile-tick", async (req, res, next) => {
  const secret = getBidCreditReconcileSecret();
  if (!secret) {
    return res.status(isProduction() ? 404 : 503).json({
      success: false,
      code: "BID_CREDIT_RECONCILE_NOT_CONFIGURED",
      message: isProduction()
        ? "غير متاح."
        : "BID_CREDIT_RECONCILE_SECRET غير مضبوط (16+ حرف).",
    });
  }
  const hdr = req.headers["x-bid-credit-reconcile-secret"];
  if (typeof hdr !== "string" || hdr !== secret) {
    return res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "غير مصرح.",
    });
  }
  return marketplaceBidCreditsController.runBidCreditReconcileTick(req, res, next);
});

module.exports = router;
