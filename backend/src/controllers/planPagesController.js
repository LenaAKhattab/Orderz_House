const planPagesService = require("../services/planPagesService");

const getPublicPlanPageBySlug = async (req, res, next) => {
  try {
    const result = await planPagesService.getPublicPlanPageBySlug(req.params.slug);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
};

const getPublicDefaultPlanPage = async (req, res, next) => {
  try {
    const result = await planPagesService.getPublicDefaultPlanPage();
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
};

const getPublicSpecialPageCatalog = async (req, res, next) => {
  try {
    const { getPublicActivationFeeConfig } = require("../services/subscriptionActivationFeeService");
    const [plans, activationFee] = await Promise.all([
      planPagesService.listPublicSpecialPageCatalogPlans(),
      getPublicActivationFeeConfig(),
    ]);
    return res.status(200).json({ success: true, data: { plans, activationFee } });
  } catch (err) {
    return next(err);
  }
};

const listAdminPlanPages = async (req, res, next) => {
  try {
    const pages = await planPagesService.listPlanPages();
    return res.status(200).json({ success: true, data: { pages } });
  } catch (err) {
    return next(err);
  }
};

const createPlanPage = async (req, res, next) => {
  try {
    const page = await planPagesService.createPlanPage({ payload: req.body });
    return res.status(201).json({ success: true, data: { page } });
  } catch (err) {
    return next(err);
  }
};

const updatePlanPage = async (req, res, next) => {
  try {
    const page = await planPagesService.updatePlanPage({
      id: req.params.id,
      patch: req.body,
    });
    return res.status(200).json({ success: true, data: { page } });
  } catch (err) {
    return next(err);
  }
};

const deletePlanPage = async (req, res, next) => {
  try {
    await planPagesService.deletePlanPage({ id: req.params.id });
    return res.status(200).json({ success: true, message: "Plan page deleted." });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getPublicPlanPageBySlug,
  getPublicDefaultPlanPage,
  getPublicSpecialPageCatalog,
  listAdminPlanPages,
  createPlanPage,
  updatePlanPage,
  deletePlanPage,
};
