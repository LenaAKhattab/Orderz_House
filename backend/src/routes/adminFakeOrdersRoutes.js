const express = require("express");
const adminFakeOrdersController = require("../controllers/adminFakeOrdersController");
const { requireAuth, requireAnyRole } = require("../middleware/rbacMiddleware");

const router = express.Router();

router.use(requireAuth, requireAnyRole(["super_admin", "admin"]));

router.get("/training-orders/settings", adminFakeOrdersController.getTrainingSettings);
router.patch("/training-orders/settings", adminFakeOrdersController.patchTrainingSettings);

router.get("/training-orders/templates", adminFakeOrdersController.listTemplates);
router.post("/training-orders/templates", adminFakeOrdersController.createTemplate);
router.get("/training-orders/templates/:id", adminFakeOrdersController.getTemplate);
router.patch("/training-orders/templates/:id", adminFakeOrdersController.patchTemplate);
router.delete("/training-orders/templates/:id", adminFakeOrdersController.removeTemplate);

router.get("/training-orders/rounds", adminFakeOrdersController.listRounds);
router.post("/training-orders/rounds/start", adminFakeOrdersController.startTrainingRound);
router.post("/training-orders/force-generate", adminFakeOrdersController.forceGenerateTrainingRound);
router.post("/training-orders/rounds/:id/cancel", adminFakeOrdersController.cancelRound);

router.get("/training-orders/applications/summary", adminFakeOrdersController.listApplicationsSummary);
router.get("/training-orders/applications", adminFakeOrdersController.listApplications);
router.get("/training-orders/fake-orders/:fakeOrderId/applications", adminFakeOrdersController.listApplicationsByFakeOrder);

module.exports = router;
