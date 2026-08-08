const websiteFooterAppDownloadsService = require("../services/websiteFooterAppDownloadsService");

async function getPublicFooterAppDownloads(req, res, next) {
  try {
    const settings = await websiteFooterAppDownloadsService.getFooterAppDownloads();
    return res.json({ success: true, data: { settings } });
  } catch (err) {
    return next(err);
  }
}

async function getPublicFooterSettings(req, res, next) {
  try {
    const settings = await websiteFooterAppDownloadsService.getFooterSettings();
    return res.json({ success: true, data: { settings } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPublicFooterAppDownloads,
  getPublicFooterSettings,
};
