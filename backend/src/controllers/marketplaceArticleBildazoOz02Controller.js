/**
 * OZ-Articles-Bildazo-02 — categories + package requirements admin endpoints.
 */

const { fetchBildazoLeafCategories, clearBildazoCategoriesCache } = require("../services/bildazoCategoriesClient");
const packageRequirementsService = require("../services/marketplaceArticlePackageRequirementsService");
const bildazoArticlePublishService = require("../services/bildazoArticlePublishService");

async function listBildazoCategories(req, res, next) {
  try {
    const refresh = String(req.query.refresh || "") === "1";
    if (refresh) clearBildazoCategoriesCache();
    const result = await fetchBildazoLeafCategories({ skipCache: refresh });
    if (!result.ok) {
      return res.status(result.blocked ? 503 : 502).json({
        success: false,
        message: result.safeMessage || "تعذر تحميل أصناف بلدازو الآن. حاول مجددًا.",
        code: result.errorCode,
        blocked: Boolean(result.blocked),
      });
    }
    return res.status(200).json({
      success: true,
      data: { categories: result.items, cached: Boolean(result.cached) },
    });
  } catch (err) {
    return next(err);
  }
}

async function listPackageRequirements(req, res, next) {
  try {
    const items = await packageRequirementsService.listPackageRequirements();
    return res.status(200).json({ success: true, data: { requirements: items } });
  } catch (err) {
    return next(err);
  }
}

async function updatePackageRequirements(req, res, next) {
  try {
    const items = req.body?.requirements || req.body?.items || req.body;
    const requirements = await packageRequirementsService.updatePackageRequirements(
      Array.isArray(items) ? items : [],
      req.user?.id || null,
    );
    return res.status(200).json({ success: true, data: { requirements } });
  } catch (err) {
    return next(err);
  }
}

async function getBildazoPublishPreview(req, res, next) {
  try {
    const preview = await bildazoArticlePublishService.getPublishPreviewForApplication(
      req.params.applicationId || req.params.id,
    );
    if (!preview) {
      return res.status(404).json({ success: false, message: "الطلب غير موجود." });
    }
    return res.status(200).json({ success: true, data: preview });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listBildazoCategories,
  listPackageRequirements,
  updatePackageRequirements,
  getBildazoPublishPreview,
};
