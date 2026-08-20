const articleApplicationsService = require("../services/marketplaceArticleApplicationsService");
const marketplaceArticlesService = require("../services/marketplaceArticlesService");
const opportunityBidCollectionService = require("../services/opportunityBidCollectionService");

async function submit(req, res, next) {
  try {
    const result = await articleApplicationsService.submitArticleApplication({
      articleId: req.params.id,
      freelancerUserId: req.user.id,
      proposalMessage: req.body?.proposalMessage ?? req.body?.message ?? null,
    });
    return res.status(result.created ? 201 : 200).json({
      success: true,
      data: {
        application: result.application,
        created: result.created,
        duplicatePrevented: result.duplicatePrevented,
        approvedBidCost: articleApplicationsService.ARTICLE_APPLICATION_BID_COST,
        bidCostCharged: result.bidCreditConsumed ?? 0,
        bidCreditConsumed: result.bidCreditConsumed ?? 0,
        bidCredit: result.bidCredit || null,
        availableBidsAfter: result.bidCredit?.availableBidsAfter ?? null,
        economicsRuntime: articleApplicationsService.ARTICLE_APPLICATION_BID_ECONOMICS_RUNTIME,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function edit(req, res, next) {
  try {
    const result = await articleApplicationsService.editArticleApplication({
      applicationId: req.params.applicationId,
      freelancerUserId: req.user.id,
      proposalMessage: req.body?.proposalMessage ?? req.body?.message ?? null,
    });
    return res.status(200).json({
      success: true,
      data: {
        application: result.application,
        additionalBidCost: result.additionalBidCost,
        bidCreditConsumed: result.bidCreditConsumed ?? 0,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function withdraw(req, res, next) {
  try {
    const result = await articleApplicationsService.withdrawArticleApplication({
      applicationId: req.params.applicationId,
      freelancerUserId: req.user.id,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function getFairRanking(req, res, next) {
  try {
    const fairAdapter = require("../services/articleFairDistributionAdapterService");
    const fairRanking = await fairAdapter.getArticleFairRanking(req.params.id);
    return res.status(200).json({ success: true, data: { fairRanking } });
  } catch (err) {
    return next(err);
  }
}

async function listMine(req, res, next) {
  try {
    const applications = await articleApplicationsService.listMyArticleApplications(req.user.id, {
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json({ success: true, data: { applications } });
  } catch (err) {
    return next(err);
  }
}

async function getMineForArticle(req, res, next) {
  try {
    const application = await articleApplicationsService.getMyApplicationForArticle(
      req.params.id,
      req.user.id,
    );
    const eligibility = await articleApplicationsService.getArticleApplicationEligibility(
      req.params.id,
      req.user.id,
    );
    const article = await marketplaceArticlesService.getMarketplaceArticleById(req.params.id, {
      forAdmin: false,
    });
    if (!article || article.isFakeOrTraining) {
      return res.status(404).json({ success: false, message: "المقال غير موجود." });
    }
    if (article.status !== "published" && !application) {
      return res.status(404).json({ success: false, message: "المقال غير موجود." });
    }
    const bidCollection = await opportunityBidCollectionService.getArticleBidCollectionProgress(
      req.params.id,
    );
    return res.status(200).json({
      success: true,
      data: {
        article: { ...article, bidCollection },
        application: application || null,
        eligibility,
        bidCollection,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function listForArticleAdmin(req, res, next) {
  try {
    const applications = await articleApplicationsService.listApplicationsForArticleAdmin(
      req.params.id,
      { limit: req.query.limit, offset: req.query.offset },
    );
    const count = applications.length;
    const bidCollection = await opportunityBidCollectionService.getArticleBidCollectionProgress(
      req.params.id,
    );
    const fairAdapter = require("../services/articleFairDistributionAdapterService");
    let fairRanking = null;
    try {
      fairRanking = await fairAdapter.getArticleFairRanking(req.params.id);
    } catch {
      fairRanking = fairAdapter.buildNotEligiblePayload(bidCollection);
    }
    let autoAssignment = null;
    try {
      const autoAssign = require("../services/freelancerActivationAutoAssignmentService");
      autoAssignment = await autoAssign.getLatestAutoAssignmentForArticle(req.params.id);
    } catch {
      autoAssignment = { schemaReady: false, run: null, candidates: [], autoAssignedBadge: false };
    }
    return res.status(200).json({
      success: true,
      data: { applications, count, bidCollection, fairRanking, autoAssignment },
    });
  } catch (err) {
    return next(err);
  }
}

async function runAutoAssignment(req, res, next) {
  try {
    const autoAssign = require("../services/freelancerActivationAutoAssignmentService");
    const data = await autoAssign.runAutoAssignmentForArticle(req.params.id, {
      runType: "manual_admin_run",
      actorUserId: req.user?.id || null,
    });
    return res.status(data.autoAssigned ? 200 : 200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getAutoAssignment(req, res, next) {
  try {
    const autoAssign = require("../services/freelancerActivationAutoAssignmentService");
    const data = await autoAssign.getLatestAutoAssignmentForArticle(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function select(req, res, next) {
  try {
    const result = await articleApplicationsService.selectArticleApplication({
      applicationId: req.params.applicationId,
      actorUserId: req.user?.id,
      overrideReason: req.body?.overrideReason ?? req.body?.override_reason,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function reject(req, res, next) {
  try {
    const result = await articleApplicationsService.rejectArticleApplication({
      applicationId: req.params.applicationId,
      actorUserId: req.user?.id,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function submitFinalManuscript(req, res, next) {
  try {
    const submissionsService = require("../services/marketplaceArticleSubmissionsService");
    const result = await submissionsService.submitFinalArticleManuscript({
      applicationId: req.params.applicationId,
      freelancerUserId: req.user.id,
      title: req.body?.title,
      content: req.body?.content,
      body: req.body || {},
      termsAccepted: req.body?.termsAccepted,
      requestMeta: {
        ip: req.ip || null,
        userAgent: req.get?.("user-agent") || req.headers?.["user-agent"] || null,
      },
    });
    return res.status(result.created ? 201 : 200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function requestArticleRevision(req, res, next) {
  try {
    const submissionsService = require("../services/marketplaceArticleSubmissionsService");
    const result = await submissionsService.requestArticleSubmissionRevision({
      applicationId: req.params.applicationId,
      actorUserId: req.user?.id,
      reviewerNotes: req.body?.reviewerNotes ?? req.body?.notes ?? null,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function finalizeApproval(req, res, next) {
  try {
    const result = await articleApplicationsService.finalizeArticleApplicationApproval({
      applicationId: req.params.applicationId,
      actorUserId: req.user?.id,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function retryBildazoPublish(req, res, next) {
  try {
    const articlePublishService = require("../services/bildazoArticlePublishService");
    const result = await articlePublishService.retryPublishForApplication(
      req.params.applicationId,
      req.user?.id,
    );
    return res.status(200).json({
      success: true,
      data: {
        bildazoPublish: result?.record
          ? articlePublishService.mapAdminPublishRecord(result.record)
          : null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function retryBildazoPublishForArticle(req, res, next) {
  try {
    const articlePublishService = require("../services/bildazoArticlePublishService");
    const result = await articlePublishService.retryPublishForArticle(req.params.id, req.user?.id);
    return res.status(200).json({
      success: true,
      data: {
        retried: result.retried,
        results: (result.results || []).map((item) =>
          item?.record ? articlePublishService.mapAdminPublishRecord(item.record) : null,
        ),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getApplicationAdmin(req, res, next) {
  try {
    const application = await articleApplicationsService.getApplicationById(
      req.params.applicationId,
      { forAdmin: true },
    );
    if (!application) {
      return res.status(404).json({ success: false, message: "الطلب غير موجود." });
    }
    return res.status(200).json({ success: true, data: { application } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  submit,
  edit,
  withdraw,
  listMine,
  getMineForArticle,
  listForArticleAdmin,
  getFairRanking,
  getAutoAssignment,
  runAutoAssignment,
  select,
  reject,
  finalizeApproval,
  submitFinalManuscript,
  requestArticleRevision,
  retryBildazoPublish,
  retryBildazoPublishForArticle,
  getApplicationAdmin,
};
