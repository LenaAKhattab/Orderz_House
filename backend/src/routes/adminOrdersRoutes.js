const express = require("express");
const adminOrdersController = require("../controllers/adminOrdersController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireAnyRole } = require("../middleware/rbacMiddleware");
const { uploadOrderFiles, handleOrderUploadErrors } = require("../middleware/ordersUploadMiddleware");
const { listOrdersValidators, createInternalOrderValidators, orderIdParam } = require("../validators/ordersValidators");

const router = express.Router();

// admin + super_admin only
router.use(requireAuth, requireAnyRole(["super_admin", "admin"]));

router.get("/orders", listOrdersValidators, validateRequest, adminOrdersController.listInternalOrders);
router.get("/freelancers", adminOrdersController.searchFreelancers);
router.post(
  "/orders",
  uploadOrderFiles,
  handleOrderUploadErrors,
  createInternalOrderValidators,
  validateRequest,
  adminOrdersController.createInternalOrder,
);

router.patch("/orders/:id/activate", orderIdParam, validateRequest, adminOrdersController.activateArchivedOrder);
router.get("/orders/:id/claims", orderIdParam, validateRequest, adminOrdersController.listOrderClaims);
router.patch("/orders/:id/accept", orderIdParam, validateRequest, adminOrdersController.acceptTakenOrder);

module.exports = router;

