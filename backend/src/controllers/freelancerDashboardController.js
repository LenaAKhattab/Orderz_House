const freelancerDashboardService = require("../services/freelancerDashboardService");

async function getDashboardSummary(req, res, next) {
  try {
    const data = await freelancerDashboardService.getFreelancerDashboardSummary(req.auth.userId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getDashboardSummary,
};
