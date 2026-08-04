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
    return res.status(200).json({ success: true, data: { ...result, orders } });
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
    const order = await ordersService.submitPoolOrderBid({
      freelancerUserId: req.auth.userId,
      orderId: req.params.id,
      amount: req.body.amount,
      message: req.body.message || null,
    });
    capture(String(req.auth.userId), "bid_submitted", {
      orderId: String(req.params.id),
      amount: req.body.amount,
    });
    const myBid = await ordersService.getMyOrderBid({ orderId: req.params.id, freelancerUserId: req.auth.userId });
    const myClaim = await ordersService.getMyOrderClaim({ orderId: req.params.id, freelancerUserId: req.auth.userId });
    const safe = sanitizeFreelancerPoolOrder({ ...order, myBid, myClaim });
    return res.status(200).json({ success: true, data: { order: safe } });
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
