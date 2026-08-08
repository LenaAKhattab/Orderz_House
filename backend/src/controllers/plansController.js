const plansService = require("../services/plansService");
const planFeaturesService = require("../services/planFeaturesService");

async function syncPlanFeaturesFromPayload(planId, payload) {
  if (!Array.isArray(payload.features)) return;
  const enFeatures = Array.isArray(payload.featuresEn) ? payload.featuresEn : [];
  await planFeaturesService.replaceFeaturesForPlan({
    planId,
    features: payload.features.map((text, idx) => ({
      featureText: text,
      featureTextEn: enFeatures[idx] || null,
      sortOrder: idx,
      isIncluded: true,
    })),
  });
}

const listAdminPlans = async (req, res, next) => {
  try {
    const includeDeleted = String(req.query.includeDeleted || "false") === "true";
    const planPageId = req.query.planPageId != null ? Number(req.query.planPageId) : null;
    const plans = await plansService.listPlans({
      includeDeleted,
      planPageId: Number.isInteger(planPageId) && planPageId > 0 ? planPageId : null,
    });
    return res.status(200).json({ success: true, data: { plans } });
  } catch (err) {
    return next(err);
  }
};

const listPublicPlans = async (req, res, next) => {
  try {
    const { getPublicActivationFeeConfig } = require("../services/subscriptionActivationFeeService");
    const [plans, activationFee] = await Promise.all([
      plansService.listPublicCatalogPlans(),
      getPublicActivationFeeConfig(),
    ]);
    return res.status(200).json({ success: true, data: { plans, activationFee } });
  } catch (err) {
    return next(err);
  }
};

const createPlan = async (req, res, next) => {
  try {
    const plan = await plansService.createPlan({ actorUserId: req.auth?.userId, payload: req.body });
    if (Array.isArray(req.body.features)) {
      await syncPlanFeaturesFromPayload(plan.id, req.body);
      const refreshed = await plansService.getPlanById(plan.id);
      return res.status(201).json({ success: true, data: { plan: refreshed } });
    }
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
    if (Array.isArray(req.body.features)) {
      await syncPlanFeaturesFromPayload(req.params.id, req.body);
      const refreshed = await plansService.getPlanById(req.params.id);
      return res.status(200).json({ success: true, data: { plan: refreshed } });
    }
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

