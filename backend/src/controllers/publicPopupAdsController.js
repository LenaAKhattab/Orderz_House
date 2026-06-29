const popupAdsService = require("../services/popupAdsService");

async function listActive(req, res, next) {
  try {
    const pathname = String(req.query.pathname || "/");
    const role = req.auth?.primaryRole || req.user?.role || null;
    const isAuthenticated = Boolean(req.auth?.userId || req.user?.sub);
    const ads = await popupAdsService.listPublicActive({ pathname, role, isAuthenticated });
    return res.status(200).json({ success: true, data: { ads } });
  } catch (err) {
    return next(err);
  }
}

async function recordImpression(req, res, next) {
  try {
    const id = Number(req.params?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "معرّف غير صالح.", code: "VALIDATION_ERROR" });
    }
    const active = await popupAdsService.isPublicActiveId(id);
    if (!active) {
      return res.status(404).json({ success: false, message: "غير موجود.", code: "NOT_FOUND" });
    }
    await popupAdsService.incrementImpression(id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function recordClick(req, res, next) {
  try {
    const id = Number(req.params?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "معرّف غير صالح.", code: "VALIDATION_ERROR" });
    }
    const active = await popupAdsService.isPublicActiveId(id);
    if (!active) {
      return res.status(404).json({ success: false, message: "غير موجود.", code: "NOT_FOUND" });
    }
    await popupAdsService.incrementClick(id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listActive,
  recordImpression,
  recordClick,
};
