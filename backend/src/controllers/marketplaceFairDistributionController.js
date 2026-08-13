const fairDist = require("../services/marketplaceFairDistributionService");

async function getDecisionByOrderId(req, res, next) {
  try {
    const orderId = req.params.orderId;
    const decision = await fairDist.getFairDistributionDecisionByOrderId(orderId);
    if (!decision) {
      return res.status(404).json({
        success: false,
        error: { code: "FAIR_DISTRIBUTION_DECISION_NOT_FOUND", message: "No Fair Distribution decision for this order." },
      });
    }
    return res.status(200).json({ success: true, data: { decision } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getDecisionByOrderId,
};
