const express = require("express");
const adminOrdersController = require("../controllers/adminOrdersController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireAnyRole, requirePermission, requireAnyPermission } = require("../middleware/rbacMiddleware");
const { uploadOrderFiles, handleOrderUploadErrors, enforceOrderUploadTotalSize } = require("../middleware/ordersUploadMiddleware");
const {
  listOrdersValidators,
  adminFreelancersSearchValidators,
  createInternalOrderValidators,
  orderIdParam,
  clientOrderClaimIdBodyValidators,
  clientOrderRevisionNoteValidators,
  clientOrderFileDownloadParams,
  freelancerUserIdParam,
  clientOrderBidIdParamValidators,
} = require("../validators/ordersValidators");
const { adminOrderCreateLimiter } = require("../middleware/orderWriteRateLimiters");
const { createOrderConcurrencyGuard } = require("../middleware/orderCreateConcurrency");

const adminOrderCreateConcurrency = createOrderConcurrencyGuard({ maxConcurrent: 2 });

const router = express.Router();

// admin + super_admin only
router.use(requireAuth, requireAnyRole(["super_admin", "admin"]));

const ordersPerm = requirePermission("dashboard.admin.orders");
const createOrderPerm = requirePermission("dashboard.admin.create_order");
const freelancersSearchPerm = requireAnyPermission([
  "dashboard.admin.orders",
  "dashboard.super_admin.subscriptions",
]);

router.get("/orders", ordersPerm, listOrdersValidators, validateRequest, adminOrdersController.listInternalOrders);
router.get("/orders/:id", ordersPerm, orderIdParam, validateRequest, adminOrdersController.getInternalOrder);
router.get("/freelancers", freelancersSearchPerm, adminFreelancersSearchValidators, validateRequest, adminOrdersController.searchFreelancers);
router.get(
  "/freelancers/:id/registration",
  ordersPerm,
  freelancerUserIdParam,
  validateRequest,
  adminOrdersController.getFreelancerRegistrationProfile,
);
router.post(
  "/orders",
  createOrderPerm,
  adminOrderCreateLimiter,
  adminOrderCreateConcurrency,
  uploadOrderFiles,
  handleOrderUploadErrors,
  enforceOrderUploadTotalSize,
  createInternalOrderValidators,
  validateRequest,
  adminOrdersController.createInternalOrder,
);

router.patch("/orders/:id/activate", ordersPerm, orderIdParam, validateRequest, adminOrdersController.activateArchivedOrder);
router.get(
  "/orders/:id/bids",
  ordersPerm,
  orderIdParam,
  validateRequest,
  adminOrdersController.listInternalOrderBids,
);
router.post(
  "/orders/:id/bids/:bidId/approve",
  ordersPerm,
  orderIdParam,
  ...clientOrderBidIdParamValidators,
  validateRequest,
  adminOrdersController.approveInternalPricedBid,
);
router.post(
  "/orders/:id/cancel-without-selection",
  ordersPerm,
  orderIdParam,
  validateRequest,
  adminOrdersController.cancelOpenBiddingOrderWithoutSelection,
);
router.patch(
  "/orders/:id/economic-fields",
  ordersPerm,
  orderIdParam,
  validateRequest,
  adminOrdersController.patchOrderEconomicFields,
);
router.get("/orders/:id/claims", ordersPerm, orderIdParam, validateRequest, adminOrdersController.listOrderClaims);
router.patch(
  "/orders/:id/accept",
  ordersPerm,
  orderIdParam,
  ...clientOrderClaimIdBodyValidators,
  validateRequest,
  adminOrdersController.acceptTakenOrder,
);
router.post("/orders/:id/delivery/approve", ordersPerm, orderIdParam, validateRequest, adminOrdersController.approveInternalDelivery);
router.post(
  "/orders/:id/delivery/revision",
  ordersPerm,
  uploadOrderFiles,
  handleOrderUploadErrors,
  enforceOrderUploadTotalSize,
  orderIdParam,
  clientOrderRevisionNoteValidators,
  validateRequest,
  adminOrdersController.requestInternalDeliveryRevision,
);
router.get(
  "/orders/:id/files/:fileId/download",
  ordersPerm,
  clientOrderFileDownloadParams,
  validateRequest,
  adminOrdersController.downloadInternalOrderFile,
);

module.exports = router;

