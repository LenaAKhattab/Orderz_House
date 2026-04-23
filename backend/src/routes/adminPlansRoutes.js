const express = require("express");
const plansController = require("../controllers/plansController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const { listPlansValidators, createPlanValidators, updatePlanValidators, planIdParam } = require("../validators/plansValidators");

const router = express.Router();

// super_admin only
router.use(requireAuth, requireRole("super_admin"));

router.get("/plans", listPlansValidators, validateRequest, plansController.listAdminPlans);
router.post("/plans", createPlanValidators, validateRequest, plansController.createPlan);
router.patch("/plans/:id", updatePlanValidators, validateRequest, plansController.updatePlan);
router.delete("/plans/:id", planIdParam, validateRequest, plansController.deletePlan);

module.exports = router;

