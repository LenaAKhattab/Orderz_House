const ordersService = require("../services/ordersService");
const poolOrderResolveService = require("../services/poolOrderResolveService");
const fakeOrdersService = require("../services/fakeOrdersService");

const POOL_ORDER_NOT_FOUND = "لم يتم العثور على الطلب";

async function sanitizeResolvedFreelancerPoolOrder(orderId, freelancerUserId, viewerRole) {
  const resolved = await poolOrderResolveService.resolvePoolOrderForViewer(orderId, {
    userId: freelancerUserId,
    role: viewerRole,
  });
  if (!resolved) return null;
  const enriched = await poolOrderResolveService.enrichFreelancerPoolOrder(resolved, freelancerUserId);
  const order = enriched.order;
  if (order.poolEligibility?.isLockedByPlan) {
    return sanitizeLockedFreelancerPoolOrder(order, order.poolEligibility);
  }
  return sanitizeFreelancerPoolOrder(order);
}
const { pipeOrderFileToResponse } = require("../utils/pipeOrderFileDownload");
const {
  sanitizePublicPoolOrder,
  sanitizeFreelancerPoolOrder,
  sanitizeLockedFreelancerPoolOrder,
  sanitizeOrderForFreelancerAssigned,
} = require("../utils/orderViewerSanitize");
const { capture } = require("../config/posthog");

/** Guest-only sanitized pool JSON. Never stores freelancer/client-private fields. Clamp 10–60s. */
const PUBLIC_POOL_RESPONSE_CACHE_MS = Math.min(
  Math.max(Number(process.env.PUBLIC_POOL_RESPONSE_CACHE_MS) || 20_000, 10_000),
  60_000,
);
/** @type {Map<string, { value: object, expires: number }>} */
const guestPoolResponseCache = new Map();
/** @type {Map<string, Promise<object>>} */
const guestPoolResponseInflight = new Map();

function guestPoolResponseCacheKey(queryOpts) {
  return JSON.stringify({
    page: String(queryOpts.page || ""),
    limit: String(queryOpts.limit || ""),
    offset: String(queryOpts.offset || ""),
    status: String(queryOpts.status || ""),
    projectType: String(queryOpts.projectType || ""),
    categoryId: String(queryOpts.categoryId || ""),
    categoryIds: String(queryOpts.categoryIds || ""),
    subSubCategoryIds: String(queryOpts.subSubCategoryIds || ""),
    sort: String(queryOpts.sort || "newest"),
    q: String(queryOpts.q || ""),
  });
}

