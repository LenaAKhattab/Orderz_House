const fakeOrdersService = require("../services/fakeOrdersService");

const getTrainingSettings = async (req, res, next) => {
  try {
    const data = await fakeOrdersService.getSettings();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const patchTrainingSettings = async (req, res, next) => {
  try {
    const data = await fakeOrdersService.updateSettings({ actorUserId: req.auth.userId, patch: req.body || {} });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

const listTemplates = async (req, res, next) => {
  try {
    const isActiveQ = req.query.isActive;
    const isActive = isActiveQ === "true" ? true : isActiveQ === "false" ? false : null;
    const out = await fakeOrdersService.listTemplates({
      actorUserId: req.auth.userId,
      page: req.query.page,
      limit: req.query.limit,
      categoryId: req.query.categoryId || null,
      isActive,
      q: req.query.q || "",
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const getTemplate = async (req, res, next) => {
  try {
    const t = await fakeOrdersService.getTemplateById(req.params.id, { actorUserId: req.auth.userId });
    if (!t) return res.status(404).json({ success: false, message: "القالب غير موجود." });
    return res.status(200).json({ success: true, data: { template: t } });
  } catch (err) {
    return next(err);
  }
};

const createTemplate = async (req, res, next) => {
  try {
    const template = await fakeOrdersService.createTemplate({ actorUserId: req.auth.userId, payload: req.body || {} });
    return res.status(201).json({ success: true, data: { template } });
  } catch (err) {
    return next(err);
  }
};

const patchTemplate = async (req, res, next) => {
  try {
    const template = await fakeOrdersService.updateTemplate({ actorUserId: req.auth.userId, id: req.params.id, payload: req.body || {} });
    return res.status(200).json({ success: true, data: { template } });
  } catch (err) {
    return next(err);
  }
};

const removeTemplate = async (req, res, next) => {
  try {
    await fakeOrdersService.deleteTemplate({ actorUserId: req.auth.userId, id: req.params.id });
    return res.status(200).json({ success: true, data: { ok: true } });
  } catch (err) {
    return next(err);
  }
};

const listRounds = async (req, res, next) => {
  try {
    const out = await fakeOrdersService.listRounds({
      actorUserId: req.auth.userId,
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status || null,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const cancelRound = async (req, res, next) => {
  try {
    const round = await fakeOrdersService.cancelRound({ actorUserId: req.auth.userId, roundId: req.params.id });
    return res.status(200).json({ success: true, data: { round } });
  } catch (err) {
    return next(err);
  }
};

const listApplicationsSummary = async (req, res, next) => {
  try {
    const out = await fakeOrdersService.listFakeOrdersApplicantSummary({
      actorUserId: req.auth.userId,
      page: req.query.page,
      limit: req.query.limit,
      roundId: req.query.roundId || null,
      fakeOrderId: req.query.fakeOrderId || null,
      categoryId: req.query.categoryId || null,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const listApplications = async (req, res, next) => {
  try {
    const out = await fakeOrdersService.listTrainingApplications({
      actorUserId: req.auth.userId,
      page: req.query.page,
      limit: req.query.limit,
      roundId: req.query.roundId || null,
      fakeOrderId: req.query.fakeOrderId || null,
      categoryId: req.query.categoryId || null,
      freelancerUserId: req.query.freelancerUserId || null,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
};

const listApplicationsByFakeOrder = async (req, res, next) => {
  try {
    const applications = await fakeOrdersService.listApplicationsForFakeOrder({
      actorUserId: req.auth.userId,
      fakeOrderId: req.params.fakeOrderId,
    });
    return res.status(200).json({ success: true, data: { applications } });
  } catch (err) {
    return next(err);
  }
};

const startTrainingRound = async (req, res, next) => {
  try {
    const out = await fakeOrdersService.startTrainingRoundManual({ actorUserId: req.auth.userId });
    return res.status(201).json({
      success: true,
      data: { round: out.round, generatedCount: out.generatedCount },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getTrainingSettings,
  patchTrainingSettings,
  listTemplates,
  getTemplate,
  createTemplate,
  patchTemplate,
  removeTemplate,
  listRounds,
  cancelRound,
  listApplicationsSummary,
  listApplications,
  listApplicationsByFakeOrder,
  startTrainingRound,
};
