const adsService = require("../services/adsService");

async function listAds(req, res, next) {
  try {
    const ads = await adsService.listAllForAdmin();
    return res.status(200).json({ success: true, data: { ads } });
  } catch (err) {
    return next(err);
  }
}

async function getAd(req, res, next) {
  try {
    const id = req.params?.id;
    const ad = await adsService.getById(id);
    if (!ad) {
      return res.status(404).json({ success: false, message: "الإعلان غير موجود.", code: "NOT_FOUND" });
    }
    return res.status(200).json({ success: true, data: ad });
  } catch (err) {
    return next(err);
  }
}

async function createAd(req, res, next) {
  try {
    const ad = await adsService.createAd(req.body);
    return res.status(201).json({ success: true, data: ad });
  } catch (err) {
    if (err.code === "ADS_VALIDATION") {
      return res.status(400).json({
        success: false,
        message: err.message || "بيانات غير صالحة.",
        code: "ADS_VALIDATION",
        details: err.details || [],
      });
    }
    return next(err);
  }
}

async function updateAd(req, res, next) {
  try {
    const id = req.params?.id;
    const ad = await adsService.updateAd(id, req.body);
    if (!ad) {
      return res.status(404).json({ success: false, message: "الإعلان غير موجود.", code: "NOT_FOUND" });
    }
    return res.status(200).json({ success: true, data: ad });
  } catch (err) {
    if (err.code === "ADS_VALIDATION") {
      return res.status(400).json({
        success: false,
        message: err.message || "بيانات غير صالحة.",
        code: "ADS_VALIDATION",
        details: err.details || [],
      });
    }
    return next(err);
  }
}

async function deleteAd(req, res, next) {
  try {
    const id = req.params?.id;
    const ok = await adsService.deleteAd(id);
    if (!ok) {
      return res.status(404).json({ success: false, message: "الإعلان غير موجود.", code: "NOT_FOUND" });
    }
    return res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    return next(err);
  }
}

async function duplicateAd(req, res, next) {
  try {
    const id = req.params?.id;
    const ad = await adsService.duplicateAd(id);
    if (!ad) {
      return res.status(404).json({ success: false, message: "الإعلان غير موجود.", code: "NOT_FOUND" });
    }
    return res.status(201).json({ success: true, data: ad });
  } catch (err) {
    if (err.code === "ADS_VALIDATION") {
      return res.status(400).json({
        success: false,
        message: err.message || "بيانات غير صالحة.",
        code: "ADS_VALIDATION",
        details: err.details || [],
      });
    }
    return next(err);
  }
}

async function reorderAds(req, res, next) {
  try {
    const items = req.body?.items;
    const n = await adsService.reorderAds(items);
    return res.status(200).json({ success: true, data: { updated: n } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listAds,
  getAd,
  createAd,
  updateAd,
  deleteAd,
  duplicateAd,
  reorderAds,
};
