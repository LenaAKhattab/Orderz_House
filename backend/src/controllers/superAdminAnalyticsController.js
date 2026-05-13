const superAdminAnalyticsOverviewService = require("../services/superAdminAnalyticsOverviewService");
const platformUiSettingsService = require("../services/platformUiSettingsService");

async function getVisitorsAnalytics(req, res, next) {
  try {
    const data = await superAdminAnalyticsOverviewService.getAnalyticsOverview({
      range: req.query.range,
      topLimit: req.query.topLimit,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getHeroPlatformSettings(req, res, next) {
  try {
    const data = await platformUiSettingsService.getPlatformUiSettings();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function patchHeroPlatformSettings(req, res, next) {
  try {
    const v = req.body?.showHomeVisitorsCount;
    const a = req.body?.showHomeActiveUsersCount;
    if (v === undefined && a === undefined) {
      return res.status(400).json({
        success: false,
        message: "أرسل showHomeVisitorsCount و/أو showHomeActiveUsersCount.",
        code: "VALIDATION_ERROR",
      });
    }
    if (v !== undefined && typeof v !== "boolean") {
      return res.status(400).json({ success: false, message: "showHomeVisitorsCount يجب أن تكون منطقية.", code: "VALIDATION_ERROR" });
    }
    if (a !== undefined && typeof a !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "showHomeActiveUsersCount يجب أن تكون منطقية.",
        code: "VALIDATION_ERROR",
      });
    }
    const patch = {};
    if (v !== undefined) patch.showHomeVisitorsCount = v;
    if (a !== undefined) patch.showHomeActiveUsersCount = a;
    const data = await platformUiSettingsService.updatePlatformUiSettings(patch);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getVisitorsAnalytics,
  getHeroPlatformSettings,
  patchHeroPlatformSettings,
};
