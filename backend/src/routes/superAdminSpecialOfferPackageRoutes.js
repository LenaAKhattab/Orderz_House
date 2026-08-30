const express = require("express");
const specialOfferPackageController = require("../controllers/specialOfferPackageController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");
const {
  updateSpecialOfferValidators,
  visibilityValidators,
} = require("../validators/specialOfferPackageValidators");

const router = express.Router();
const guard = [requireAuth, requireAnyRole(["super_admin"]), requirePermission(PERMISSION_KEYS.PLANS)];

router.get("/plans/special-offer", ...guard, specialOfferPackageController.getAdmin);
router.put(
  "/plans/special-offer",
  ...guard,
  updateSpecialOfferValidators,
  validateRequest,
  specialOfferPackageController.updateAdmin,
);
router.patch(
  "/plans/special-offer/visibility",
  ...guard,
  visibilityValidators,
  validateRequest,
  specialOfferPackageController.updateVisibility,
);
router.post(
  "/plans/special-offer/new-version",
  ...guard,
  specialOfferPackageController.createNewVersion,
);

module.exports = router;
