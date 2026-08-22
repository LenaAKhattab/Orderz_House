const {
  getSuperAdminFreelancerBildazoIntegrationSummary,
} = require("../services/superAdminFreelancerBildazoIntegrationService");

async function getSummary(req, res, next) {
  try {
    const data = await getSuperAdminFreelancerBildazoIntegrationSummary(req.params.freelancerUserId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSummary,
};
