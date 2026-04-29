const financialClaimsService = require("../services/financialClaimsService");

const listFinancialClaims = async (req, res, next) => {
  try {
    const claims = await financialClaimsService.listClaimsForSuperAdmin({
      q: req.query.q || "",
      status: req.query.status || "",
      payoutStatus: req.query.payoutStatus || "",
    });
    return res.status(200).json({ success: true, data: { claims } });
  } catch (err) {
    return next(err);
  }
};

const getFinancialClaimById = async (req, res, next) => {
  try {
    const claim = await financialClaimsService.getClaimDetailsForSuperAdmin({ claimId: req.params.id });
    if (!claim) return res.status(404).json({ success: false, message: "المطالبة غير موجودة." });
    return res.status(200).json({ success: true, data: { claim } });
  } catch (err) {
    return next(err);
  }
};

const updateFinancialClaimStatus = async (req, res, next) => {
  try {
    const claim = await financialClaimsService.updateClaimStatusBySuperAdmin({
      actorUserId: req.auth.userId,
      claimId: req.params.id,
      newStatus: req.body.status,
      adminNote: req.body.adminNote || null,
    });
    return res.status(200).json({ success: true, data: { claim } });
  } catch (err) {
    return next(err);
  }
};

const updateFinancialClaimPricing = async (req, res, next) => {
  try {
    const claim = await financialClaimsService.updateClaimPricingBySuperAdmin({
      actorUserId: req.auth.userId,
      claimId: req.params.id,
      totalPriceSnapshot: req.body.totalPriceSnapshot,
      userPercentageSnapshot: req.body.userPercentageSnapshot,
      companyPercentageSnapshot: req.body.companyPercentageSnapshot,
    });
    return res.status(200).json({ success: true, data: { claim } });
  } catch (err) {
    return next(err);
  }
};

const createFreelancerPayment = async (req, res, next) => {
  try {
    const result = await financialClaimsService.createFreelancerPaymentBySuperAdmin({
      actorUserId: req.auth.userId,
      freelancerId: req.body.freelancerId,
      paymentMethod: req.body.paymentMethod,
      paymentReference: req.body.paymentReference || null,
      paidAt: req.body.paidAt || null,
      claimIds: req.body.claimIds || [],
    });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listFinancialClaims,
  getFinancialClaimById,
  updateFinancialClaimStatus,
  updateFinancialClaimPricing,
  createFreelancerPayment,
};