const listPoolOrders = async (req, res, next) => {
  try {
    const userId = req.auth?.userId || null;
    const role = String(req.auth?.primaryRole || req.auth?.role || "").trim();
    const orderAuthz = require("../services/orderAuthorizationService");
    const isStaff = orderAuthz.isStaffAuth(req.auth);
    /** Freelancers get subscription-filtered pool; staff may browse sanitized pool metadata. */
    const isFreelancer = role === "freelancer" && userId;
    const queryOpts = {
      page: req.query.page,
      limit: req.query.limit,
      offset: req.query.offset,
      status: req.query.status,
      projectType: req.query.projectType,
      categoryId: req.query.categoryId,
      categoryIds: req.query.categoryIds,
      subSubCategoryIds: req.query.subSubCategoryIds,
      sort: req.query.sort,
      q: req.query.q,
    };

    const loadPayload = async () => {
      const result = isFreelancer
        ? await ordersService.listPoolOrdersForFreelancer({
            freelancerUserId: userId,
            viewerRole: role,
            ...queryOpts,
          })
        : await ordersService.listPoolOrders({
            viewerUserId: userId,
            viewerRole: isStaff ? "admin" : role || null,
            ...queryOpts,
          });
      const orders = Array.isArray(result.orders)
        ? result.orders.map((o) =>
            isFreelancer ? sanitizeFreelancerPoolOrder(o) : sanitizePublicPoolOrder(o),
          )
        : [];
      return { success: true, data: { ...result, orders } };
    };

    // Public/guest only — authenticated users (client/freelancer/admin) skip this cache.
    if (!userId && !isFreelancer) {
      const { perfStart } = require("../utils/perfLog");
      const cacheTimer = perfStart("orders_pool", "guest_response_cache");
      const key = guestPoolResponseCacheKey(queryOpts);
      const hit = guestPoolResponseCache.get(key);
      if (hit && hit.expires > Date.now()) {
        cacheTimer.end({ cache: "hit" });
        return res.status(200).json(hit.value);
      }
      if (guestPoolResponseInflight.has(key)) {
        const payload = await guestPoolResponseInflight.get(key);
        cacheTimer.end({ cache: "coalesce" });
        return res.status(200).json(payload);
      }
      const pending = loadPayload()
        .then((payload) => {
          guestPoolResponseCache.set(key, {
            value: payload,
            expires: Date.now() + PUBLIC_POOL_RESPONSE_CACHE_MS,
          });
          return payload;
        })
        .finally(() => {
          guestPoolResponseInflight.delete(key);
        });
      guestPoolResponseInflight.set(key, pending);
      const payload = await pending;
      cacheTimer.end({ cache: "miss" });
      return res.status(200).json(payload);
    }

    const payload = await loadPayload();
    return res.status(200).json(payload);
  } catch (err) {
    return next(err);
  }
};

const takePoolOrder = async (req, res, next) => {
  try {
    const order = await ordersService.claimPoolOrder({ freelancerUserId: req.auth.userId, orderId: req.params.id });
    capture(String(req.auth.userId), "fixed_order_taken", {
      orderId: String(req.params.id),
    });
    const safe = sanitizeFreelancerPoolOrder(order);
    return res.status(200).json({ success: true, data: { order: safe } });
  } catch (err) {
    return next(err);
  }
};

/** Unified pool take: resolves real vs training order server-side (no client source param). */
const takeUnifiedPoolOrder = async (req, res, next) => {
  try {
    const viewerRole = req.auth?.primaryRole || req.auth?.role || null;
    const resolved = await poolOrderResolveService.resolvePoolOrderForViewer(req.params.id, {
      userId: req.auth.userId,
      role: viewerRole,
    });
    if (!resolved) {
      return res.status(404).json({ success: false, message: POOL_ORDER_NOT_FOUND });
    }
    if (resolved.kind === "fake") {
      await fakeOrdersService.submitFakeTrainingClaim({
        freelancerUserId: req.auth.userId,
        orderId: req.params.id,
      });
      capture(String(req.auth.userId), "fixed_order_taken", {
        orderId: String(req.params.id),
      });
      const safe = await sanitizeResolvedFreelancerPoolOrder(req.params.id, req.auth.userId, viewerRole);
      return res.status(200).json({ success: true, data: { order: safe } });
    }
    const order = await ordersService.claimPoolOrder({ freelancerUserId: req.auth.userId, orderId: req.params.id });
    capture(String(req.auth.userId), "fixed_order_taken", {
      orderId: String(req.params.id),
    });
    const myBid = await ordersService.getMyOrderBid({ orderId: req.params.id, freelancerUserId: req.auth.userId });
    const myClaim = await ordersService.getMyOrderClaim({ orderId: req.params.id, freelancerUserId: req.auth.userId });
    const safe = sanitizeFreelancerPoolOrder({ ...order, myBid, myClaim });
    return res.status(200).json({ success: true, data: { order: safe } });
  } catch (err) {
    return next(err);
  }
};

