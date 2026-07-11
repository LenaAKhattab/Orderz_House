const superAdminAnalyticsOverviewService = require("../services/superAdminAnalyticsOverviewService");
const superAdminDashboardSummaryService = require("../services/superAdminDashboardSummaryService");
const superAdminDashboardBusinessKpisService = require("../services/superAdminDashboardBusinessKpisService");
const superAdminDashboardIntelligenceService = require("../services/superAdminDashboardIntelligenceService");
const superAdminDashboardHomeBundleService = require("../services/superAdminDashboardHomeBundleService");
const superAdminDashboardAnalysisService = require("../services/superAdminDashboardAnalysisService");
const platformUiSettingsService = require("../services/platformUiSettingsService");
const analyticsHealthService = require("../services/analyticsHealthService");
const { timedDashboardEndpoint } = require("../utils/superAdminDashboardTiming");

async function getVisitorsAnalytics(req, res, next) {
  try {
    const data = await timedDashboardEndpoint("analytics/visitors", () =>
      superAdminAnalyticsOverviewService.getPosthogProductAnalytics({
        range: req.query.range,
        topLimit: req.query.topLimit,
      }),
    );
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardBusinessKpis(req, res, next) {
  try {
    const data = await superAdminDashboardBusinessKpisService.getDashboardBusinessKpis();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getHeroPlatformSettings(req, res, next) {
  try {
    const data = await platformUiSettingsService.getPlatformUiSettings();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function patchHeroPlatformSettings(req, res, next) {
  try {
    const v = req.body?.showHomeVisitorsCount;
    const a = req.body?.showHomeActiveUsersCount;
    if (v === undefined && a === undefined) {
      return res.status(400).json({
        success: false,
        message: "أرسل showHomeVisitorsCount و/أو showHomeActiveUsersCount.",
        code: "VALIDATION_ERROR",
      });
    }
    if (v !== undefined && typeof v !== "boolean") {
      return res.status(400).json({ success: false, message: "showHomeVisitorsCount يجب أن تكون منطقية.", code: "VALIDATION_ERROR" });
    }
    if (a !== undefined && typeof a !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "showHomeActiveUsersCount يجب أن تكون منطقية.",
        code: "VALIDATION_ERROR",
      });
    }
    const patch = {};
    if (v !== undefined) patch.showHomeVisitorsCount = v;
    if (a !== undefined) patch.showHomeActiveUsersCount = a;
    const data = await platformUiSettingsService.updatePlatformUiSettings(patch);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getAnalyticsHealth(req, res, next) {
  try {
    const data = await analyticsHealthService.getAnalyticsHealthReport();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardSummary(req, res, next) {
  try {
    const data = await superAdminDashboardSummaryService.getDashboardSummary({
      userId: req.auth.userId,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardHomeBundle(req, res, next) {
  try {
    const range = req.query?.range;
    const data = await timedDashboardEndpoint("home-bundle", () =>
      superAdminDashboardHomeBundleService.getDashboardHomeBundle({
        userId: req.auth.userId,
        range,
      }),
    );
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardHomeFast(req, res, next) {
  try {
    const data = await timedDashboardEndpoint("home-fast", () =>
      superAdminDashboardHomeBundleService.getDashboardHomeFast({
        userId: req.auth.userId,
      }),
    );
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardHomeExecutiveKpis(req, res, next) {
  try {
    const data = await timedDashboardEndpoint("executive-kpis", () =>
      superAdminDashboardHomeBundleService.getDashboardHomeExecutiveKpis(),
    );
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardHomeIntelligence(req, res, next) {
  try {
    const range = req.query?.range;
    const data = await timedDashboardEndpoint("home-intelligence", () =>
      superAdminDashboardHomeBundleService.getDashboardHomeIntelligence({
        range,
      }),
    );
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardIntelligenceSummary(req, res, next) {
  try {
    const payload = await superAdminDashboardIntelligenceService.getSummaryIntelligence();
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardIntelligenceOrders(req, res, next) {
  try {
    const payload = await superAdminDashboardIntelligenceService.getOrdersIntelligence();
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardIntelligenceClients(req, res, next) {
  try {
    const payload = await superAdminDashboardIntelligenceService.getClientsIntelligence();
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardIntelligenceFreelancers(req, res, next) {
  try {
    const payload = await superAdminDashboardIntelligenceService.getFreelancersIntelligence();
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardIntelligenceSubscriptions(req, res, next) {
  try {
    const payload = await superAdminDashboardIntelligenceService.getSubscriptionsIntelligence();
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardIntelligenceCourses(req, res, next) {
  try {
    const payload = await superAdminDashboardIntelligenceService.getCoursesIntelligence();
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardIntelligenceCategories(req, res, next) {
  try {
    const payload = await superAdminDashboardIntelligenceService.getCategoriesIntelligence();
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardIntelligenceFinancial(req, res, next) {
  try {
    const payload = await superAdminDashboardIntelligenceService.getFinancialIntelligence();
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardIntelligenceAttention(req, res, next) {
  try {
    const payload = await superAdminDashboardIntelligenceService.getAttentionIntelligence();
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardIntelligenceActivity(req, res, next) {
  try {
    const payload = await superAdminDashboardIntelligenceService.getActivityIntelligence();
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return next(err);
  }
}

async function getDashboardAnalysis(req, res, next) {
  try {
    const data = await timedDashboardEndpoint("dashboard/analysis", () =>
      superAdminDashboardAnalysisService.getDashboardAnalysis({
        range: req.query?.range,
        currentOnly: req.query?.currentOnly,
      }),
    );
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getVisitorsAnalytics,
  getDashboardBusinessKpis,
  getHeroPlatformSettings,
  patchHeroPlatformSettings,
  getAnalyticsHealth,
  getDashboardSummary,
  getDashboardHomeBundle,
  getDashboardHomeFast,
  getDashboardHomeExecutiveKpis,
  getDashboardHomeIntelligence,
  getDashboardIntelligenceSummary,
  getDashboardIntelligenceOrders,
  getDashboardIntelligenceClients,
  getDashboardIntelligenceFreelancers,
  getDashboardIntelligenceSubscriptions,
  getDashboardIntelligenceCourses,
  getDashboardIntelligenceCategories,
  getDashboardIntelligenceFinancial,
  getDashboardIntelligenceAttention,
  getDashboardIntelligenceActivity,
  getDashboardAnalysis,
};
