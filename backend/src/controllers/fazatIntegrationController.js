const fazatFreelancerProfileService = require("../services/fazatFreelancerProfileService");
const fazatPartnerOrderService = require("../services/fazatPartnerOrderService");
const fazatPartnerMessageService = require("../services/fazatPartnerMessageService");

async function listFreelancers(req, res, next) {
  try {
    const data = await fazatFreelancerProfileService.listAssignableSnapshots({
      limit: req.query.limit,
      offset: req.query.offset,
      rank: req.query.rank || null,
    });
    return res.json({ success: true, partnerCode: "FAZAT", count: data.length, data });
  } catch (err) {
    return next(err);
  }
}

async function patchFreelancerRank(req, res, next) {
  try {
    const data = await fazatFreelancerProfileService.upsertRank({
      freelancerId: req.params.freelancerId,
      rank: req.body?.rank,
      notesInternal: req.body?.notesInternal,
      isAssignable: req.body?.isAssignable,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function createOrder(req, res, next) {
  try {
    const result = await fazatPartnerOrderService.createPartnerOrder(req.body || {}, {
      idempotencyKey: req.fazatPartner?.idempotencyKey || req.headers["x-idempotency-key"] || null,
    });
    return res.status(result.idempotentReplay ? 200 : 201).json({
      success: true,
      idempotentReplay: Boolean(result.idempotentReplay),
      data: result.partnerOrder,
    });
  } catch (err) {
    return next(err);
  }
}

async function getOrder(req, res, next) {
  try {
    const result = await fazatPartnerOrderService.getPartnerOrderByOrderzId(req.params.orderId);
    return res.json({ success: true, data: result.partnerOrder });
  } catch (err) {
    return next(err);
  }
}

async function postMessage(req, res, next) {
  try {
    const result = await fazatPartnerMessageService.createPartnerProxyMessage(req.params.orderId, req.body || {});
    return res.status(result.idempotentReplay ? 200 : 201).json({
      success: true,
      idempotentReplay: Boolean(result.idempotentReplay),
      data: result.message,
    });
  } catch (err) {
    return next(err);
  }
}

async function listMessages(req, res, next) {
  try {
    const data = await fazatPartnerMessageService.listMessages(req.params.orderId);
    return res.json({ success: true, count: data.length, data });
  } catch (err) {
    return next(err);
  }
}

async function listDeliveries(req, res, next) {
  try {
    const data = await fazatPartnerOrderService.getDeliveries(req.params.orderId);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function requestRevision(req, res, next) {
  try {
    const result = await fazatPartnerOrderService.requestRevision(req.params.orderId, {
      note: req.body?.note || req.body?.message,
    });
    return res.json({ success: true, data: result.partnerOrder });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listFreelancers,
  patchFreelancerRank,
  createOrder,
  getOrder,
  postMessage,
  listMessages,
  listDeliveries,
  requestRevision,
};
