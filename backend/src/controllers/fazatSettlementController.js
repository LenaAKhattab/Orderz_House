const fazatSettlementService = require("../services/fazatSettlementService");

async function createSettlement(req, res, next) {
  try {
    const result = await fazatSettlementService.receiveSettlement(req.body || {}, {
      idempotencyKey: req.fazatPartner?.idempotencyKey || req.headers["x-idempotency-key"] || null,
    });
    return res.status(result.idempotentReplay ? 200 : 201).json({
      success: true,
      idempotentReplay: Boolean(result.idempotentReplay),
      data: result.settlement,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createSettlement,
};
