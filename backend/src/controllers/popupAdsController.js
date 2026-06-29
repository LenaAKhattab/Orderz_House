const popupAdsService = require("../services/popupAdsService");

async function listAds(req, res, next) {
  try {
    const ads = await popupAdsService.listForAdmin();
    return res.status(200).json({ success: true, data: { ads } });
  } catch (err) {
    return next(err);
  }
}

async function createAd(req, res, next) {
  try {
    const ad = await popupAdsService.createAd(req.body || {});
    return res.status(201).json({ success: true, data: { ad } });
  } catch (err) {
    if (err.status === 400 && err.fieldErrors) {
      return res.status(400).json({
        success: false,
        message: err.message || "Validation failed",
        fieldErrors: err.fieldErrors,
      });
    }
    return next(err);
  }
}

async function updateAd(req, res, next) {
  try {
    const ad = await popupAdsService.updateAd(Number(req.params.id), req.body || {});
    return res.status(200).json({ success: true, data: { ad } });
  } catch (err) {
    if (err.status === 400 && err.fieldErrors) {
      return res.status(400).json({
        success: false,
        message: err.message || "Validation failed",
        fieldErrors: err.fieldErrors,
      });
    }
    if (err.status === 404) {
      return res.status(404).json({ success: false, message: err.message || "Not found" });
    }
    return next(err);
  }
}

async function deleteAd(req, res, next) {
  try {
    await popupAdsService.deleteAd(Number(req.params.id));
    return res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ success: false, message: err.message || "Not found" });
    }
    return next(err);
  }
}

module.exports = {
  listAds,
  createAd,
  updateAd,
  deleteAd,
};
