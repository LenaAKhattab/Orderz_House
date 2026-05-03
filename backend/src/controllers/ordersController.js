const ordersService = require("../services/ordersService");
const orderFlowService = require("../services/orderFlowService");
const fakeOrdersService = require("../services/fakeOrdersService");
const { sanitizePublicPoolOrder, sanitizeFreelancerPoolOrder } = require("../utils/poolOrderSanitize");

const listPoolOrders = async (req, res, next) => {
  try {
    const freelancerUserId = req.auth?.userId || null;
    const role = req.auth?.primaryRole || req.auth?.role || null;
    const result = freelancerUserId
      ? await ordersService.listPoolOrdersForFreelancer({
          freelancerUserId,
          viewerRole: role,
          page: req.query.page,
          limit: req.query.limit,
          offset: req.query.offset,
          status: req.query.status,
          projectType: req.query.projectType,
          categoryId: req.query.categoryId,
          subSubCategoryIds: req.query.subSubCategoryIds,
          sort: req.query.sort,
          q: req.query.q,
        })
      : await ordersService.listPoolOrders({
          viewerUserId: req.auth?.userId ?? null,
          viewerRole: role,
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
    const orders = Array.isArray(result.orders)
      ? result.orders.map((o) =>
          freelancerUserId ? sanitizeFreelancerPoolOrder(o) : sanitizePublicPoolOrder(o),
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
    return res.status(200).json({ success: true, data: { order } });
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
    if (String(req.query.source || "").toLowerCase() === "fake") {
      const maySee = await fakeOrdersService.poolViewerMaySeeFakeOrders({
        userId: req.auth?.userId ?? null,
        role: req.auth?.primaryRole || req.auth?.role || null,
      });
      if (!maySee) {
        return res.status(404).json({ success: false, message: "Order not found." });
      }
      const order = await fakeOrdersService.getFakePoolOrderMapped({
        orderId: req.params.id,
        freelancerUserId: req.auth?.userId || null,
      });
      if (!order) return res.status(404).json({ success: false, message: "Order not found." });
      const viewerId = req.auth?.userId || null;
      const safe = viewerId ? sanitizeFreelancerPoolOrder(order) : sanitizePublicPoolOrder(order);
      return res.status(200).json({ success: true, data: { order: safe } });
    }
    const order = await ordersService.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    if (!["admin_created", "super_admin_created", "client_created"].includes(order.sourceType)) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }
    // If it's not currently in the pool, hide it from this endpoint.
    if (!orderFlowService.orderApiEligibleForFreelancerPool(order)) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }
    const freelancerUserId = req.auth?.userId || null;
    if (freelancerUserId) {
      const myClaim = await ordersService.getMyOrderClaim({ orderId: req.params.id, freelancerUserId });
      let myBid = null;
      if (order.projectType === "bidding" && order.bidBudgetMin != null && order.bidBudgetMax != null) {
        myBid = await ordersService.getMyOrderBid({ orderId: req.params.id, freelancerUserId });
      }
      const merged = { ...order, myClaim, myBid };
      return res.status(200).json({ success: true, data: { order: sanitizeFreelancerPoolOrder(merged) } });
    }
    return res.status(200).json({ success: true, data: { order: sanitizePublicPoolOrder(order) } });
  } catch (err) {
    return next(err);
  }
};

const submitPoolOrderBid = async (req, res, next) => {
  try {
    const order = await ordersService.submitPoolOrderBid({
      freelancerUserId: req.auth.userId,
      orderId: req.params.id,
      amount: req.body.amount,
      message: req.body.message || null,
    });
    return res.status(200).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

const submitFakePoolOrderBid = async (req, res, next) => {
  try {
    await fakeOrdersService.submitFakeTrainingBid({
      freelancerUserId: req.auth.userId,
      orderId: req.params.id,
      amount: req.body.amount,
      message: req.body.message || null,
    });
    const order = await fakeOrdersService.getFakePoolOrderMapped({
      orderId: req.params.id,
      freelancerUserId: req.auth.userId,
    });
    return res.status(200).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

const takeFakePoolOrder = async (req, res, next) => {
  try {
    await fakeOrdersService.submitFakeTrainingClaim({
      freelancerUserId: req.auth.userId,
      orderId: req.params.id,
      message: req.body?.message || null,
    });
    const order = await fakeOrdersService.getFakePoolOrderMapped({
      orderId: req.params.id,
      freelancerUserId: req.auth.userId,
    });
    return res.status(200).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

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
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
};

const getMyAssignedOrderById = async (req, res, next) => {
  try {
    const order = await ordersService.getFreelancerAssignedOrderById({ freelancerUserId: req.auth.userId, orderId: req.params.id });
    if (!order) return res.status(404).json({ success: false, message: "الطلب غير موجود." });
    return res.status(200).json({ success: true, data: { order } });
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
    return res.status(200).json({ success: true, data: { order } });
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
  withdrawPoolOrderClaim,
  listMyAssignedOrders,
  getMyAssignedOrderById,
  submitMyOrderDelivery,
};

