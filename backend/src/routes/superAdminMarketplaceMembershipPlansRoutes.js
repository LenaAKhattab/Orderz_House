const express = require("express");
const marketplaceMembershipPlansController = require("../controllers/marketplaceMembershipPlansController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const {
  planIdParam,
  createMarketplaceMembershipPlanValidators,
  updateMarketplaceMembershipPlanValidators,
  reorderMarketplaceMembershipPlansValidators,
} = require("../validators/marketplaceMembershipPlansValidators");

const router = express.Router();

const guard = [requireAuth, requireSuperAdmin];

router.get(
  "/marketplace-membership-plans",
  ...guard,
  marketplaceMembershipPlansController.listAdmin,
);

router.get(
  "/marketplace-membership-plans/:id",
  ...guard,
  planIdParam,
  validateRequest,
  marketplaceMembershipPlansController.getAdminById,
);

router.post(
  "/marketplace-membership-plans",
  ...guard,
  createMarketplaceMembershipPlanValidators,
  validateRequest,
  marketplaceMembershipPlansController.create,
);

router.patch(
  "/marketplace-membership-plans/reorder",
  ...guard,
  reorderMarketplaceMembershipPlansValidators,
  validateRequest,
  marketplaceMembershipPlansController.reorder,
);

router.patch(
  "/marketplace-membership-plans/:id",
  ...guard,
  updateMarketplaceMembershipPlanValidators,
  validateRequest,
  marketplaceMembershipPlansController.update,
);

router.delete(
  "/marketplace-membership-plans/:id",
  ...guard,
  planIdParam,
  validateRequest,
  marketplaceMembershipPlansController.remove,
);

module.exports = router;
