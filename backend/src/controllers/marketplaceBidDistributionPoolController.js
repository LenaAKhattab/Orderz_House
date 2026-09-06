/**
 * Super Admin Bid Distribution Pool controller — Phase D1 (API foundation only).
 */
const poolService = require("../services/marketplaceBidDistributionPoolService");
const { calculatePoolBidsFromBudget } = require("../utils/marketplaceBidPoolMoney");

/** Preview server-side money→Bids calculation (no persistence). */
async function previewPoolCalculation(req, res, next) {
  try {
    const calc = calculatePoolBidsFromBudget({
      budgetJod: req.body.budgetJod,
      bidUnitPriceJod: req.body.bidUnitPriceJod,
    });
    return res.json({
      success: true,
      data: {
        totalBids: calc.totalBids,
        budgetJod: calc.budgetJod,
        bidUnitPriceJod: calc.bidUnitPriceJod,
        monetaryRemainderJod: calc.monetaryRemainderJod,
        totalSource: "SERVER_CALCULATION",
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function createPool(req, res, next) {
  try {
    const out = await poolService.createBidDistributionPool({
      name: req.body.name,
      budgetJod: req.body.budgetJod,
      bidUnitPriceJod: req.body.bidUnitPriceJod,
      actorUserId: req.user.id,
    });
    return res.status(201).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function listPools(req, res, next) {
  try {
    const pools = await poolService.listBidDistributionPools({
      limit: req.query.limit,
      offset: req.query.offset,
      status: req.query.status || null,
    });
    return res.json({ success: true, data: { pools } });
  } catch (err) {
    return next(err);
  }
}

async function getPool(req, res, next) {
  try {
    const pool = await poolService.getBidDistributionPoolById(Number(req.params.poolId));
    if (!pool) {
      return res.status(404).json({ success: false, message: "Pool not found." });
    }
    const accounting = await poolService.getPoolAccountingSnapshot(pool.id);
    return res.json({ success: true, data: { pool, accounting } });
  } catch (err) {
    return next(err);
  }
}

async function allocateBatch(req, res, next) {
  try {
    const out = await poolService.allocateBidDistributionBatch({
      poolId: Number(req.params.poolId),
      distributionMode: req.body.distributionMode,
      bidsPerFreelancer: Number(req.body.bidsPerFreelancer),
      freelancerUserIds: req.body.freelancerUserIds || null,
      recipientCount:
        req.body.recipientCount != null ? Number(req.body.recipientCount) : null,
      expirationMode: req.body.expirationMode,
      expirationValue:
        req.body.expirationValue != null ? Number(req.body.expirationValue) : null,
      expiresAt: req.body.expiresAt || null,
      actorUserId: req.user.id,
      idempotencyKey: req.body.idempotencyKey || null,
      reason: req.body.reason || null,
    });
    return res.status(201).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  previewPoolCalculation,
  createPool,
  listPools,
  getPool,
  allocateBatch,
};
