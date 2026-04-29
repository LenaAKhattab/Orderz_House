const fakeOrdersService = require("../services/fakeOrdersService");

async function createTemplate(req, res, next) {
  try {
    const template = await fakeOrdersService.createTemplate({
      actorUserId: req.auth.userId,
      payload: req.body,
    });
    return res.status(201).json({ success: true, data: { template } });
  } catch (err) {
    return next(err);
  }
}

async function listTemplates(req, res, next) {
  try {
    const templates = await fakeOrdersService.listTemplates({
      includeInactive: String(req.query.includeInactive || "").toLowerCase() === "true",
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    return res.status(200).json({ success: true, data: templates });
  } catch (err) {
    return next(err);
  }
}

async function updateTemplate(req, res, next) {
  try {
    const template = await fakeOrdersService.updateTemplate({
      actorUserId: req.auth.userId,
      templateId: req.params.id,
      patch: req.body,
    });
    if (!template) return res.status(404).json({ success: false, message: "القالب غير موجود." });
    return res.status(200).json({ success: true, data: { template } });
  } catch (err) {
    return next(err);
  }
}

async function deactivateTemplate(req, res, next) {
  try {
    const template = await fakeOrdersService.deactivateTemplate({
      actorUserId: req.auth.userId,
      templateId: req.params.id,
    });
    if (!template) return res.status(404).json({ success: false, message: "القالب غير موجود." });
    return res.status(200).json({ success: true, data: { template } });
  } catch (err) {
    return next(err);
  }
}

async function createRound(req, res, next) {
  try {
    const round = await fakeOrdersService.createRound({
      actorUserId: req.auth.userId,
      payload: req.body,
    });
    return res.status(201).json({ success: true, data: round });
  } catch (err) {
    return next(err);
  }
}

async function getSettings(req, res, next) {
  try {
    const settings = await fakeOrdersService.getSettings();
    return res.status(200).json({ success: true, data: { settings } });
  } catch (err) {
    return next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const settings = await fakeOrdersService.updateSettings({
      actorUserId: req.auth.userId,
      patch: req.body,
    });
    return res.status(200).json({ success: true, data: { settings } });
  } catch (err) {
    return next(err);
  }
}

async function listRounds(req, res, next) {
  try {
    const rounds = await fakeOrdersService.listRounds();
    return res.status(200).json({ success: true, data: { rounds } });
  } catch (err) {
    return next(err);
  }
}

async function getRound(req, res, next) {
  try {
    const out = await fakeOrdersService.getRoundById({ roundId: req.params.id });
    if (!out) return res.status(404).json({ success: false, message: "الجولة غير موجودة." });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function stopRound(req, res, next) {
  try {
    const out = await fakeOrdersService.stopRound({ actorUserId: req.auth.userId, roundId: req.params.id });
    if (!out) return res.status(404).json({ success: false, message: "الجولة غير موجودة." });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function roundAnalytics(req, res, next) {
  try {
    const out = await fakeOrdersService.getRoundById({ roundId: req.params.id });
    if (!out) return res.status(404).json({ success: false, message: "الجولة غير موجودة." });
    return res.status(200).json({ success: true, data: { analytics: out.analytics, orders: out.orders, round: out.round } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createTemplate,
  listTemplates,
  updateTemplate,
  deactivateTemplate,
  createRound,
  listRounds,
  getRound,
  stopRound,
  roundAnalytics,
  getSettings,
  updateSettings,
};
