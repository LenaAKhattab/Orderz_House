const planFeaturesService = require("../services/planFeaturesService");

const listPlanFeatures = async (req, res, next) => {
  try {
    const features = await planFeaturesService.listFeaturesForPlan(req.params.planId);
    return res.status(200).json({ success: true, data: { features } });
  } catch (err) {
    return next(err);
  }
};

const replacePlanFeatures = async (req, res, next) => {
  try {
    const features = await planFeaturesService.replaceFeaturesForPlan({
      planId: req.params.planId,
      features: req.body.features,
    });
    return res.status(200).json({ success: true, data: { features } });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listPlanFeatures,
  replacePlanFeatures,
};
