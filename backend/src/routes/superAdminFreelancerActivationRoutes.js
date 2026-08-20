const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const controller = require("../controllers/freelancerActivationEngineController");
const campaigns = require("../controllers/freelancerActivationCampaignController");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

router.get("/freelancer-activation/trials", ...guard, controller.getAdminTrials);
router.get("/freelancer-activation/kpis", ...guard, controller.getAdminKpis);
router.get("/freelancer-activation/work-inventory-reserve", ...guard, controller.getAdminWorkInventoryReserve);
router.get("/freelancer-activation/earned-balance", ...guard, controller.getAdminEarnedBalance);
router.get("/freelancer-activation/settings", ...guard, controller.getAdminSettings);
router.patch("/freelancer-activation/settings", ...guard, controller.updateAdminSettings);

router.get("/freelancer-activation/campaigns", ...guard, campaigns.listCampaigns);
router.post("/freelancer-activation/campaigns", ...guard, campaigns.createCampaign);
router.get("/freelancer-activation/campaigns/:id", ...guard, campaigns.getCampaign);
router.patch("/freelancer-activation/campaigns/:id", ...guard, campaigns.patchCampaign);
router.post("/freelancer-activation/campaigns/:id/pause", ...guard, campaigns.pauseCampaign);
router.post("/freelancer-activation/campaigns/:id/resume", ...guard, campaigns.resumeCampaign);
router.post("/freelancer-activation/campaigns/:id/emergency-stop", ...guard, campaigns.emergencyStopCampaign);
router.get("/freelancer-activation/campaigns/:id/waves", ...guard, campaigns.listWaves);
router.post("/freelancer-activation/campaigns/:id/waves", ...guard, campaigns.createWave);
router.patch("/freelancer-activation/waves/:waveId", ...guard, campaigns.patchWave);

router.get("/freelancer-activation/article-fund", ...guard, campaigns.getArticleFund);
router.post("/freelancer-activation/article-fund/deposit", ...guard, campaigns.depositArticleFund);
router.post("/freelancer-activation/article-fund/withdraw", ...guard, campaigns.withdrawArticleFund);

router.get("/freelancer-activation/campaigns/:id/plan-allocations", ...guard, campaigns.listPlanAllocations);
router.post("/freelancer-activation/campaigns/:id/plan-allocations", ...guard, campaigns.createPlanAllocation);
router.patch("/freelancer-activation/plan-allocations/:id", ...guard, campaigns.patchPlanAllocation);

router.get("/freelancer-activation/article-inventory", ...guard, campaigns.listArticleInventory);
router.post("/freelancer-activation/article-inventory", ...guard, campaigns.createArticleInventory);
router.patch("/freelancer-activation/article-inventory/:id", ...guard, campaigns.patchArticleInventory);
router.post("/freelancer-activation/article-inventory/:id/release", ...guard, campaigns.releaseArticleInventory);

router.get("/freelancer-activation/article-release/preview", ...guard, campaigns.previewArticleRelease);
router.post("/freelancer-activation/article-release/run", ...guard, campaigns.runArticleRelease);
router.get("/freelancer-activation/article-release/runs", ...guard, campaigns.listArticleReleaseRuns);
router.get("/freelancer-activation/article-release/runs/:id", ...guard, campaigns.getArticleReleaseRun);

router.get("/freelancer-activation/live-articles", ...guard, campaigns.listLiveArticles);
router.get("/freelancer-activation/live-articles/:articleId", ...guard, campaigns.getLiveArticle);
router.post(
  "/freelancer-activation/live-articles/:articleId/run-auto-assignment",
  ...guard,
  campaigns.runLiveArticleAutoAssignment,
);
router.post(
  "/freelancer-activation/live-articles/:articleId/release-another",
  ...guard,
  campaigns.releaseAnotherFromInventory,
);

module.exports = router;
