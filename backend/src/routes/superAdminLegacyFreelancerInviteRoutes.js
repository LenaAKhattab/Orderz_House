const express = require("express");
const {
  requireAuth,
  requireAnyRole,
  requirePermission,
} = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");
const controller = require("../controllers/legacyFreelancerInviteController");
const adminController = require("../controllers/legacyFreelancerAdminController");
const {
  uploadAccountActivationKyc,
  handleKycUploadErrors,
} = require("../middleware/accountActivationKycUploadMiddleware");
const {
  campaignIdParam,
  userIdParam,
  createCampaignValidators,
  updateCampaignValidators,
} = require("../validators/legacyFreelancerInviteValidators");

const router = express.Router();

/** Super Admin always; Admin only with legacy_freelancers.manage */
const LEGACY_MANAGE_PERMISSION = "legacy_freelancers.manage";
const guard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requirePermission(LEGACY_MANAGE_PERMISSION),
];
const writeGuard = [...guard, adminWriteLimiter];

const identityUpload = uploadAccountActivationKyc.fields([
  { name: "idFront", maxCount: 1 },
  { name: "idBack", maxCount: 1 },
  { name: "file", maxCount: 1 },
  { name: "front", maxCount: 1 },
  { name: "back", maxCount: 1 },
  { name: "image", maxCount: 1 },
]);

router.get("/legacy-freelancer-invites", ...guard, controller.listCampaigns);
router.get(
  "/legacy-freelancer-invites/:campaignId",
  ...guard,
  campaignIdParam,
  validateRequest,
  controller.getCampaign,
);
router.post(
  "/legacy-freelancer-invites",
  ...writeGuard,
  createCampaignValidators,
  validateRequest,
  controller.createCampaign,
);
router.patch(
  "/legacy-freelancer-invites/:campaignId",
  ...writeGuard,
  updateCampaignValidators,
  validateRequest,
  controller.updateCampaign,
);
router.post(
  "/legacy-freelancer-invites/:campaignId/revoke",
  ...writeGuard,
  campaignIdParam,
  validateRequest,
  controller.revokeCampaign,
);
router.post(
  "/legacy-freelancer-invites/:campaignId/regenerate-token",
  ...writeGuard,
  campaignIdParam,
  validateRequest,
  controller.regenerateToken,
);
router.get(
  "/legacy-freelancer-invites/:campaignId/invite-link",
  ...guard,
  campaignIdParam,
  validateRequest,
  controller.getCampaignInviteLink,
);
router.get(
  "/legacy-freelancer-invites/:campaignId/workspace",
  ...guard,
  campaignIdParam,
  validateRequest,
  controller.getCampaignWorkspace,
);
router.delete(
  "/legacy-freelancer-invites/:campaignId",
  ...writeGuard,
  campaignIdParam,
  validateRequest,
  controller.deleteCampaign,
);
router.get(
  "/legacy-freelancer-invites/:campaignId/redemptions",
  ...guard,
  campaignIdParam,
  validateRequest,
  controller.listRedemptions,
);
router.get(
  "/legacy-freelancer-invites/:campaignId/redemptions.csv",
  ...guard,
  campaignIdParam,
  validateRequest,
  controller.exportRedemptionsCsv,
);
router.get("/legacy-freelancer-invite-field-catalog", ...guard, controller.getContractCatalog);
router.get(
  "/legacy-freelancer-invites/:campaignId/fields",
  ...guard,
  campaignIdParam,
  validateRequest,
  controller.getCampaignFields,
);
router.put(
  "/legacy-freelancer-invites/:campaignId/fields",
  ...writeGuard,
  campaignIdParam,
  validateRequest,
  controller.putCampaignFields,
);
router.post(
  "/legacy-freelancer-invites/:campaignId/fields/restore-defaults",
  ...writeGuard,
  campaignIdParam,
  validateRequest,
  controller.restoreCampaignFields,
);
router.get(
  "/legacy-freelancer-invites/:campaignId/redemptions/:userId/answers",
  ...guard,
  ...campaignIdParam,
  ...userIdParam,
  validateRequest,
  controller.getRedemptionAnswers,
);

// --- Legacy Freelancer Admin Center ---
router.get("/legacy-freelancers", ...guard, adminController.listLegacyFreelancers);
router.get(
  "/legacy-freelancers/:userId",
  ...guard,
  ...userIdParam,
  validateRequest,
  adminController.getLegacyFreelancer,
);
router.post(
  "/legacy-freelancers",
  ...writeGuard,
  identityUpload,
  handleKycUploadErrors,
  adminController.createManualLegacyFreelancer,
);
router.post(
  "/legacy-freelancers/bulk-package",
  ...writeGuard,
  adminController.bulkAssignPackage,
);
router.post(
  "/legacy-freelancers/:userId/package",
  ...writeGuard,
  ...userIdParam,
  validateRequest,
  adminController.assignPackage,
);
router.post(
  "/legacy-freelancers/:userId/signed-documents",
  ...writeGuard,
  ...userIdParam,
  validateRequest,
  adminController.setSignedDocument,
);
router.delete(
  "/legacy-freelancers/:userId/signed-documents/:documentTypeId",
  ...writeGuard,
  ...userIdParam,
  validateRequest,
  adminController.removeSignedDocument,
);
router.post(
  "/legacy-freelancers/:userId/historical-money",
  ...writeGuard,
  ...userIdParam,
  validateRequest,
  adminController.addHistoricalMoney,
);
router.post(
  "/legacy-freelancers/:userId/historical-money/:id/void",
  ...writeGuard,
  ...userIdParam,
  validateRequest,
  adminController.voidHistoricalMoney,
);
router.get(
  "/legacy-freelancers/:userId/identity/:side",
  ...guard,
  ...userIdParam,
  validateRequest,
  adminController.streamIdentity,
);
router.put(
  "/legacy-freelancers/:userId/identity/:side",
  ...writeGuard,
  ...userIdParam,
  validateRequest,
  identityUpload,
  handleKycUploadErrors,
  adminController.replaceIdentity,
);

router.get("/legacy-document-types", ...guard, adminController.listDocumentTypes);
router.post("/legacy-document-types", ...writeGuard, adminController.createDocumentType);
router.patch("/legacy-document-types/:id", ...writeGuard, adminController.updateDocumentType);

router.get(
  "/legacy-freelancer-invites/:campaignId/document-requirements",
  ...guard,
  ...campaignIdParam,
  validateRequest,
  adminController.getCampaignDocumentRequirements,
);
router.put(
  "/legacy-freelancer-invites/:campaignId/document-requirements",
  ...writeGuard,
  ...campaignIdParam,
  validateRequest,
  adminController.putCampaignDocumentRequirements,
);

module.exports = router;
