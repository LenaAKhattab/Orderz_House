const bidCreditsService = require("../services/marketplaceBidCreditsService");
const packagesService = require("../services/marketplaceBidCreditPackagesService");
const distributionService = require("../services/marketplaceBidCreditDistributionService");
const purchasesService = require("../services/marketplaceBidCreditPurchasesService");
const { createAppError } = require("../utils/AppError");
const {
  BID_PACKAGE_PURCHASE_ERROR_CODES,
} = require("../constants/marketplaceBidCreditPurchases");

async function getMyBidCredits(req, res, next) {
  try {
    const freelancerUserId = req.user.id;
    const data = await bidCreditsService.getFreelancerBidCreditsSummary({ freelancerUserId });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/** Freelancer: active purchasable packages only (B6 catalog). */
async function listFreelancerPackages(req, res, next) {
  try {
    const packages = await packagesService.listBidCreditPackages({
      activeOnly: true,
      purchasableOnly: true,
    });
    return res.json({ success: true, data: { packages } });
  } catch (err) {
    return next(err);
  }
}

/**
 * Freelancer: create Stripe Checkout for a Bid package.
 * Body may include priceJod/bidQuantity/validityDays — ignored (server snapshot only).
 */
async function createPackageCheckout(req, res, next) {
  try {
    const out = await purchasesService.createBidCreditPackageCheckout({
      freelancerUserId: req.user.id,
      packageId: Number(req.body.packageId),
      priceJod: req.body.priceJod,
      bidQuantity: req.body.bidQuantity,
      validityDays: req.body.validityDays,
    });
    return res.status(201).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

/** Freelancer: confirm after Stripe redirect — server retrieves session; never trusts URL alone. */
async function confirmPackageCheckout(req, res, next) {
  try {
    const out = await purchasesService.confirmBidCreditPackageCheckout({
      freelancerUserId: req.user.id,
      sessionId: req.body.sessionId,
    });
    return res.json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function cancelPackageCheckout(req, res, next) {
  try {
    const purchase = await purchasesService.markBidCreditPackageCheckoutCancelled({
      freelancerUserId: req.user.id,
      sessionId: req.body.sessionId,
    });
    return res.json({ success: true, data: { purchase } });
  } catch (err) {
    return next(err);
  }
}

async function listMyPurchases(req, res, next) {
  try {
    const purchases = await purchasesService.listMyBidCreditPurchases(req.user.id, {
      limit: req.query.limit,
      offset: req.query.offset,
    });
    const {
      freelancerPurchaseDisplayStatus,
    } = require("../services/marketplaceBidCreditPurchaseReversalsService");
    return res.json({
      success: true,
      data: {
        purchases: purchases.map((p) => ({
          ...p,
          // Strip provider IDs from Freelancer surface
          stripeCheckoutSessionId: undefined,
          stripePaymentIntentId: undefined,
          displayStatus: freelancerPurchaseDisplayStatus(p),
          remainingBidsTemporarilyUnavailable:
            p.paymentReversalStatus === "dispute_open" ||
            p.paymentReversalStatus === "refunded_partial_manual_review" ||
            p.paymentReversalStatus === "manual_resolved_kept_frozen",
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getMyPurchase(req, res, next) {
  try {
    const purchase = await purchasesService.getMyBidCreditPurchase(
      Number(req.params.purchaseId),
      req.user.id,
    );
    if (!purchase) {
      throw createAppError("Purchase not found.", 404, {
        exposeToClient: true,
        publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_PURCHASE_NOT_FOUND,
      });
    }
    return res.json({ success: true, data: { purchase } });
  } catch (err) {
    return next(err);
  }
}

async function adminListPurchases(req, res, next) {
  try {
    const purchases = await purchasesService.listAdminBidCreditPurchases({
      limit: req.query.limit,
      offset: req.query.offset,
      freelancerUserId: req.query.freelancerUserId != null ? Number(req.query.freelancerUserId) : null,
    });
    return res.json({ success: true, data: { purchases } });
  } catch (err) {
    return next(err);
  }
}

/** Super Admin: resolve partial-refund manual review (no Stripe refund execution). */
async function adminResolvePurchaseManualReview(req, res, next) {
  try {
    const reversals = require("../services/marketplaceBidCreditPurchaseReversalsService");
    const out = await reversals.resolveBidPackagePartialRefundManualReview({
      purchaseId: Number(req.params.purchaseId),
      resolution: req.body.resolution,
      actorUserId: req.user.id,
      note: req.body.note || null,
    });
    return res.json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function adminGetFreelancerBidCredits(req, res, next) {
  try {
    const freelancerUserId = Number(req.params.freelancerUserId);
    const data = await bidCreditsService.getAdminFreelancerBidCredits({ freelancerUserId });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function adminGrantBidCredits(req, res, next) {
  try {
    const out = await bidCreditsService.adminGrantBidCredits({
      freelancerUserId: Number(req.body.freelancerUserId),
      amount: Number(req.body.amount),
      expiresAt: req.body.expiresAt,
      reason: req.body.reason,
      internalNote: req.body.internalNote || null,
      actorUserId: req.user.id,
      idempotencyKey: req.body.idempotencyKey || req.get("Idempotency-Key") || null,
      metadata: req.body.metadata || {},
    });
    return res.status(out.created ? 201 : 200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function adminListPackages(req, res, next) {
  try {
    const data = await packagesService.listBidCreditPackages({
      activeOnly: req.query.activeOnly === "true",
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function adminCreatePackage(req, res, next) {
  try {
    const data = await packagesService.createBidCreditPackage(req.body, req.user.id);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function adminUpdatePackage(req, res, next) {
  try {
    const data = await packagesService.updateBidCreditPackage(
      Number(req.params.id),
      req.body,
      req.user.id,
    );
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function runBidCreditReconcileTick(req, res, next) {
  try {
    const limit = req.body?.limit != null ? Number(req.body.limit) : 100;
    const data = await distributionService.runBidCreditReconcileTick({ limit });
    // Phase E3: idempotent Normal Order application-deadline reconcile (same cron secret).
    let normalOrderDeadlines = { processed: 0, schemaReady: false };
    try {
      const e3 = require("../services/marketplaceNormalOrderRulesService");
      normalOrderDeadlines = await e3.reconcileNormalOrderApplicationDeadlines({
        now: new Date(),
        limit,
      });
    } catch (e3Err) {
      normalOrderDeadlines = {
        processed: 0,
        error: e3Err?.message || String(e3Err),
      };
    }
    return res.json({
      success: true,
      data: {
        ...data,
        normalOrderDeadlines,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMyBidCredits,
  listFreelancerPackages,
  createPackageCheckout,
  confirmPackageCheckout,
  cancelPackageCheckout,
  listMyPurchases,
  getMyPurchase,
  adminListPurchases,
  adminResolvePurchaseManualReview,
  adminGetFreelancerBidCredits,
  adminGrantBidCredits,
  adminListPackages,
  adminCreatePackage,
  adminUpdatePackage,
  runBidCreditReconcileTick,
};
