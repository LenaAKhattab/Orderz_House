const articleApplicationsService = require("../services/marketplaceArticleApplicationsService");
const marketplaceArticlesService = require("../services/marketplaceArticlesService");

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
    return res.status(200).json({
      success: true,
      data: {
        article,
        application: application || null,
        eligibility,
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
    return res.status(200).json({
      success: true,
      data: { applications, count },
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
  select,
  reject,
  finalizeApproval,
  getApplicationAdmin,
};
