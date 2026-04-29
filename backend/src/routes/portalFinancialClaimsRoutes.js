const express = require("express");
const { requireAuth, requireFreelancer } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const portalFinancialClaimsController = require("../controllers/portalFinancialClaimsController");
const {
  listPortalFinancialClaimsValidators,
  listDoneProjectsValidators,
  createPortalFinancialClaimValidators,
} = require("../validators/financialClaimsValidators");

const router = express.Router();

router.use(requireAuth, requireFreelancer);

router.get("/financial-claims", listPortalFinancialClaimsValidators, validateRequest, portalFinancialClaimsController.listMyFinancialClaims);
router.get(
  "/financial-claims/done-projects",
  listDoneProjectsValidators,
  validateRequest,
  portalFinancialClaimsController.listMyDoneProjects,
);
router.post(
  "/financial-claims",
  createPortalFinancialClaimValidators,
  validateRequest,
  portalFinancialClaimsController.createMyFinancialClaim,
);

module.exports = router;
