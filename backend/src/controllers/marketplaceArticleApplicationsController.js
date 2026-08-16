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
    if (!article || article.status !== "published" || article.isFakeOrTraining) {
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
    return res.status(200).json({
      success: true,
      data: { applications, count, bidCollection, fairRanking },
    });
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
  select,
  reject,
  finalizeApproval,
  getApplicationAdmin,
};
