const express = require("express");
const defaultPlanCatalogController = require("../controllers/defaultPlanCatalogController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const { updateDefaultPlanCatalogValidators } = require("../validators/defaultPlanCatalogValidators");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

router.get("/default-plan-catalog", ...guard, defaultPlanCatalogController.getAdmin);

router.patch(
  "/default-plan-catalog",
  ...guard,
  updateDefaultPlanCatalogValidators,
  validateRequest,
  defaultPlanCatalogController.updateAdmin,
);

module.exports = router;
