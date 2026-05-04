const express = require("express");
const adminOrdersController = require("../controllers/adminOrdersController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireAnyRole } = require("../middleware/rbacMiddleware");
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

const router = express.Router();

// admin + super_admin only
router.use(requireAuth, requireAnyRole(["super_admin", "admin"]));

router.get("/orders", listOrdersValidators, validateRequest, adminOrdersController.listInternalOrders);
router.get("/orders/:id", orderIdParam, validateRequest, adminOrdersController.getInternalOrder);
router.get("/freelancers", adminFreelancersSearchValidators, validateRequest, adminOrdersController.searchFreelancers);
router.get(
  "/freelancers/:id/registration",
  freelancerUserIdParam,
  validateRequest,
  adminOrdersController.getFreelancerRegistrationProfile,
);
router.post(
  "/orders",
  uploadOrderFiles,
  handleOrderUploadErrors,
  enforceOrderUploadTotalSize,
  createInternalOrderValidators,
  validateRequest,
  adminOrdersController.createInternalOrder,
);

router.patch("/orders/:id/activate", orderIdParam, validateRequest, adminOrdersController.activateArchivedOrder);
router.get(
  "/orders/:id/bids",
  orderIdParam,
  validateRequest,
  adminOrdersController.listInternalOrderBids,
);
router.post(
  "/orders/:id/bids/:bidId/approve",
  orderIdParam,
  ...clientOrderBidIdParamValidators,
  validateRequest,
  adminOrdersController.approveInternalPricedBid,
);
router.get("/orders/:id/claims", orderIdParam, validateRequest, adminOrdersController.listOrderClaims);
router.patch(
  "/orders/:id/accept",
  orderIdParam,
  ...clientOrderClaimIdBodyValidators,
  validateRequest,
  adminOrdersController.acceptTakenOrder,
);
router.post("/orders/:id/delivery/approve", orderIdParam, validateRequest, adminOrdersController.approveInternalDelivery);
router.post(
  "/orders/:id/delivery/revision",
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
  clientOrderFileDownloadParams,
  validateRequest,
  adminOrdersController.downloadInternalOrderFile,
);

module.exports = router;

