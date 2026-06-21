const express = require("express");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");
const superAdminFinancialClaimsController = require("../controllers/superAdminFinancialClaimsController");
const {
  claimIdParam,
  listSuperAdminFinancialClaimsValidators,
  updateFinancialClaimStatusValidators,
  updateFinancialClaimPricingValidators,
  createFreelancerPaymentValidators,
} = require("../validators/financialClaimsValidators");

const router = express.Router();

const financialClaimsGuard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requirePermission(PERMISSION_KEYS.FINANCIAL_CLAIMS),
];

router.get("/financial-claims", ...financialClaimsGuard, listSuperAdminFinancialClaimsValidators, validateRequest, superAdminFinancialClaimsController.listFinancialClaims);
router.get(
  "/financial-claims/:id",
  ...financialClaimsGuard,
  claimIdParam,
  validateRequest,
  superAdminFinancialClaimsController.getFinancialClaimById,
);
router.patch(
  "/financial-claims/:id/status",
  ...financialClaimsGuard,
  updateFinancialClaimStatusValidators,
  validateRequest,
  superAdminFinancialClaimsController.updateFinancialClaimStatus,
);
router.patch(
  "/financial-claims/:id/pricing",
  ...financialClaimsGuard,
  updateFinancialClaimPricingValidators,
  validateRequest,
  superAdminFinancialClaimsController.updateFinancialClaimPricing,
);
router.post(
  "/freelancer-payments",
  ...financialClaimsGuard,
  createFreelancerPaymentValidators,
  validateRequest,
  superAdminFinancialClaimsController.createFreelancerPayment,
);

module.exports = router;
