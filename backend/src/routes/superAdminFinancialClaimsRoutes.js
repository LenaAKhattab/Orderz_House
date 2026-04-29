const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const superAdminFinancialClaimsController = require("../controllers/superAdminFinancialClaimsController");
const {
  claimIdParam,
  listSuperAdminFinancialClaimsValidators,
  updateFinancialClaimStatusValidators,
  updateFinancialClaimPricingValidators,
  createFreelancerPaymentValidators,
} = require("../validators/financialClaimsValidators");

const router = express.Router();

router.use(requireAuth, requireSuperAdmin);

router.get("/financial-claims", listSuperAdminFinancialClaimsValidators, validateRequest, superAdminFinancialClaimsController.listFinancialClaims);
router.get(
  "/financial-claims/:id",
  claimIdParam,
  validateRequest,
  superAdminFinancialClaimsController.getFinancialClaimById,
);
router.patch(
  "/financial-claims/:id/status",
  updateFinancialClaimStatusValidators,
  validateRequest,
  superAdminFinancialClaimsController.updateFinancialClaimStatus,
);
router.patch(
  "/financial-claims/:id/pricing",
  updateFinancialClaimPricingValidators,
  validateRequest,
  superAdminFinancialClaimsController.updateFinancialClaimPricing,
);
router.post(
  "/freelancer-payments",
  createFreelancerPaymentValidators,
  validateRequest,
  superAdminFinancialClaimsController.createFreelancerPayment,
);

module.exports = router;
