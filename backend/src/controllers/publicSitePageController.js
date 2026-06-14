const publicSitePageService = require("../services/publicSitePageService");

async function listPublicSitePages(req, res, next) {
  try {
    const pages = await publicSitePageService.listPublishedForNav();
    return res.json({ success: true, data: { pages } });
  } catch (err) {
    return next(err);
  }
}

async function getPublicSitePage(req, res, next) {
  try {
    const page = await publicSitePageService.getPublishedBySlug(req.params.slug);
    if (!page) {
      return res.status(404).json({ success: false, message: "الصفحة غير متاحة." });
    }
    return res.json({ success: true, data: { page } });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listPublicSitePages, getPublicSitePage };
