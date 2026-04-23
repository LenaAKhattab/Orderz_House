const ordersService = require("../services/ordersService");

const listPoolOrders = async (req, res, next) => {
  try {
    const freelancerUserId = req.auth?.userId || null;
    const orders = freelancerUserId
      ? await ordersService.listPoolOrdersForFreelancer({ freelancerUserId, limit: req.query.limit, offset: req.query.offset })
      : await ordersService.listPoolOrders({ limit: req.query.limit, offset: req.query.offset });
    return res.status(200).json({ success: true, data: { orders } });
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
    const order = await ordersService.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    // Only expose internal pool orders (admin-created) through this endpoint.
    if (!["admin_created", "super_admin_created"].includes(order.sourceType)) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }
    // If it's not currently in the pool, hide it from this endpoint.
    if (!(order.isPublished && order.isOpenForPool && !order.assignedFreelancerId && order.orderStatus === "published")) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }
    const freelancerUserId = req.auth?.userId || null;
    if (freelancerUserId) {
      const myClaim = await ordersService.getMyOrderClaim({ orderId: req.params.id, freelancerUserId });
      return res.status(200).json({ success: true, data: { order: { ...order, myClaim } } });
    }
    return res.status(200).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

const listMyAssignedOrders = async (req, res, next) => {
  try {
    const orders = await ordersService.listFreelancerAssignedOrders({
      freelancerUserId: req.auth.userId,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json({ success: true, data: { orders } });
  } catch (err) {
    return next(err);
  }
};

const getMyAssignedOrderById = async (req, res, next) => {
  try {
    const order = await ordersService.getFreelancerAssignedOrderById({ freelancerUserId: req.auth.userId, orderId: req.params.id });
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    return res.status(200).json({ success: true, data: { order } });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listPoolOrders,
  getPoolOrderById,
  takePoolOrder,
  withdrawPoolOrderClaim,
  listMyAssignedOrders,
  getMyAssignedOrderById,
};

