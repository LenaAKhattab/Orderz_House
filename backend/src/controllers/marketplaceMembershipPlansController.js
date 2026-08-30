const marketplaceMembershipPlansService = require("../services/marketplaceMembershipPlansService");
const specialOfferPackageService = require("../services/specialOfferPackageService");

async function listPublic(req, res, next) {
  try {
    const [items, specialOfferPackage] = await Promise.all([
      marketplaceMembershipPlansService.listPublicMarketplaceMembershipPlans(),
      specialOfferPackageService.getPublicSpecialOfferPackage(),
    ]);
    return res.status(200).json({
      success: true,
      data: { items, specialOfferPackage: specialOfferPackage || null },
    });
  } catch (err) {
    return next(err);
  }
}

async function listAdmin(req, res, next) {
  try {
    const includeInactive = String(req.query.includeInactive || "true") !== "false";
    const plans = await marketplaceMembershipPlansService.listAdminMarketplaceMembershipPlans({
      includeInactive,
    });
    return res.status(200).json({ success: true, data: { plans } });
  } catch (err) {
    return next(err);
  }
}

async function getAdminById(req, res, next) {
  try {
    const plan = await marketplaceMembershipPlansService.getMarketplaceMembershipPlanById(req.params.id);
    if (!plan) {
      return res.status(404).json({ success: false, message: "الباقة غير موجودة." });
    }
    return res.status(200).json({ success: true, data: { plan } });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    const plan = await marketplaceMembershipPlansService.createMarketplaceMembershipPlan(req.body || {});
    return res.status(201).json({ success: true, data: { plan } });
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const plan = await marketplaceMembershipPlansService.updateMarketplaceMembershipPlan(
      req.params.id,
      req.body || {},
    );
    return res.status(200).json({ success: true, data: { plan } });
  } catch (err) {
    return next(err);
  }
}

async function reorder(req, res, next) {
  try {
    const plans = await marketplaceMembershipPlansService.reorderMarketplaceMembershipPlans({
      orderedIds: req.body?.orderedIds,
    });
    return res.status(200).json({ success: true, data: { plans } });
  } catch (err) {
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await marketplaceMembershipPlansService.deleteMarketplaceMembershipPlan(req.params.id);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listPublic,
  listAdmin,
  getAdminById,
  create,
  update,
  reorder,
  remove,
};
