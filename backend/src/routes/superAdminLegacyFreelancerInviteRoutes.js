const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");
const controller = require("../controllers/legacyFreelancerInviteController");
const {
  campaignIdParam,
  userIdParam,
  createCampaignValidators,
  updateCampaignValidators,
} = require("../validators/legacyFreelancerInviteValidators");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];
const writeGuard = [...guard, adminWriteLimiter];

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

module.exports = router;
