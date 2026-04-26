const express = require("express");
const ordersController = require("../controllers/ordersController");
const clientOrdersController = require("../controllers/clientOrdersController");
const validateRequest = require("../middleware/validateRequest");
const { uploadOrderFiles, handleOrderUploadErrors } = require("../middleware/ordersUploadMiddleware");
const { requireAuth, requireRole, optionalAuth } = require("../middleware/rbacMiddleware");
const {
  listOrdersValidators,
  orderIdParam,
  createClientOrderValidators,
  submitPoolOrderBidValidators,
  clientOrderClaimIdBodyValidators,
  clientOrderRevisionNoteValidators,
  clientOrderFileDownloadParams,
} = require("../validators/ordersValidators");

const router = express.Router();

router.get(
  "/client/orders",
  requireAuth,
  requireRole("client"),
  listOrdersValidators,
  validateRequest,
  clientOrdersController.listMyClientOrders,
);

router.post(
  "/client/orders",
  requireAuth,
  requireRole("client"),
  uploadOrderFiles,
  handleOrderUploadErrors,
  createClientOrderValidators,
  validateRequest,
  clientOrdersController.createClientOrder,
);

router.post(
  "/client/orders/:id/pay-checkout",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  validateRequest,
  clientOrdersController.createFixedOrderStripeCheckout,
);

router.get(
  "/client/orders/:id/claims",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  validateRequest,
  clientOrdersController.listClaimsForOrder,
);

router.post(
  "/client/orders/:id/claims/approve",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  clientOrderClaimIdBodyValidators,
  validateRequest,
  clientOrdersController.approveFreelancerClaim,
);

router.post(
  "/client/orders/:id/claims/reject",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  clientOrderClaimIdBodyValidators,
  validateRequest,
  clientOrdersController.rejectFreelancerClaim,
);

router.post(
  "/client/orders/:id/delivery/approve",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  validateRequest,
  clientOrdersController.approveDelivery,
);

router.post(
  "/client/orders/:id/delivery/revision",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  clientOrderRevisionNoteValidators,
  validateRequest,
  clientOrdersController.requestDeliveryRevision,
);

router.get(
  "/client/orders/:id/files/:fileId/download",
  requireAuth,
  requireRole("client"),
  clientOrderFileDownloadParams,
  validateRequest,
  clientOrdersController.downloadOrderFile,
);

// Pool browsing is public; if Authorization header exists, we attach `myClaim` in the controller.
router.get("/orders/pool", optionalAuth, listOrdersValidators, validateRequest, ordersController.listPoolOrders);
router.post(
  "/orders/pool/:id/bids",
  requireAuth,
  requireRole("freelancer"),
  orderIdParam,
  submitPoolOrderBidValidators,
  validateRequest,
  ordersController.submitPoolOrderBid,
);
router.get("/orders/pool/:id", optionalAuth, orderIdParam, validateRequest, ordersController.getPoolOrderById);
router.post("/orders/:id/take", requireAuth, requireRole("freelancer"), orderIdParam, validateRequest, ordersController.takePoolOrder);
router.delete("/orders/:id/take", requireAuth, requireRole("freelancer"), orderIdParam, validateRequest, ordersController.withdrawPoolOrderClaim);
router.get("/freelancer/my-orders", requireAuth, requireRole("freelancer"), listOrdersValidators, validateRequest, ordersController.listMyAssignedOrders);
router.get("/freelancer/my-orders/:id", requireAuth, requireRole("freelancer"), orderIdParam, validateRequest, ordersController.getMyAssignedOrderById);
router.post(
  "/freelancer/my-orders/:id/delivery",
  requireAuth,
  requireRole("freelancer"),
  uploadOrderFiles,
  handleOrderUploadErrors,
  orderIdParam,
  validateRequest,
  ordersController.submitMyOrderDelivery,
);

module.exports = router;

