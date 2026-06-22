const express = require("express");
const planPagesController = require("../controllers/planPagesController");
const planFeaturesController = require("../controllers/planFeaturesController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");
const {
  listPlanPagesValidators,
  createPlanPageValidators,
  updatePlanPageValidators,
  planPageIdParam,
  replacePlanFeaturesValidators,
  planFeaturesPlanIdParam,
} = require("../validators/planPagesValidators");

const router = express.Router();

const staffRoles = [requireAuth, requireAnyRole(["admin", "super_admin"])];
const plansGuard = [...staffRoles, requirePermission(PERMISSION_KEYS.PLANS)];

router.get("/plan-pages", ...plansGuard, listPlanPagesValidators, validateRequest, planPagesController.listAdminPlanPages);
router.post("/plan-pages", ...plansGuard, createPlanPageValidators, validateRequest, planPagesController.createPlanPage);
router.patch(
  "/plan-pages/:id",
  ...plansGuard,
  updatePlanPageValidators,
  validateRequest,
  planPagesController.updatePlanPage,
);
router.delete(
  "/plan-pages/:id",
  ...plansGuard,
  planPageIdParam,
  validateRequest,
  planPagesController.deletePlanPage,
);

router.get(
  "/plans/:planId/features",
  ...plansGuard,
  planFeaturesPlanIdParam,
  validateRequest,
  planFeaturesController.listPlanFeatures,
);
router.put(
  "/plans/:planId/features",
  ...plansGuard,
  replacePlanFeaturesValidators,
  validateRequest,
  planFeaturesController.replacePlanFeatures,
);

module.exports = router;
