const ordersService = require("../services/ordersService");
const stripeCheckoutService = require("../services/stripeCheckoutService");
const { sanitizeOrderForClient } = require("../utils/orderViewerSanitize");
const { pipeOrderFileToResponse } = require("../utils/pipeOrderFileDownload");
const { capture, captureException } = require("../config/posthog");

function parsePreferredSkills(raw) {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
}

const getMyClientOrderById = async (req, res, next) => {
  try {
    const order = await ordersService.getClientOrderByIdForOwner({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
    });
    if (!order) {
      return res.status(404).json({ success: false, message: "الطلب غير موجود." });
    }
    return res.status(200).json({ success: true, data: { order: sanitizeOrderForClient(order) } });
  } catch (err) {
    return next(err);
  }
};

const listMyClientOrders = async (req, res, next) => {
  try {
    const orders = await ordersService.listClientOrders({
      clientUserId: req.auth.userId,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json({ success: true, data: { orders } });
  } catch (err) {
    return next(err);
  }
};

const createClientOrder = async (req, res, next) => {
  try {
    const type = String(req.body.projectType || "").trim();
    const payload = {
      orderCode: req.body.orderCode || null,
      title: req.body.title,
      description: req.body.description,
      categoryId: req.body.categoryId,
      subcategoryId: req.body.subcategoryId || null,
      subSubcategoryId: req.body.subSubcategoryId || null,
      projectType: type,
      budget: type === "fixed" ? req.body.budget : null,
      bidBudgetMin: type === "bidding" ? req.body.bidBudgetMin : null,
      bidBudgetMax: type === "bidding" ? req.body.bidBudgetMax : null,
      durationValue: req.body.durationValue,
      durationUnit: req.body.durationUnit,
      preferredSkills: parsePreferredSkills(req.body.preferredSkills),
    };

    const order = await ordersService.createClientOrder({
      clientUserId: req.auth.userId,
      payload,
      uploadedFiles: req.files || [],
    });
    capture(String(req.auth.userId), "client_order_created", {
      orderId: String(order.id),
      projectType: type,
      categoryId: req.body.categoryId,
      budget: type === "fixed" ? req.body.budget : null,
    });
    const safeOrder = sanitizeOrderForClient(order);
    if (type === "fixed") {
      let checkout;
      try {
        checkout = await stripeCheckoutService.createClientFixedOrderCheckoutSession({
          clientUserId: req.auth.userId,
          orderId: order.id,
        });
      } catch (checkoutErr) {
        try {
          await ordersService.purgeClientUnpaidFixedOrderDraft({
            clientUserId: req.auth.userId,
            orderId: order.id,
          });
        } catch {
          // ignore cleanup error; return original checkout error
        }
        throw checkoutErr;
      }
      return res.status(201).json({
        success: true,
        data: {
          order: safeOrder,
          requiresPayment: true,
          paymentPurpose: "fixed_order_creation",
          checkoutUrl: checkout.checkoutUrl,
          sessionId: checkout.sessionId,
        },
      });
    }
    return res.status(201).json({
      success: true,
      data: {
        order: safeOrder,
        requiresPayment: false,
      },
    });
  } catch (err) {
    captureException(err, req.auth?.userId ? String(req.auth.userId) : undefined);
    return next(err);
  }
};

const confirmFixedOrderPayment = async (req, res, next) => {
  try {
    const out = await stripeCheckoutService.confirmClientFixedOrderPayment({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const cancelFixedOrderPayment = async (req, res, next) => {
  try {
    const out = await stripeCheckoutService.cancelClientFixedOrderPaymentAttempt({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const listClaimsForOrder = async (req, res, next) => {
  try {
    const out = await ordersService.listOrderClaimsForClient({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const approveFreelancerClaim = async (req, res, next) => {
  try {
    const order = await ordersService.approvePoolClaimClient({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      claimId: req.body.claimId,
    });
    return res.status(200).json({ success: true, data: { order: sanitizeOrderForClient(order) } });
  } catch (err) {
    return next(err);
  }
};

const rejectFreelancerClaim = async (req, res, next) => {
  try {
    const out = await ordersService.rejectPoolClaimClient({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      claimId: req.body.claimId,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const listBidsForOrder = async (req, res, next) => {
  try {
    const out = await ordersService.listOrderBidsForClient({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const acceptFreelancerBid = async (req, res, next) => {
  try {
    const out = await stripeCheckoutService.createClientSelectedBidCheckoutSession({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      bidId: req.body.bidId,
    });
    capture(String(req.auth.userId), "bid_approved", {
      orderId: String(req.params.id),
      bidId: String(req.body.bidId),
    });
    return res.status(200).json({
      success: true,
      data: {
        requiresPayment: true,
        paymentPurpose: "selected_bid_payment",
        checkoutUrl: out.checkoutUrl,
        sessionId: out.sessionId,
      },
    });
  } catch (err) {
    return next(err);
  }
};

const rejectFreelancerBid = async (req, res, next) => {
  try {
    const out = await ordersService.rejectFreelancerBidClient({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      bidId: req.body.bidId,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const selectFreelancerBid = async (req, res, next) => {
  try {
    const out = await stripeCheckoutService.createClientSelectedBidCheckoutSession({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      bidId: req.params.bidId,
    });
    capture(String(req.auth.userId), "bid_approved", {
      orderId: String(req.params.id),
      bidId: String(req.params.bidId),
    });
    return res.status(200).json({
      success: true,
      data: {
        requiresPayment: true,
        paymentPurpose: "selected_bid_payment",
        checkoutUrl: out.checkoutUrl,
        sessionId: out.sessionId,
      },
    });
  } catch (err) {
    return next(err);
  }
};

const confirmSelectedBidPayment = async (req, res, next) => {
  try {
    const out = await stripeCheckoutService.confirmClientSelectedBidPayment({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      bidId: req.params.bidId,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};
const approveDelivery = async (req, res, next) => {
  try {
    const order = await ordersService.clientApproveDelivery({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
    });
    await ordersService.enrichOrderWithSubmissionHistory(order, "client");
    capture(String(req.auth.userId), "order_completed", {
      orderId: String(req.params.id),
      projectType: order.projectType || order.project_type,
    });
    return res.status(200).json({ success: true, data: { order: sanitizeOrderForClient(order) } });
  } catch (err) {
    return next(err);
  }
};

const requestDeliveryRevision = async (req, res, next) => {
  try {
    const order = await ordersService.clientRequestDeliveryRevision({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      note: req.body.note,
      uploadedFiles: req.files || [],
    });
    await ordersService.enrichOrderWithSubmissionHistory(order, "client");
    capture(String(req.auth.userId), "delivery_revision_requested", {
      orderId: String(req.params.id),
    });
    return res.status(200).json({ success: true, data: { order: sanitizeOrderForClient(order) } });
  } catch (err) {
    return next(err);
  }
};

const createFixedOrderStripeCheckout = async (req, res, next) => {
  try {
    const out = await stripeCheckoutService.createClientFixedOrderCheckoutSession({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};
const downloadOrderFile = async (req, res, next) => {
  try {
    const out = await ordersService.prepareClientOrderFileDownload({
      clientUserId: req.auth.userId,
      orderId: req.params.id,
      fileId: req.params.fileId,
    });
    return pipeOrderFileToResponse(req, res, next, out);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getMyClientOrderById,
  listMyClientOrders,
  createClientOrder,
  confirmFixedOrderPayment,
  cancelFixedOrderPayment,
  listClaimsForOrder,
  approveFreelancerClaim,
  rejectFreelancerClaim,
  listBidsForOrder,
  acceptFreelancerBid,
  rejectFreelancerBid,
  selectFreelancerBid,
  confirmSelectedBidPayment,
  createFixedOrderStripeCheckout,
  approveDelivery,
  requestDeliveryRevision,
  downloadOrderFile,
};
