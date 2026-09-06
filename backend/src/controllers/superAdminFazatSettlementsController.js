const fazatSettlementService = require("../services/fazatSettlementService");

async function listSettlements(req, res, next) {
  try {
    const data = await fazatSettlementService.listSettlements({
      status: req.query.status || null,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json({ success: true, count: data.length, data });
  } catch (err) {
    return next(err);
  }
}

async function getSettlement(req, res, next) {
  try {
    const data = await fazatSettlementService.getSettlementById(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function approveSettlement(req, res, next) {
  try {
    const result = await fazatSettlementService.approveSettlement({
      settlementId: req.params.id,
      adminUserId: req.auth.userId,
      adminNote: req.body?.adminNote || null,
    });
    return res.json({
      success: true,
      idempotent: Boolean(result.idempotent),
      data: result.settlement,
    });
  } catch (err) {
    return next(err);
  }
}

async function rejectSettlement(req, res, next) {
  try {
    const result = await fazatSettlementService.rejectSettlement({
      settlementId: req.params.id,
      adminUserId: req.auth.userId,
      reason: req.body?.reason || req.body?.rejectionReason,
    });
    return res.json({
      success: true,
      idempotent: Boolean(result.idempotent),
      data: result.settlement,
    });
  } catch (err) {
    return next(err);
  }
}

async function adjustSettlement(req, res, next) {
  try {
    const data = await fazatSettlementService.adjustSettlement({
      settlementId: req.params.id,
      adjustedAmountMinor: req.body?.adjustedAmountMinor,
      reason: req.body?.reason || req.body?.adjustmentReason,
      adminUserId: req.auth.userId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function adjustAndApproveSettlement(req, res, next) {
  try {
    await fazatSettlementService.adjustSettlement({
      settlementId: req.params.id,
      adjustedAmountMinor: req.body?.adjustedAmountMinor,
      reason: req.body?.reason || req.body?.adjustmentReason,
      adminUserId: req.auth.userId,
    });
    const result = await fazatSettlementService.approveSettlement({
      settlementId: req.params.id,
      adminUserId: req.auth.userId,
      adminNote: req.body?.adminNote || null,
    });
    return res.json({
      success: true,
      idempotent: Boolean(result.idempotent),
      data: result.settlement,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listSettlements,
  getSettlement,
  approveSettlement,
  rejectSettlement,
  adjustSettlement,
  adjustAndApproveSettlement,
};
