const campaignService = require("../services/freelancerActivationCampaignService");

function actorId(req) {
  return req.auth?.userId || req.user?.id || req.user?.sub;
}

async function getCampaignSettingsSnapshot(req, res, next) {
  try {
    const data = await campaignService.getActivationCampaignSettingsSnapshot();
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function listCampaigns(req, res, next) {
  try {
    const data = await campaignService.listActivationCampaigns();
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function createCampaign(req, res, next) {
  try {
    const data = await campaignService.createActivationCampaign(req.body || {}, {
      actorUserId: actorId(req),
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getCampaign(req, res, next) {
  try {
    const data = await campaignService.getActivationCampaignDetail(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function patchCampaign(req, res, next) {
  try {
    const data = await campaignService.updateActivationCampaign(req.params.id, req.body || {});
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function pauseCampaign(req, res, next) {
  try {
    const data = await campaignService.pauseCampaign(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function resumeCampaign(req, res, next) {
  try {
    const data = await campaignService.resumeCampaign(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function emergencyStopCampaign(req, res, next) {
  try {
    const data = await campaignService.emergencyStopCampaign(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function listWaves(req, res, next) {
  try {
    const data = await campaignService.listActivationWaves(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function createWave(req, res, next) {
  try {
    const data = await campaignService.createActivationWave(req.params.id, req.body || {}, {
      actorUserId: actorId(req),
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function patchWave(req, res, next) {
  try {
    const data = await campaignService.updateActivationWave(req.params.waveId, req.body || {});
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

const articleOps = require("../services/freelancerActivationArticleOpsService");

async function getArticleFund(req, res, next) {
  try {
    const data = await articleOps.getArticleFundSummary({
      campaignId: req.query?.campaignId || null,
      recentLimit: req.query?.limit,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function depositArticleFund(req, res, next) {
  try {
    const data = await articleOps.addArticleFundDeposit({
      ...(req.body || {}),
      actorUserId: actorId(req),
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function withdrawArticleFund(req, res, next) {
  try {
    const data = await articleOps.withdrawArticleFundAmount({
      ...(req.body || {}),
      actorUserId: actorId(req),
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function listPlanAllocations(req, res, next) {
  try {
    const data = await articleOps.listPlanAllocations(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function createPlanAllocation(req, res, next) {
  try {
    const allocation = await articleOps.upsertPlanAllocation(req.params.id, req.body || {}, {
      actorUserId: actorId(req),
    });
    return res.status(201).json({ success: true, data: { allocation } });
  } catch (err) {
    return next(err);
  }
}

async function patchPlanAllocation(req, res, next) {
  try {
    const allocation = await articleOps.patchPlanAllocation(req.params.id, req.body || {});
    return res.json({ success: true, data: { allocation } });
  } catch (err) {
    return next(err);
  }
}

async function listArticleInventory(req, res, next) {
  try {
    const data = await articleOps.listInventoryItems({
      campaignId: req.query?.campaignId || null,
      status: req.query?.status || null,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function createArticleInventory(req, res, next) {
  try {
    const item = await articleOps.createInventoryItem(req.body || {}, { actorUserId: actorId(req) });
    return res.status(201).json({ success: true, data: { item } });
  } catch (err) {
    return next(err);
  }
}

async function patchArticleInventory(req, res, next) {
  try {
    const item = await articleOps.patchInventoryItem(req.params.id, req.body || {});
    return res.json({ success: true, data: { item } });
  } catch (err) {
    return next(err);
  }
}

async function releaseArticleInventory(req, res, next) {
  try {
    const data = await articleOps.releaseInventoryItem(req.params.id, { actorUserId: actorId(req) });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

const releaseEngine = require("../services/freelancerActivationArticleReleaseEngineService");

async function previewArticleRelease(req, res, next) {
  try {
    const data = await releaseEngine.previewDailyMiniArticleRelease({
      campaignId: req.query?.campaignId,
      waveId: req.query?.waveId || null,
      planTierCode: req.query?.planTierCode || null,
      date: req.query?.date || null,
      includeManualMode: req.query?.includeManualMode !== "false",
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function runArticleRelease(req, res, next) {
  try {
    const body = req.body || {};
    const data = await releaseEngine.runDailyMiniArticleRelease({
      campaignId: body.campaignId,
      waveId: body.waveId ?? null,
      planTierCode: body.planTierCode ?? null,
      date: body.date ?? null,
      force: Boolean(body.force),
      runType: body.runType === "daily_auto" ? "daily_auto" : "manual",
      actorUserId: actorId(req),
    });
    const status = data.idempotent ? 200 : 201;
    return res.status(status).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function listArticleReleaseRuns(req, res, next) {
  try {
    const data = await releaseEngine.listArticleReleaseRuns({
      campaignId: req.query?.campaignId || null,
      waveId: req.query?.waveId || null,
      planTierCode: req.query?.planTierCode || null,
      dateFrom: req.query?.dateFrom || null,
      dateTo: req.query?.dateTo || null,
      limit: req.query?.limit,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getArticleReleaseRun(req, res, next) {
  try {
    const data = await releaseEngine.getArticleReleaseRun(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

const liveMonitoring = require("../services/freelancerActivationLiveArticleMonitoringService");

async function listLiveArticles(req, res, next) {
  try {
    const q = req.query || {};
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(Math.max(Number(q.limit) || 25, 1), 100);
    const data = await liveMonitoring.listLiveActivationArticles({
      campaignId: q.campaignId || null,
      waveId: q.waveId || null,
      planTierCode: q.planTierCode || null,
      status: q.status || null,
      autoAssignStatus: q.autoAssignStatus || null,
      dateFrom: q.dateFrom || null,
      dateTo: q.dateTo || null,
      search: q.search || null,
      limit,
      offset: (page - 1) * limit,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getLiveArticle(req, res, next) {
  try {
    const data = await liveMonitoring.getLiveActivationArticle(req.params.articleId);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function runLiveArticleAutoAssignment(req, res, next) {
  try {
    const data = await liveMonitoring.runLiveArticleAutoAssignment(req.params.articleId, {
      actorUserId: actorId(req),
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function releaseAnotherFromInventory(req, res, next) {
  try {
    const detail = await liveMonitoring.getLiveActivationArticle(req.params.articleId);
    const inventoryItemId =
      req.body?.inventoryItemId || detail?.item?.inventoryItemId || null;
    if (!inventoryItemId) {
      return res.status(409).json({
        success: false,
        message: "لا يوجد عنصر مخزن مرتبط بهذا المقال.",
      });
    }
    const data = await liveMonitoring.releaseAnotherFromInventory(inventoryItemId, {
      actorUserId: actorId(req),
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getCampaignSettingsSnapshot,
  listCampaigns,
  createCampaign,
  getCampaign,
  patchCampaign,
  pauseCampaign,
  resumeCampaign,
  emergencyStopCampaign,
  listWaves,
  createWave,
  patchWave,
  getArticleFund,
  depositArticleFund,
  withdrawArticleFund,
  listPlanAllocations,
  createPlanAllocation,
  patchPlanAllocation,
  listArticleInventory,
  createArticleInventory,
  patchArticleInventory,
  releaseArticleInventory,
  previewArticleRelease,
  runArticleRelease,
  listArticleReleaseRuns,
  getArticleReleaseRun,
  listLiveArticles,
  getLiveArticle,
  runLiveArticleAutoAssignment,
  releaseAnotherFromInventory,
};