const withdrawPoolOrderClaim = async (req, res, next) => {
  try {
    const out = await ordersService.withdrawPoolClaim({ freelancerUserId: req.auth.userId, orderId: req.params.id });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const getPoolOrderById = async (req, res, next) => {
  try {
    const viewerRole = String(req.auth?.primaryRole || req.auth?.role || "").trim();
    const freelancerUserId = req.auth?.userId || null;
    const isFreelancer = viewerRole === "freelancer" && freelancerUserId;

    const resolved = await poolOrderResolveService.resolvePoolOrderForViewer(req.params.id, {
      userId: freelancerUserId,
      role: viewerRole,
    });
    if (!resolved) {
      return res.status(404).json({ success: false, message: POOL_ORDER_NOT_FOUND });
    }

    if (isFreelancer) {
      const enriched = await poolOrderResolveService.enrichFreelancerPoolOrder(resolved, freelancerUserId);
      if (enriched.order.poolEligibility?.isLockedByPlan) {
        return res.status(200).json({
          success: true,
          data: { order: sanitizeLockedFreelancerPoolOrder(enriched.order, enriched.order.poolEligibility) },
        });
      }
      return res.status(200).json({
        success: true,
        data: { order: sanitizeFreelancerPoolOrder(enriched.order) },
      });
    }
    return res.status(200).json({ success: true, data: { order: sanitizePublicPoolOrder(resolved.order) } });
  } catch (err) {
    return next(err);
  }
};

const submitPoolOrderBid = async (req, res, next) => {
  try {
    const viewerRole = req.auth?.primaryRole || req.auth?.role || null;
    const resolved = await poolOrderResolveService.resolvePoolOrderForViewer(req.params.id, {
      userId: req.auth.userId,
      role: viewerRole,
    });
    if (!resolved) {
      return res.status(404).json({ success: false, message: POOL_ORDER_NOT_FOUND });
    }
    if (resolved.kind === "fake") {
      await fakeOrdersService.submitFakeTrainingBid({
        freelancerUserId: req.auth.userId,
        orderId: req.params.id,
        amount: req.body.amount,
        message: req.body.message || null,
      });
      capture(String(req.auth.userId), "bid_submitted", {
        orderId: String(req.params.id),
        amount: req.body.amount,
      });
      const safe = await sanitizeResolvedFreelancerPoolOrder(req.params.id, req.auth.userId, viewerRole);
      return res.status(200).json({ success: true, data: { order: safe } });
    }
    const result = await ordersService.submitPoolOrderBid({
      freelancerUserId: req.auth.userId,
      orderId: req.params.id,
      amount: req.body.amount,
      message: req.body.message || null,
      poolKind: "real",
      usePriority: Boolean(req.body.usePriority),
    });
    const order = result?.order || result;
    const bidCredit = result?.bidCredit || null;
    const priorityBoost = result?.priorityBoost || null;
    capture(String(req.auth.userId), "bid_submitted", {
      orderId: String(req.params.id),
      amount: req.body.amount,
      isPriority: Boolean(priorityBoost?.boosted),
    });
    const myBid = await ordersService.getMyOrderBid({ orderId: req.params.id, freelancerUserId: req.auth.userId });
    const myClaim = await ordersService.getMyOrderClaim({ orderId: req.params.id, freelancerUserId: req.auth.userId });
    const safe = sanitizeFreelancerPoolOrder({ ...order, myBid, myClaim });
    return res.status(200).json({
      success: true,
      data: {
        order: safe,
        bidCredit: bidCredit
          ? {
              consumed: Boolean(bidCredit.consumed),
              cost: Number(bidCredit.cost) || 0,
              availableBidsAfter: bidCredit.availableBidsAfter,
              skipped: Boolean(bidCredit.skipped),
            }
          : null,
        priorityBoost: priorityBoost
          ? {
              boosted: Boolean(priorityBoost.boosted),
              skipped: Boolean(priorityBoost.skipped),
              priorityUseCost: Number(priorityBoost.priorityUseCost) || 0,
              additionalBidCreditCost: Number(priorityBoost.additionalBidCreditCost) || 0,
              remainingPriorityUses: priorityBoost.remainingPriorityUses,
            }
          : null,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Phase 5 LEGACY: normal-application Token quote — permanently deprecated (B7B).
 * Prefer getPoolOrderNormalApplicationBidQuote for active product UX.
 */
const getPoolOrderNormalApplicationTokenQuote = async (_req, res) => {
  return res.status(410).json({
    success: false,
    code: "WORK_TOKENS_DEPRECATED",
    message: "This quote endpoint is no longer available. Use the Bid quote instead.",
  });
};

/**
 * Phase B2: read-only normal-application Bid Credit quote (cost always 1).
 * Engine OFF → engineAvailable=false; Freelancer may still submit (dormant charge).
 * Fake/training → not applicable.
 */
const getPoolOrderNormalApplicationBidQuote = async (req, res, next) => {
  try {
    const viewerRole = req.auth?.primaryRole || req.auth?.role || null;
    const resolved = await poolOrderResolveService.resolvePoolOrderForViewer(req.params.id, {
      userId: req.auth.userId,
      role: viewerRole,
    });
    if (!resolved) {
      return res.status(404).json({ success: false, message: POOL_ORDER_NOT_FOUND });
    }
    if (resolved.kind === "fake") {
      return res.status(200).json({
        success: true,
        data: {
          applicable: false,
          engineAvailable: false,
          reason: "fake_or_training",
          bidCreditCost: 0,
          availableBids: null,
          canApply: true,
        },
      });
    }
    const bidApp = require("../services/marketplaceNormalApplicationBidCreditService");
    const quote = await bidApp.quoteNormalApplicationBidCost({
      order: resolved.order,
      freelancerUserId: req.auth.userId,
    });
    const priorityBoostSvc = require("../services/marketplacePriorityApplicationBoostService");
    const priorityQuote = await priorityBoostSvc.quotePriorityApplicationBoost({
      order: resolved.order,
      freelancerUserId: req.auth.userId,
      poolKind: "real",
    });
    return res.status(200).json({
      success: true,
      data: {
        applicable: true,
        engineAvailable: Boolean(quote.engineAvailable),
        schemaReady: Boolean(quote.schemaReady),
        bidCreditCost: quote.bidCreditCost,
        availableBids: quote.availableBids,
        canApply: quote.canApply,
        reason: quote.reason || null,
        priorityBoost: {
          engineAvailable: Boolean(priorityQuote.engineAvailable),
          schemaReady: Boolean(priorityQuote.schemaReady),
          canBoost: Boolean(priorityQuote.canBoost),
          alreadyBoosted: Boolean(priorityQuote.alreadyBoosted),
          remainingPriorityUses: priorityQuote.remainingPriorityUses,
          priorityUseCost: priorityQuote.priorityUseCost,
          additionalBidCreditCost: priorityQuote.additionalBidCreditCost,
          reason: priorityQuote.reason || null,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
};

const upgradePoolOrderBidPriority = async (req, res, next) => {
  try {
    const viewerRole = req.auth?.primaryRole || req.auth?.role || null;
    const resolved = await poolOrderResolveService.resolvePoolOrderForViewer(req.params.id, {
      userId: req.auth.userId,
      role: viewerRole,
    });
    if (!resolved) {
      return res.status(404).json({ success: false, message: POOL_ORDER_NOT_FOUND });
    }
    if (resolved.kind === "fake") {
      return res.status(403).json({
        success: false,
        message: "Priority Boost is not available for fake/training orders.",
      });
    }
    const priorityBoostSvc = require("../services/marketplacePriorityApplicationBoostService");
    const result = await priorityBoostSvc.upgradeExistingApplicationToPriority({
      freelancerUserId: req.auth.userId,
      orderId: req.params.id,
      actorUserId: req.auth.userId,
    });
    return res.status(200).json({
      success: true,
      data: {
        priorityBoost: {
          boosted: Boolean(result.boosted),
          idempotent: Boolean(result.idempotent),
          priorityUseCost: Number(result.priorityUseCost) || 0,
          additionalBidCreditCost: Number(result.additionalBidCreditCost) || 0,
          remainingPriorityUses:
            result.remainingPriorityUses != null ? result.remainingPriorityUses : null,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
};

/** Legacy route — same behavior as unified pool bid (no client source param). */
const submitFakePoolOrderBid = submitPoolOrderBid;

/** Legacy route — same behavior as unified pool take (no client source param). */
const takeFakePoolOrder = takeUnifiedPoolOrder;

const listMyAssignedOrders = async (req, res, next) => {
  try {
    const result = await ordersService.listFreelancerAssignedOrders({
      freelancerUserId: req.auth.userId,
      page: req.query.page,
      limit: req.query.limit,
      offset: req.query.offset,
      status: req.query.status,
      projectType: req.query.projectType,
      categoryId: req.query.categoryId,
      subSubCategoryIds: req.query.subSubCategoryIds,
      sort: req.query.sort,
      q: req.query.q,
    });
    const fazatOrderEnrichmentService = require("../services/fazatOrderEnrichmentService");
    const enriched = await fazatOrderEnrichmentService.attachPartnerMetaToOrders(
      Array.isArray(result.orders) ? result.orders : [],
    );
    const orders = enriched.map((o) => sanitizeOrderForFreelancerAssigned(o));
    return res.status(200).json({ success: true, data: { ...result, orders } });
  } catch (err) {
    return next(err);
  }
};

const getMyAssignedOrderById = async (req, res, next) => {
  try {
    const order = await ordersService.getFreelancerAssignedOrderById({ freelancerUserId: req.auth.userId, orderId: req.params.id });
    if (!order) return res.status(404).json({ success: false, message: "الطلب غير موجود." });
    const fazatOrderEnrichmentService = require("../services/fazatOrderEnrichmentService");
    const enriched = await fazatOrderEnrichmentService.attachPartnerMetaToOrder(order);
    const safe = sanitizeOrderForFreelancerAssigned(enriched);
    return res.status(200).json({ success: true, data: { order: safe } });
  } catch (err) {
    return next(err);
  }
};

const submitMyOrderDelivery = async (req, res, next) => {
  try {
    const order = await ordersService.submitFreelancerOrderDelivery({
      freelancerUserId: req.auth.userId,
      orderId: req.params.id,
      uploadedFiles: req.files || [],
    });
    await ordersService.enrichOrderWithSubmissionHistory(order, "freelancer");
    capture(String(req.auth.userId), "order_delivered", {
      orderId: String(req.params.id),
      projectType: order.projectType || order.project_type,
    });
    const fazatOrderEnrichmentService = require("../services/fazatOrderEnrichmentService");
    const enriched = await fazatOrderEnrichmentService.attachPartnerMetaToOrder(order);
    const safe = sanitizeOrderForFreelancerAssigned(enriched);
    return res.status(200).json({ success: true, data: { order: safe } });
  } catch (err) {
    return next(err);
  }
};

const downloadFreelancerOrderFile = async (req, res, next) => {
  try {
    const out = await ordersService.prepareFreelancerOrderFileDownload({
      freelancerUserId: req.auth.userId,
      orderId: req.params.id,
      fileId: req.params.fileId,
    });
    return pipeOrderFileToResponse(req, res, next, out);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listPoolOrders,
  getPoolOrderById,
  submitPoolOrderBid,
  getPoolOrderNormalApplicationTokenQuote,
  getPoolOrderNormalApplicationBidQuote,
  upgradePoolOrderBidPriority,
  submitFakePoolOrderBid,
  takeFakePoolOrder,
  takePoolOrder,
  takeUnifiedPoolOrder,
  withdrawPoolOrderClaim,
  listMyAssignedOrders,
  getMyAssignedOrderById,
  submitMyOrderDelivery,
  downloadFreelancerOrderFile,
};
