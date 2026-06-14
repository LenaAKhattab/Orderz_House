const publicSitePageService = require("../services/publicSitePageService");

async function listSitePages(req, res, next) {
  try {
    const pages = await publicSitePageService.listAllPages();
    return res.json({ success: true, data: { pages } });
  } catch (err) {
    return next(err);
  }
}

async function getSitePage(req, res, next) {
  try {
    const page = await publicSitePageService.getPageById(Number(req.params.id));
    if (!page) {
      return res.status(404).json({ success: false, message: "الصفحة غير موجودة." });
    }
    return res.json({ success: true, data: { page } });
  } catch (err) {
    return next(err);
  }
}

async function updateSitePage(req, res, next) {
  try {
    const existing = await publicSitePageService.getPageById(Number(req.params.id));
    if (!existing) {
      return res.status(404).json({ success: false, message: "الصفحة غير موجودة." });
    }

    const page = await publicSitePageService.updatePage(
      Number(req.params.id),
      {
        title: req.body.title,
        menuLabel: req.body.menuLabel,
        content: req.body.content,
        metaTitle: req.body.metaTitle,
        metaDescription: req.body.metaDescription,
        isPublished: req.body.isPublished,
        showInMobileMenu: req.body.showInMobileMenu,
        showInFooter: req.body.showInFooter,
        sortOrder: req.body.sortOrder,
      },
      req.auth?.userId ?? null,
    );

    return res.json({ success: true, data: { page } });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listSitePages, getSitePage, updateSitePage };
