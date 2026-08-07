const { pool } = require("../config/db");
const { PARTNER_CODE, getFazatIntegrationConfig } = require("../config/fazatIntegration");
const {
  buildSigningPayload,
  signHmacSha256Hex,
  newEventId,
} = require("../utils/fazatCrypto");
const { writePartnerAudit } = require("./fazatAuditService");

async function enqueueAndDeliver({
  eventType,
  partnerOrder,
  status = null,
  extra = {},
} = {}) {
  const cfg = getFazatIntegrationConfig();
  if (!cfg.enabled) {
    return { skipped: true, reason: "disabled" };
  }

  const eventId = newEventId("fazat");
  const occurredAt = new Date().toISOString();
  const payload = {
    eventId,
    eventType,
    occurredAt,
    partnerCode: PARTNER_CODE,
    externalAssignmentId: partnerOrder?.external_assignment_id || partnerOrder?.externalAssignmentId || null,
    externalOrderId: partnerOrder?.external_order_id || partnerOrder?.externalOrderId || null,
    orderzOrderId:
      partnerOrder?.orderz_order_id != null
        ? String(partnerOrder.orderz_order_id)
        : partnerOrder?.orderzOrderId != null
          ? String(partnerOrder.orderzOrderId)
          : null,
    freelancerId:
      partnerOrder?.freelancer_user_id != null
        ? String(partnerOrder.freelancer_user_id)
        : partnerOrder?.freelancerId != null
          ? String(partnerOrder.freelancerId)
          : null,
    status: status || partnerOrder?.status || null,
    ...extra,
  };

  // Never include secrets / wallet / payment fields.
  delete payload.sharedSecret;
  delete payload.apiKey;
  delete payload.wallet;
  delete payload.payment;
  delete payload.ledger;

  let rowId = null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO partner_webhook_events
         (event_id, partner_code, event_type, partner_order_id, orderz_order_id, payload_json, delivery_status)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,'pending')
       RETURNING id`,
      [
        eventId,
        PARTNER_CODE,
        eventType,
        partnerOrder?.id != null ? Number(partnerOrder.id) : null,
        payload.orderzOrderId != null ? Number(payload.orderzOrderId) : null,
        JSON.stringify(payload),
      ],
    );
    rowId = rows[0]?.id || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fazat-webhook] enqueue failed:", String(err?.message || err).slice(0, 160));
    return { skipped: true, reason: "enqueue_failed" };
  }

  if (!cfg.webhookUrl || !cfg.sharedSecret) {
    await pool.query(
      `UPDATE partner_webhook_events
         SET delivery_status = 'skipped', updated_at = NOW(), last_error = $2
       WHERE id = $1`,
      [rowId, "webhook_url_or_secret_missing"],
    );
    return { skipped: true, reason: "no_webhook_url" };
  }

  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = newEventId("n");
  const pathWithQuery = "/webhooks/orderz";
  const signingPayload = buildSigningPayload({
    timestamp,
    nonce,
    method: "POST",
    pathWithQuery,
    rawBody: body,
  });
  const signature = signHmacSha256Hex(cfg.sharedSecret, signingPayload);

  try {
    const resp = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Orderz-Partner-Code": PARTNER_CODE,
        "X-Orderz-Timestamp": timestamp,
        "X-Orderz-Nonce": nonce,
        "X-Orderz-Signature": signature,
        "X-Orderz-Event-Id": eventId,
        "X-Orderz-Event-Type": eventType,
      },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      await pool.query(
        `UPDATE partner_webhook_events
           SET delivery_status = 'failed',
               attempt_count = attempt_count + 1,
               last_error = $2,
               signature_header = $3,
               updated_at = NOW()
         WHERE id = $1`,
        [rowId, `HTTP ${resp.status} ${String(text).slice(0, 180)}`, signature],
      );
      await writePartnerAudit({
        action: "fazat.webhook.failed",
        entityType: "webhook_event",
        entityId: eventId,
        detail: { eventType, status: resp.status },
      });
      return { sent: false, eventId, status: resp.status };
    }

    await pool.query(
      `UPDATE partner_webhook_events
         SET delivery_status = 'sent',
             attempt_count = attempt_count + 1,
             delivered_at = NOW(),
             signature_header = $2,
             updated_at = NOW()
       WHERE id = $1`,
      [rowId, signature],
    );
    await writePartnerAudit({
      action: "fazat.webhook.sent",
      entityType: "webhook_event",
      entityId: eventId,
      detail: { eventType },
    });
    return { sent: true, eventId };
  } catch (err) {
    await pool.query(
      `UPDATE partner_webhook_events
         SET delivery_status = 'failed',
             attempt_count = attempt_count + 1,
             last_error = $2,
             updated_at = NOW()
       WHERE id = $1`,
      [rowId, String(err?.message || err).slice(0, 200)],
    );
    await writePartnerAudit({
      action: "fazat.webhook.failed",
      entityType: "webhook_event",
      entityId: eventId,
      detail: { eventType, error: String(err?.message || err).slice(0, 120) },
    });
    return { sent: false, eventId, error: true };
  }
}

async function notifyPartnerOrderEvent(eventType, partnerOrder, extra = {}) {
  setImmediate(() => {
    enqueueAndDeliver({ eventType, partnerOrder, status: partnerOrder?.status, extra }).catch(() => {});
  });
}

async function findPartnerOrderByOrderzId(orderzOrderId) {
  const { rows } = await pool.query(
    `SELECT * FROM partner_orders WHERE partner_code = $1 AND orderz_order_id = $2 LIMIT 1`,
    [PARTNER_CODE, Number(orderzOrderId)],
  );
  return rows[0] || null;
}

async function notifyIfPartnerOrderByOrderzId(orderzOrderId, eventType, extra = {}) {
  try {
    const row = await findPartnerOrderByOrderzId(orderzOrderId);
    if (!row) return;
    if (extra.status) {
      await pool.query(
        `UPDATE partner_orders SET status = $2, updated_at = NOW() WHERE id = $1`,
        [row.id, String(extra.status)],
      );
      row.status = String(extra.status);
    }
    await notifyPartnerOrderEvent(eventType, row, extra);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fazat-webhook] notifyIfPartner failed:", String(err?.message || err).slice(0, 160));
  }
}

module.exports = {
  enqueueAndDeliver,
  notifyPartnerOrderEvent,
  findPartnerOrderByOrderzId,
  notifyIfPartnerOrderByOrderzId,
};
