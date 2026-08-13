const marketplaceArticlesService = require("../services/marketplaceArticlesService");

async function listAdmin(req, res, next) {
  try {
    const articles = await marketplaceArticlesService.listMarketplaceArticlesForAdmin({
      status: req.query.status || null,
      articleLevel: req.query.articleLevel || null,
      includeFake: String(req.query.includeFake || "true") !== "false",
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json({ success: true, data: { articles } });
  } catch (err) {
    return next(err);
  }
}

async function getAdminById(req, res, next) {
  try {
    const article = await marketplaceArticlesService.getMarketplaceArticleById(req.params.id, {
      forAdmin: true,
    });
    if (!article) {
      return res.status(404).json({ success: false, message: "المقال غير موجود." });
    }
    return res.status(200).json({ success: true, data: { article } });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    const article = await marketplaceArticlesService.createMarketplaceArticle(req.body || {}, {
      actorUserId: req.user?.id || null,
    });
    return res.status(201).json({ success: true, data: { article } });
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const article = await marketplaceArticlesService.updateMarketplaceArticle(
      req.params.id,
      req.body || {},
      { actorUserId: req.user?.id || null },
    );
    return res.status(200).json({ success: true, data: { article } });
  } catch (err) {
    return next(err);
  }
}

async function listPublished(req, res, next) {
  try {
    const articles = await marketplaceArticlesService.listPublishedMarketplaceArticles({
      articleLevel: req.query.articleLevel || null,
      categoryId: req.query.categoryId || null,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json({ success: true, data: { articles } });
  } catch (err) {
    return next(err);
  }
}

async function getPublishedById(req, res, next) {
  try {
    const article = await marketplaceArticlesService.getMarketplaceArticleById(req.params.id, {
      forAdmin: false,
    });
    if (!article || article.status !== "published" || article.isFakeOrTraining) {
      return res.status(404).json({ success: false, message: "المقال غير موجود." });
    }
    return res.status(200).json({ success: true, data: { article } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listAdmin,
  getAdminById,
  create,
  update,
  listPublished,
  getPublishedById,
};
