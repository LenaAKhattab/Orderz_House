const onboardingService = require("../services/onboardingService");

function userId(req) {
  return req.auth?.userId || req.user?.sub;
}

async function getMyCurrent(req, res, next) {
  try {
    const data = await onboardingService.getMyCurrent(userId(req));
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getGettingStarted(req, res, next) {
  try {
    const items = await onboardingService.getGettingStarted(userId(req));
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

async function postEvent(req, res, next) {
  try {
    const result = await onboardingService.recordEvent({
      userId: userId(req),
      itemId: req.body?.itemId,
      eventType: String(req.body?.eventType || "").trim(),
      metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : null,
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function adminList(req, res, next) {
  try {
    const items = await onboardingService.listAllItemsWithStats();
    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return next(err);
  }
}

async function adminCreate(req, res, next) {
  try {
    const item = await onboardingService.createItem(req.body, userId(req));
    return res.status(201).json({ success: true, data: { item } });
  } catch (err) {
    return next(err);
  }
}

async function adminUpdate(req, res, next) {
  try {
    const item = await onboardingService.updateItem(req.params.id, req.body);
    return res.status(200).json({ success: true, data: { item } });
  } catch (err) {
    return next(err);
  }
}

async function adminEnable(req, res, next) {
  try {
    const item = await onboardingService.setEnabled(req.params.id, true);
    return res.status(200).json({ success: true, data: { item } });
  } catch (err) {
    return next(err);
  }
}

async function adminDisable(req, res, next) {
  try {
    const item = await onboardingService.setEnabled(req.params.id, false);
    return res.status(200).json({ success: true, data: { item } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMyCurrent,
  getGettingStarted,
  postEvent,
  adminList,
  adminCreate,
  adminUpdate,
  adminEnable,
  adminDisable,
};
