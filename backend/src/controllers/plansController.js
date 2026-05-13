const plansService = require("../services/plansService");

const listAdminPlans = async (req, res, next) => {
  try {
    const includeDeleted = String(req.query.includeDeleted || "false") === "true";
    const plans = await plansService.listPlans({ includeDeleted });
    return res.status(200).json({ success: true, data: { plans } });
  } catch (err) {
    return next(err);
  }
};

const listPublicPlans = async (req, res, next) => {
  try {
    const plans = await plansService.listPublicCatalogPlans();
    return res.status(200).json({ success: true, data: { plans } });
  } catch (err) {
    return next(err);
  }
};

const createPlan = async (req, res, next) => {
  try {
    const plan = await plansService.createPlan({ actorUserId: req.auth?.userId, payload: req.body });
    return res.status(201).json({ success: true, data: { plan } });
  } catch (err) {
    return next(err);
  }
};

const updatePlan = async (req, res, next) => {
  try {
    const plan = await plansService.updatePlan({
      actorUserId: req.auth?.userId,
      id: req.params.id,
      patch: req.body,
    });
    return res.status(200).json({ success: true, data: { plan } });
  } catch (err) {
    return next(err);
  }
};

const deletePlan = async (req, res, next) => {
  try {
    await plansService.softDeletePlan({ actorUserId: req.auth?.userId, id: req.params.id });
    return res.status(200).json({ success: true, message: "Plan deleted." });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listAdminPlans,
  listPublicPlans,
  createPlan,
  updatePlan,
  deletePlan,
};

