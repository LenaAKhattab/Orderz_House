const {
  CLIENT_EMITTABLE,
  normalizeEventType,
  normalizeChannel,
  normalizeLocale,
  normalizeSessionId,
  authorizeSessionOwnership,
  recordFunnelEvent,
} = require("../services/paymentCheckoutFunnelTelemetry");

/**
 * POST /api/payments/checkout-funnel-events
 * Allowlisted client telemetry only. Authenticated; ownership derived server-side.
 */
async function postCheckoutFunnelEvent(req, res) {
  const eventType = normalizeEventType(req.body?.eventType);
  if (!eventType || !CLIENT_EMITTABLE.includes(eventType)) {
    return res.status(400).json({
      success: false,
      message: "Unsupported event type.",
      code: "UNSUPPORTED_FUNNEL_EVENT",
    });
  }

  const sessionId = normalizeSessionId(req.body?.stripeCheckoutSessionId || req.body?.sessionId);
  if (!sessionId) {
    return res.status(400).json({
      success: false,
      message: "Valid checkout session id required.",
      code: "INVALID_CHECKOUT_SESSION",
    });
  }

  const channel = normalizeChannel(req.body?.channel);
  if (!channel) {
    return res.status(400).json({
      success: false,
      message: "channel must be web or mobile.",
      code: "INVALID_CHANNEL",
    });
  }

  const locale = normalizeLocale(req.body?.locale);
  if (req.body?.locale != null && String(req.body.locale).trim() !== "" && !locale) {
    return res.status(400).json({
      success: false,
      message: "locale must be one of ar,en,de,nl,ro.",
      code: "INVALID_LOCALE",
    });
  }

  const userId = req.auth?.userId;
  let ownership;
  try {
    ownership = await authorizeSessionOwnership({
      userId,
      sessionId,
      claimedFlow: req.body?.paymentFlow,
    });
  } catch {
    return res.status(503).json({
      success: false,
      message: "Telemetry temporarily unavailable.",
      code: "FUNNEL_TELEMETRY_UNAVAILABLE",
    });
  }

  if (!ownership.ok) {
    return res.status(403).json({
      success: false,
      message: "Not allowed.",
      code: "FUNNEL_EVENT_FORBIDDEN",
    });
  }

  const result = await recordFunnelEvent({
    eventType,
    paymentFlow: ownership.paymentFlow,
    channel,
    locale,
    stripeCheckoutSessionId: sessionId,
    localRef: ownership.localRef,
    actorUserId: userId,
  });

  // Always 204-style success for clients (idempotent / best-effort); never block UX.
  return res.status(204).send();
}

module.exports = { postCheckoutFunnelEvent };
