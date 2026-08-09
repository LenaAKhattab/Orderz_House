const marketplaceEconomySettingsService = require("../services/marketplaceEconomySettingsService");

async function getSettings(req, res, next) {
  try {
    const settings = await marketplaceEconomySettingsService.getMarketplaceEconomySettings();
    return res.status(200).json({ success: true, data: { settings } });
  } catch (err) {
    return next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const settings = await marketplaceEconomySettingsService.updateMarketplaceEconomySettings({
      actorUserId: req.auth?.userId,
      patch: req.body || {},
    });
    return res.status(200).json({ success: true, data: { settings } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSettings,
  updateSettings,
};
