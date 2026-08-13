/**
 * Phase 8 Elite Direct Orders — HTTP controllers.
 */

const eliteSvc = require("../services/marketplaceEliteDirectOrdersService");
const { getMarketplaceEconomySettings, isEliteEngineActive } = require("../services/marketplaceEconomySettingsService");

function parseId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function createOffer(req, res, next) {
  try {
    const orderId = parseId(req.params.id || req.params.orderId || req.body?.orderId);
    const targetFreelancerUserId = parseId(req.body?.targetFreelancerUserId);
    if (!orderId || !targetFreelancerUserId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_INPUT",
        message: "orderId and targetFreelancerUserId are required.",
      });
    }
    const out = await eliteSvc.createEliteDirectOffer({
      orderId,
      targetFreelancerUserId,
      actorUserId: req.user.id,
      actorRole: req.user.role || (req.auth && req.auth.role) || "client",
      creationSource: req.body?.creationSource || null,
      idempotencyKey: req.body?.idempotencyKey || req.headers["idempotency-key"] || null,
    });
    return res.status(out.created ? 201 : 200).json({
      success: true,
      data: {
        offer: out.offer,
        created: out.created,
        idempotent: out.idempotent,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function listMyTargetOffers(req, res, next) {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const offers = await eliteSvc.listEliteOffersForTargetFreelancer(req.user.id, { status });
    return res.json({ success: true, data: { offers } });
  } catch (err) {
    return next(err);
  }
}

async function getOffer(req, res, next) {
  try {
    const offerId = parseId(req.params.offerId);
    if (!offerId) {
      return res.status(400).json({ success: false, code: "INVALID_OFFER_ID", message: "Invalid offer id." });
    }
    const offer = await eliteSvc.getEliteDirectOfferById(offerId);
    if (!offer) {
      return res.status(404).json({ success: false, code: "ELITE_OFFER_NOT_FOUND", message: "Not found." });
    }
    eliteSvc.assertCanViewOffer(offer, {
      userId: req.user.id,
      role: req.user.role,
    });
    return res.json({ success: true, data: { offer } });
  } catch (err) {
    return next(err);
  }
}

async function acceptOffer(req, res, next) {
  try {
    const offerId = parseId(req.params.offerId);
    if (!offerId) {
      return res.status(400).json({ success: false, code: "INVALID_OFFER_ID", message: "Invalid offer id." });
    }
    const out = await eliteSvc.acceptEliteDirectOffer({
      offerId,
      freelancerUserId: req.user.id,
    });
    return res.json({
      success: true,
      data: {
        offer: out.offer,
        paymentMode: out.paymentMode,
        idempotent: out.idempotent,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function declineOffer(req, res, next) {
  try {
    const offerId = parseId(req.params.offerId);
    if (!offerId) {
      return res.status(400).json({ success: false, code: "INVALID_OFFER_ID", message: "Invalid offer id." });
    }
    const out = await eliteSvc.declineEliteDirectOffer({
      offerId,
      freelancerUserId: req.user.id,
    });
    return res.json({ success: true, data: { offer: out.offer, idempotent: out.idempotent } });
  } catch (err) {
    return next(err);
  }
}

async function cancelOffer(req, res, next) {
  try {
    const offerId = parseId(req.params.offerId);
    if (!offerId) {
      return res.status(400).json({ success: false, code: "INVALID_OFFER_ID", message: "Invalid offer id." });
    }
    const out = await eliteSvc.cancelEliteDirectOffer({
      offerId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
    });
    return res.json({ success: true, data: { offer: out.offer, idempotent: out.idempotent } });
  } catch (err) {
    return next(err);
  }
}

async function listOffersForOrder(req, res, next) {
  try {
    const orderId = parseId(req.params.id || req.params.orderId);
    if (!orderId) {
      return res.status(400).json({ success: false, code: "INVALID_ORDER_ID", message: "Invalid order id." });
    }
    const offers = await eliteSvc.listEliteOffersForOrder(orderId);
    return res.json({ success: true, data: { offers } });
  } catch (err) {
    return next(err);
  }
}

async function adminGetOffer(req, res, next) {
  try {
    const offerId = parseId(req.params.offerId);
    if (!offerId) {
      return res.status(400).json({ success: false, code: "INVALID_OFFER_ID", message: "Invalid offer id." });
    }
    const offer = await eliteSvc.getEliteDirectOfferById(offerId);
    if (!offer) {
      return res.status(404).json({ success: false, code: "ELITE_OFFER_NOT_FOUND", message: "Not found." });
    }
    return res.json({ success: true, data: { offer } });
  } catch (err) {
    return next(err);
  }
}

async function engineStatus(_req, res, next) {
  try {
    const settings = await getMarketplaceEconomySettings();
    return res.json({
      success: true,
      data: {
        eliteEngineEnabled: isEliteEngineActive(settings),
        eliteOfferDurationMinutes: settings.eliteOfferDurationMinutes,
        eliteDirectOrdersPerCycle: settings.eliteDirectOrdersPerCycle,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function runEliteDirectOfferExpireTick(req, res, next) {
  try {
    const out = await eliteSvc.expireDueEliteDirectOffers({
      limit: Number(req.body?.limit) || 50,
    });
    return res.json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createOffer,
  listMyTargetOffers,
  getOffer,
  acceptOffer,
  declineOffer,
  cancelOffer,
  listOffersForOrder,
  adminGetOffer,
  engineStatus,
  runEliteDirectOfferExpireTick,
};
