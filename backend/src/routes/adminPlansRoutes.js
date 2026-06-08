const express = require("express");
const plansController = require("../controllers/plansController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const { listPlansValidators, createPlanValidators, updatePlanValidators, planIdParam } = require("../validators/plansValidators");

const router = express.Router();

// super_admin only — scope guards to /plans routes so other /api/admin/* routers (courses, ads, …) are not blocked.
const superAdminOnly = [requireAuth, requireRole("super_admin")];

router.get("/plans", ...superAdminOnly, listPlansValidators, validateRequest, plansController.listAdminPlans);
router.post("/plans", ...superAdminOnly, createPlanValidators, validateRequest, plansController.createPlan);
router.patch("/plans/:id", ...superAdminOnly, updatePlanValidators, validateRequest, plansController.updatePlan);
router.delete("/plans/:id", ...superAdminOnly, planIdParam, validateRequest, plansController.deletePlan);

module.exports = router;

