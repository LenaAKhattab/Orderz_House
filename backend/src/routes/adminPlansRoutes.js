const express = require("express");
const plansController = require("../controllers/plansController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");
const { listPlansValidators, createPlanValidators, updatePlanValidators, planIdParam } = require("../validators/plansValidators");

const router = express.Router();

const staffRoles = [requireAuth, requireAnyRole(["admin", "super_admin"])];
const plansGuard = [...staffRoles, requirePermission(PERMISSION_KEYS.PLANS)];

router.get("/plans", ...plansGuard, listPlansValidators, validateRequest, plansController.listAdminPlans);
router.post("/plans", ...plansGuard, createPlanValidators, validateRequest, plansController.createPlan);
router.patch("/plans/:id", ...plansGuard, updatePlanValidators, validateRequest, plansController.updatePlan);
router.delete("/plans/:id", ...plansGuard, planIdParam, validateRequest, plansController.deletePlan);

module.exports = router;
