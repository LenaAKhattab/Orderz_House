const express = require("express");
const ordersController = require("../controllers/ordersController");
const clientOrdersController = require("../controllers/clientOrdersController");
const validateRequest = require("../middleware/validateRequest");
const { uploadOrderFiles, handleOrderUploadErrors, enforceOrderUploadTotalSize } = require("../middleware/ordersUploadMiddleware");
const { requireAuth, requireRole, optionalAuth } = require("../middleware/rbacMiddleware");
const {
  requireClientOwnsOrderParam,
  requireFreelancerAssignedOrderParam,
  requireFreelancerCanClaimOrderParam,
  requireFreelancerCanBidOrderParam,
  requireFreelancerPoolOrderAccess,
  requireOrderFileAccess,
} = require("../middleware/orderAuthMiddleware");
const {
  listOrdersValidators,
  orderIdParam,
  createClientOrderValidators,
  submitPoolOrderBidValidators,
  clientOrderClaimIdBodyValidators,
  clientOrderBidIdBodyValidators,
  clientOrderBidIdParamValidators,
  clientOrderRevisionNoteValidators,
  clientOrderFileDownloadParams,
} = require("../validators/ordersValidators");
const freelancerReviewsController = require("../controllers/freelancerReviewsController");
const {
  submitClientReviewValidators,
  updateClientReviewValidators,
} = require("../validators/freelancerReviewsValidators");
const {
  clientOrderCreateBurstLimiter,
  clientOrderCreateHourlyLimiter,
  orderBidTakeLimiter,
} = require("../middleware/orderWriteRateLimiters");
const { createOrderConcurrencyGuard } = require("../middleware/orderCreateConcurrency");

const clientOrderCreateConcurrency = createOrderConcurrencyGuard({ maxConcurrent: 1 });

const router = express.Router();

router.get(
  "/client/orders",
  requireAuth,
  requireRole("client"),
  listOrdersValidators,
  validateRequest,
  clientOrdersController.listMyClientOrders,
);

router.get(
  "/client/orders/:id",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.getMyClientOrderById,
);

router.post(
  "/client/orders",
  requireAuth,
  requireRole("client"),
  clientOrderCreateBurstLimiter,
  clientOrderCreateHourlyLimiter,
  clientOrderCreateConcurrency,
  uploadOrderFiles,
  handleOrderUploadErrors,
  enforceOrderUploadTotalSize,
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
  requireClientOwnsOrderParam,
  clientOrdersController.createFixedOrderStripeCheckout,
);

router.post(
  "/client/orders/:id/pay-confirm",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.confirmFixedOrderPayment,
);

router.post(
  "/client/orders/:id/pay-cancel",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.cancelFixedOrderPayment,
);

router.get(
  "/client/orders/:id/claims",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.listClaimsForOrder,
);

router.post(
  "/client/orders/:id/claims/approve",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  clientOrderClaimIdBodyValidators,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.approveFreelancerClaim,
);

router.post(
  "/client/orders/:id/claims/reject",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  clientOrderClaimIdBodyValidators,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.rejectFreelancerClaim,
);

router.get(
  "/client/orders/:id/bids",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.listBidsForOrder,
);

router.post(
  "/client/orders/:id/bids/accept",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  clientOrderBidIdBodyValidators,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.acceptFreelancerBid,
);

router.post(
  "/client/orders/:id/bids/:bidId/select",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  clientOrderBidIdParamValidators,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.selectFreelancerBid,
);

router.post(
  "/client/orders/:id/bids/:bidId/confirm-paid",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  clientOrderBidIdParamValidators,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.confirmSelectedBidPayment,
);

router.post(
  "/client/orders/:id/bids/reject",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  clientOrderBidIdBodyValidators,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.rejectFreelancerBid,
);
router.post(
  "/client/orders/:id/delivery/approve",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.approveDelivery,
);

router.get(
  "/client/orders/:id/review",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  validateRequest,
  requireClientOwnsOrderParam,
  freelancerReviewsController.getClientOrderReviewStatus,
);

