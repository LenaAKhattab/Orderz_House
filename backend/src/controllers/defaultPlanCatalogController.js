const defaultPlanCatalogService = require("../services/defaultPlanCatalogService");

async function getPublic(req, res, next) {
  try {
    const data = await defaultPlanCatalogService.getPublicDefaultPlanCatalog();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getAdmin(req, res, next) {
  try {
    const data = await defaultPlanCatalogService.getAdminDefaultPlanCatalog();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function updateAdmin(req, res, next) {
  try {
    const data = await defaultPlanCatalogService.setDefaultPlanCatalog(req.body?.catalog, {
      updatedByUserId: req.auth?.userId ?? null,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPublic,
  getAdmin,
  updateAdmin,
};
