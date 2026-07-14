const express = require("express");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");
const adminFakeOrdersController = require("../controllers/adminFakeOrdersController");
const {
  adminOrderCreateLimiter,
  trainingBulkGenerateLimiter,
  adminWriteLimiter,
} = require("../middleware/orderWriteRateLimiters");
const { createOrderConcurrencyGuard } = require("../middleware/orderCreateConcurrency");

const router = express.Router();

const trainingOrdersGuard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requirePermission(PERMISSION_KEYS.TRAINING_ORDERS),
];

const fakeOrderCreateConcurrency = createOrderConcurrencyGuard({ maxConcurrent: 2 });

router.get("/training-orders/automation/health", ...trainingOrdersGuard, adminFakeOrdersController.getAutomationHealth);
router.get("/training-orders/health/readiness", ...trainingOrdersGuard, adminFakeOrdersController.getTrainingReadiness);
router.get("/training-orders/visible-orders", ...trainingOrdersGuard, adminFakeOrdersController.listVisibleOrders);
router.post(
  "/training-orders/automation/tick",
  ...trainingOrdersGuard,
  adminWriteLimiter,
  adminFakeOrdersController.runAutomationTickNow,
);

router.get("/training-orders/settings", ...trainingOrdersGuard, adminFakeOrdersController.getTrainingSettings);
router.patch(
  "/training-orders/settings",
  ...trainingOrdersGuard,
  adminWriteLimiter,
  adminFakeOrdersController.patchTrainingSettings,
);

// Legacy fake_order_templates — read-only for admin UI. Mutations require X-Internal-Template-Mutation: allow
// (or ALLOW_ADMIN_TEMPLATE_HTTP_MUTATION=true). Admin manual orders must use POST /training-orders/fake-orders.
router.get("/training-orders/templates", ...trainingOrdersGuard, adminFakeOrdersController.listTemplates);
router.post(
  "/training-orders/templates",
  ...trainingOrdersGuard,
  adminWriteLimiter,
  adminFakeOrdersController.createTemplate,
);
router.get("/training-orders/templates/:id", ...trainingOrdersGuard, adminFakeOrdersController.getTemplate);
router.patch(
  "/training-orders/templates/:id",
  ...trainingOrdersGuard,
  adminWriteLimiter,
  adminFakeOrdersController.patchTemplate,
);
router.delete(
  "/training-orders/templates/:id",
  ...trainingOrdersGuard,
  adminWriteLimiter,
  adminFakeOrdersController.removeTemplate,
);

router.get("/training-orders/rounds", ...trainingOrdersGuard, adminFakeOrdersController.listRounds);
router.post(
  "/training-orders/rounds/start",
  ...trainingOrdersGuard,
  trainingBulkGenerateLimiter,
  adminFakeOrdersController.startTrainingRound,
);
router.post(
  "/training-orders/force-generate",
  ...trainingOrdersGuard,
  trainingBulkGenerateLimiter,
  adminFakeOrdersController.forceGenerateTrainingRound,
);
router.post(
  "/training-orders/rounds/:id/cancel",
  ...trainingOrdersGuard,
  adminWriteLimiter,
  adminFakeOrdersController.cancelRound,
);

router.get("/training-orders/applications/summary", ...trainingOrdersGuard, adminFakeOrdersController.listApplicationsSummary);
router.get("/training-orders/applications", ...trainingOrdersGuard, adminFakeOrdersController.listApplications);
router.get("/training-orders/fake-orders/count", ...trainingOrdersGuard, adminFakeOrdersController.getFakeOrdersCount);
router.get("/training-orders/fake-orders", ...trainingOrdersGuard, adminFakeOrdersController.listFakeOrders);
router.post(
  "/training-orders/fake-orders",
  ...trainingOrdersGuard,
  adminOrderCreateLimiter,
  fakeOrderCreateConcurrency,
  adminFakeOrdersController.createFakeOrder,
);
router.get(
  "/training-orders/fake-orders/:fakeOrderId/applications",
  ...trainingOrdersGuard,
  adminFakeOrdersController.listApplicationsByFakeOrder,
);
router.get("/training-orders/fake-orders/:id", ...trainingOrdersGuard, adminFakeOrdersController.getFakeOrder);
router.patch(
  "/training-orders/fake-orders/:id",
  ...trainingOrdersGuard,
  adminWriteLimiter,
  adminFakeOrdersController.patchFakeOrder,
);
router.patch(
  "/training-orders/fake-orders/:id/hide-current-round",
  ...trainingOrdersGuard,
  adminWriteLimiter,
  adminFakeOrdersController.hideFakeOrderFromCurrentRound,
);
router.delete(
  "/training-orders/fake-orders/:id",
  ...trainingOrdersGuard,
  adminWriteLimiter,
  adminFakeOrdersController.removeFakeOrder,
);

module.exports = router;
