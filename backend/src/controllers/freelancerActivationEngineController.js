const service = require("../services/freelancerActivationEngineService");
const earnedBalanceService = require("../services/freelancerActivationEarnedBalanceService");
const conversionService = require("../services/freelancerActivationConversionService");
const kpiService = require("../services/freelancerActivationKpiService");
const workInventoryReserveService = require("../services/freelancerActivationWorkInventoryReserveService");
const forfeitureService = require("../services/trialPendingEarningsForfeitureService");

async function getMyTrial(req, res, next) {
  try {
    const userId = req.auth?.userId || req.user?.id || req.user?.sub;
    const data = await service.getFreelancerActivationTrialState(userId);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getMyConversion(req, res, next) {
  try {
    const userId = req.auth?.userId || req.user?.id || req.user?.sub;
    const data = await conversionService.getFreelancerActivationConversion(userId);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function postCtaViewed(req, res, next) {
  try {
    const userId = req.auth?.userId || req.user?.id || req.user?.sub;
    const data = await conversionService.recordSilverCtaViewed(userId);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function postStartSilverCheckout(req, res, next) {
  try {
    const userId = req.auth?.userId || req.user?.id || req.user?.sub;
    const data = await conversionService.startSilverCheckout(userId);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getMyEarnedBalance(req, res, next) {
  try {
    const userId = req.auth?.userId || req.user?.id || req.user?.sub;
    const data = await earnedBalanceService.getFreelancerEarnedBalance(userId);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getAdminEarnedBalance(req, res, next) {
  try {
    const data = await earnedBalanceService.getSuperAdminEarnedBalanceSummary();
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function activateMyTrial(req, res, next) {
  try {
    const userId = req.auth?.userId || req.user?.id || req.user?.sub;
    const out = await service.activateFreelancerTrialIfEligible(userId, {
      actorUserId: userId,
    });
    return res.status(out.created ? 201 : 200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function getAdminTrials(req, res, next) {
  try {
    const data = await service.getSuperAdminActivationOverview({
      recentLimit: req.query?.limit,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getAdminSettings(req, res, next) {
  try {
    const settings = await service.getActivationEngineSettings();
    return res.json({ success: true, data: { settings } });
  } catch (err) {
    return next(err);
  }
}

async function updateAdminSettings(req, res, next) {
  try {
    const actorUserId = req.auth?.userId || req.user?.id || req.user?.sub;
    const settings = await service.updateActivationEngineSettings(req.body || {}, { actorUserId });
    return res.json({ success: true, data: { settings } });
  } catch (err) {
    return next(err);
  }
}

async function getAdminKpis(req, res, next) {
  try {
    const data = await kpiService.getFreelancerActivationKpis({
      campaignId: req.query?.campaignId,
      waveId: req.query?.waveId,
      dateFrom: req.query?.dateFrom,
      dateTo: req.query?.dateTo,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getAdminWorkInventoryReserve(req, res, next) {
  try {
    const data = await workInventoryReserveService.getSuperAdminWorkInventoryReserveSummary({
      dateFrom: req.query?.dateFrom || null,
      dateTo: req.query?.dateTo || null,
      planCode: req.query?.planCode || null,
      recentLimit: req.query?.limit,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function postAdminEvaluateForfeiture(req, res, next) {
  try {
    const freelancerUserId = Number(req.params?.freelancerUserId);
    const data = await forfeitureService.evaluateAndApplyForfeitureIfDue(freelancerUserId, {
      now: new Date(),
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMyTrial,
  getMyConversion,
  postCtaViewed,
  postStartSilverCheckout,
  getMyEarnedBalance,
  activateMyTrial,
  getAdminTrials,
  getAdminEarnedBalance,
  getAdminSettings,
  updateAdminSettings,
  getAdminKpis,
  getAdminWorkInventoryReserve,
  postAdminEvaluateForfeiture,
};