router.post(
  "/client/orders/:id/review",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  submitClientReviewValidators,
  validateRequest,
  requireClientOwnsOrderParam,
  freelancerReviewsController.submitClientOrderReview,
);

router.patch(
  "/client/orders/:id/review",
  requireAuth,
  requireRole("client"),
  orderIdParam,
  updateClientReviewValidators,
  validateRequest,
  requireClientOwnsOrderParam,
  freelancerReviewsController.updateClientOrderReview,
);

router.post(
  "/client/orders/:id/delivery/revision",
  requireAuth,
  requireRole("client"),
  uploadOrderFiles,
  handleOrderUploadErrors,
  enforceOrderUploadTotalSize,
  orderIdParam,
  clientOrderRevisionNoteValidators,
  validateRequest,
  requireClientOwnsOrderParam,
  clientOrdersController.requestDeliveryRevision,
);

router.get(
  "/client/orders/:id/files/:fileId/download",
  requireAuth,
  requireRole("client"),
  clientOrderFileDownloadParams,
  validateRequest,
  requireOrderFileAccess,
  clientOrdersController.downloadOrderFile,
);

// Browse: guests get sanitized public list; logged-in freelancers get plan eligibility metadata.
router.get("/orders/pool", optionalAuth, listOrdersValidators, validateRequest, ordersController.listPoolOrders);
router.post(
  "/orders/pool/fake/:id/bids",
  requireAuth,
  requireRole("freelancer"),
  orderBidTakeLimiter,
  orderIdParam,
  submitPoolOrderBidValidators,
  validateRequest,
  ordersController.submitFakePoolOrderBid,
);
router.post(
  "/orders/pool/fake/:id/take",
  requireAuth,
  requireRole("freelancer"),
  orderBidTakeLimiter,
  orderIdParam,
  validateRequest,
  ordersController.takeFakePoolOrder,
);
router.post(
  "/orders/pool/:id/take",
  requireAuth,
  requireRole("freelancer"),
  orderBidTakeLimiter,
  orderIdParam,
  validateRequest,
  ordersController.takeUnifiedPoolOrder,
);
router.post(
  "/orders/pool/:id/bids",
  requireAuth,
  requireRole("freelancer"),
  orderBidTakeLimiter,
  orderIdParam,
  submitPoolOrderBidValidators,
  validateRequest,
  ordersController.submitPoolOrderBid,
);
router.get("/orders/pool/:id", optionalAuth, orderIdParam, validateRequest, ordersController.getPoolOrderById);
router.post(
  "/orders/:id/take",
  requireAuth,
  requireRole("freelancer"),
  orderBidTakeLimiter,
  orderIdParam,
  validateRequest,
  requireFreelancerCanClaimOrderParam,
  ordersController.takePoolOrder,
);
router.delete(
  "/orders/:id/take",
  requireAuth,
  requireRole("freelancer"),
  orderIdParam,
  validateRequest,
  requireFreelancerPoolOrderAccess,
  ordersController.withdrawPoolOrderClaim,
);
router.get("/freelancer/my-orders", requireAuth, requireRole("freelancer"), listOrdersValidators, validateRequest, ordersController.listMyAssignedOrders);
router.get(
  "/freelancer/my-orders/:id",
  requireAuth,
  requireRole("freelancer"),
  orderIdParam,
  validateRequest,
  requireFreelancerAssignedOrderParam,
  ordersController.getMyAssignedOrderById,
);
router.post(
  "/freelancer/my-orders/:id/delivery",
  requireAuth,
  requireRole("freelancer"),
  uploadOrderFiles,
  handleOrderUploadErrors,
  enforceOrderUploadTotalSize,
  orderIdParam,
  validateRequest,
  requireFreelancerAssignedOrderParam,
  ordersController.submitMyOrderDelivery,
);
router.get(
  "/freelancer/my-orders/:id/files/:fileId/download",
  requireAuth,
  requireRole("freelancer"),
  clientOrderFileDownloadParams,
  validateRequest,
  requireOrderFileAccess,
  ordersController.downloadFreelancerOrderFile,
);

module.exports = router;

