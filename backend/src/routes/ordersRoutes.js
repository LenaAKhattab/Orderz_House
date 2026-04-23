const express = require("express");
const ordersController = require("../controllers/ordersController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireRole, optionalAuth } = require("../middleware/rbacMiddleware");
const { listOrdersValidators, orderIdParam } = require("../validators/ordersValidators");

const router = express.Router();

// Pool browsing is public; if Authorization header exists, we attach `myClaim` in the controller.
router.get("/orders/pool", optionalAuth, listOrdersValidators, validateRequest, ordersController.listPoolOrders);
router.get("/orders/pool/:id", optionalAuth, orderIdParam, validateRequest, ordersController.getPoolOrderById);
router.post("/orders/:id/take", requireAuth, requireRole("freelancer"), orderIdParam, validateRequest, ordersController.takePoolOrder);
router.delete("/orders/:id/take", requireAuth, requireRole("freelancer"), orderIdParam, validateRequest, ordersController.withdrawPoolOrderClaim);
router.get("/freelancer/my-orders", requireAuth, requireRole("freelancer"), listOrdersValidators, validateRequest, ordersController.listMyAssignedOrders);
router.get("/freelancer/my-orders/:id", requireAuth, requireRole("freelancer"), orderIdParam, validateRequest, ordersController.getMyAssignedOrderById);

module.exports = router;

