const deviceTokensService = require("../services/deviceTokensService");

async function upsertPushToken(req, res, next) {
  try {
    const data = await deviceTokensService.upsertPushToken(req.auth.userId, req.body || {});
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function deactivatePushToken(req, res, next) {
  try {
    const token = req.body?.token || req.query?.token;
    const data = await deviceTokensService.deactivatePushToken(req.auth.userId, token);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function deactivateAllPushTokens(req, res, next) {
  try {
    const data = await deviceTokensService.deactivateAllPushTokensForUser(req.auth.userId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  upsertPushToken,
  deactivatePushToken,
  deactivateAllPushTokens,
};
