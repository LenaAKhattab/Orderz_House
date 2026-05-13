const adsService = require("../services/adsService");

async function listAds(req, res, next) {
  try {
    const placement = req.query?.placement || "home_right_panel";
    const ads = await adsService.listPublicActive(placement);
    return res.status(200).json({ success: true, data: { ads } });
  } catch (err) {
    return next(err);
  }
}

async function recordImpression(req, res, next) {
  try {
    const id = req.params?.id;
    if (!id || !/^\d+$/.test(String(id))) {
      return res.status(400).json({ success: false, message: "معرّف غير صالح.", code: "VALIDATION_ERROR" });
    }
    const placement = req.query?.placement || "home_right_panel";
    const active = await adsService.listPublicActive(placement);
    const poolIds = new Set(active.map((a) => a.id));
    if (!poolIds.has(String(id))) {
      return res.status(404).json({ success: false, message: "غير موجود.", code: "NOT_FOUND" });
    }
    await adsService.incrementImpression(id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function recordClick(req, res, next) {
  try {
    const id = req.params?.id;
    if (!id || !/^\d+$/.test(String(id))) {
      return res.status(400).json({ success: false, message: "معرّف غير صالح.", code: "VALIDATION_ERROR" });
    }
    const placement = req.query?.placement || "home_right_panel";
    const active = await adsService.listPublicActive(placement);
    const poolIds = new Set(active.map((a) => a.id));
    if (!poolIds.has(String(id))) {
      return res.status(404).json({ success: false, message: "غير موجود.", code: "NOT_FOUND" });
    }
    await adsService.incrementClick(id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listAds,
  recordImpression,
  recordClick,
};
