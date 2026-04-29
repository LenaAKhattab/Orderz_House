const express = require("express");
const { requireAuth, requireAnyRole } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const adminFakeOrdersController = require("../controllers/adminFakeOrdersController");
const {
  roundIdParam,
  templateIdParam,
  createTemplateValidators,
  updateTemplateValidators,
  createRoundValidators,
  listRoundsValidators,
  listTemplatesValidators,
  updateSettingsValidators,
} = require("../validators/fakeOrdersValidators");

const router = express.Router();

router.use(requireAuth, requireAnyRole(["admin", "super_admin"]));

router.post("/fake-orders/templates", createTemplateValidators, validateRequest, adminFakeOrdersController.createTemplate);
router.get("/fake-orders/templates", listTemplatesValidators, validateRequest, adminFakeOrdersController.listTemplates);
router.patch("/fake-orders/templates/:id", updateTemplateValidators, validateRequest, adminFakeOrdersController.updateTemplate);
router.delete("/fake-orders/templates/:id", templateIdParam, validateRequest, adminFakeOrdersController.deactivateTemplate);

router.get("/fake-orders/settings", adminFakeOrdersController.getSettings);
router.patch("/fake-orders/settings", updateSettingsValidators, validateRequest, adminFakeOrdersController.updateSettings);

router.post("/fake-orders/rounds", createRoundValidators, validateRequest, adminFakeOrdersController.createRound);
router.get("/fake-orders/rounds", listRoundsValidators, validateRequest, adminFakeOrdersController.listRounds);
router.get("/fake-orders/rounds/:id", roundIdParam, validateRequest, adminFakeOrdersController.getRound);
router.post("/fake-orders/rounds/:id/stop", roundIdParam, validateRequest, adminFakeOrdersController.stopRound);
router.get("/fake-orders/rounds/:id/analytics", roundIdParam, validateRequest, adminFakeOrdersController.roundAnalytics);

module.exports = router;
