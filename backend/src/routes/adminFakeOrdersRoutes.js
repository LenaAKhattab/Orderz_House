const express = require("express");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");
const adminFakeOrdersController = require("../controllers/adminFakeOrdersController");

const router = express.Router();

const trainingOrdersGuard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requirePermission(PERMISSION_KEYS.TRAINING_ORDERS),
];

router.get("/training-orders/automation/health", ...trainingOrdersGuard, adminFakeOrdersController.getAutomationHealth);
router.post("/training-orders/automation/tick", ...trainingOrdersGuard, adminFakeOrdersController.runAutomationTickNow);

router.get("/training-orders/settings", ...trainingOrdersGuard, adminFakeOrdersController.getTrainingSettings);
router.patch("/training-orders/settings", ...trainingOrdersGuard, adminFakeOrdersController.patchTrainingSettings);

router.get("/training-orders/templates", ...trainingOrdersGuard, adminFakeOrdersController.listTemplates);
router.post("/training-orders/templates", ...trainingOrdersGuard, adminFakeOrdersController.createTemplate);
router.get("/training-orders/templates/:id", ...trainingOrdersGuard, adminFakeOrdersController.getTemplate);
router.patch("/training-orders/templates/:id", ...trainingOrdersGuard, adminFakeOrdersController.patchTemplate);
router.delete("/training-orders/templates/:id", ...trainingOrdersGuard, adminFakeOrdersController.removeTemplate);

router.get("/training-orders/rounds", ...trainingOrdersGuard, adminFakeOrdersController.listRounds);
router.post("/training-orders/rounds/start", ...trainingOrdersGuard, adminFakeOrdersController.startTrainingRound);
router.post("/training-orders/force-generate", ...trainingOrdersGuard, adminFakeOrdersController.forceGenerateTrainingRound);
router.post("/training-orders/rounds/:id/cancel", ...trainingOrdersGuard, adminFakeOrdersController.cancelRound);

router.get("/training-orders/applications/summary", ...trainingOrdersGuard, adminFakeOrdersController.listApplicationsSummary);
router.get("/training-orders/applications", ...trainingOrdersGuard, adminFakeOrdersController.listApplications);
router.get("/training-orders/fake-orders/:fakeOrderId/applications", ...trainingOrdersGuard, adminFakeOrdersController.listApplicationsByFakeOrder);

module.exports = router;
