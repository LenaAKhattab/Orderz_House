const websitePageService = require("../services/websitePageService");

async function getPublicPage(req, res, next) {
  try {
    const data = await websitePageService.getPageBySlug(req.params.slug, { includeInactiveBlocks: false });
    if (!data || !data.page.isActive) {
      return res.status(404).json({ success: false, message: "الصفحة غير متاحة." });
    }
    return res.json({
      success: true,
      data: {
        page: {
          slug: data.page.slug,
          title: data.page.title,
          pageType: data.page.pageType,
        },
        blocks: data.blocks.map(({ id, blockType, title, body, imageUrl, sortOrder }) => ({
          id,
          blockType,
          title,
          body,
          imageUrl,
          sortOrder,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getPublicPage };
