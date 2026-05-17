const adsService = require("../services/adsService");
const contentAdsNotificationService = require("../services/contentAdsNotificationService");
const { uploadAdPromoImageBuffer } = require("../services/cloudinaryUploadService");
const { createPublicApiError } = require("../utils/publicApiError");

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
    adsService.assertAdminNote(req.body?.adminNote);
    const { adminNote, ...payload } = req.body || {};
    void adminNote;
    const ad = await adsService.createAd(payload);
    void contentAdsNotificationService
      .notifyAdLifecycle({ action: "created", ad, actorUserId: req.auth?.userId })
      .catch(() => {});
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
    adsService.assertAdminNote(req.body?.adminNote);
    const { adminNote, ...payload } = req.body || {};
    void adminNote;
    const before = await adsService.getById(id);
    const ad = await adsService.updateAd(id, payload);
    if (!ad) {
      return res.status(404).json({ success: false, message: "الإعلان غير موجود.", code: "NOT_FOUND" });
    }
    void contentAdsNotificationService
      .notifyAdLifecycle({
        action: "updated",
        ad,
        actorUserId: req.auth?.userId,
        previous: before ? { isActive: before.isActive } : null,
      })
      .catch(() => {});
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
    adsService.assertAdminNote(req.body?.adminNote);
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
    adsService.assertAdminNote(req.body?.adminNote);
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
    adsService.assertAdminNote(req.body?.adminNote);
    const items = req.body?.items;
    const placement = req.body?.placement || "home_right_panel";
    const n = await adsService.reorderAds(items, placement);
    return res.status(200).json({ success: true, data: { updated: n } });
  } catch (err) {
    return next(err);
  }
}

async function uploadAdImage(req, res, next) {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      throw createPublicApiError("لم يتم اختيار صورة.", 400, "VALIDATION_ERROR");
    }
    const purpose = req.body?.purpose === "background" ? "background" : "main";
    const uploaded = await uploadAdPromoImageBuffer({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      userId: req.auth?.userId,
      purpose,
    });
    return res.status(200).json({
      success: true,
      data: { url: uploaded.secureUrl || uploaded.url, purpose },
    });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: err.message || "ملف غير صالح.",
        code: err.publicCode || "VALIDATION_ERROR",
      });
    }
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
  uploadAdImage,
};
