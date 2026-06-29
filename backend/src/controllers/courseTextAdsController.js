const courseTextAdsService = require("../services/courseTextAdsService");

async function listAds(req, res, next) {
  try {
    const ads = await courseTextAdsService.listForAdmin();
    return res.status(200).json({ success: true, data: { ads } });
  } catch (err) {
    return next(err);
  }
}

async function createAd(req, res, next) {
  try {
    const ad = await courseTextAdsService.createAd(req.body || {});
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
    const ad = await courseTextAdsService.updateAd(Number(req.params.id), req.body || {});
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
    await courseTextAdsService.deleteAd(Number(req.params.id));
    return res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ success: false, message: err.message || "Not found" });
    }
    return next(err);
  }
}

async function getFreelancerDisplay(req, res, next) {
  try {
    const context = String(req.query.context || "");
    const courseId = req.query.courseId != null ? Number(req.query.courseId) : null;
    if (context === "course_details" && (!Number.isFinite(courseId) || courseId <= 0)) {
      return res.status(400).json({ success: false, message: "courseId is required for course_details" });
    }
    const data = await courseTextAdsService.getFreelancerDisplayAd({ context, courseId });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ success: false, message: err.message || "Bad request" });
    }
    return next(err);
  }
}

module.exports = {
  listAds,
  createAd,
  updateAd,
  deleteAd,
  getFreelancerDisplay,
};
