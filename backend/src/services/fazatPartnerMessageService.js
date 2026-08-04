const { pool } = require("../config/db");
const { PARTNER_CODE, getFazatIntegrationConfig } = require("../config/fazatIntegration");
const notificationService = require("./notificationService");
const { writePartnerAudit } = require("./fazatAuditService");
const { notifyPartnerOrderEvent } = require("./fazatWebhookOutboundService");
const fazatPartnerOrderService = require("./fazatPartnerOrderService");

function mapMessage(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    orderzOrderId: String(row.orderz_order_id),
    direction: row.direction,
    senderRole: row.sender_role,
    body: row.body,
    externalMessageId: row.external_message_id || null,
    createdAt: row.created_at,
    // White-label: never expose FAZAT identity on message payloads returned to freelancers.
    displaySenderLabel:
      row.direction === "partner_to_freelancer"
        ? getFazatIntegrationConfig().freelancerClientAliasAr
        : row.sender_role === "freelancer"
          ? "المستقل"
          : "النظام",
  };
}

async function listMessages(orderzOrderId) {
  await fazatPartnerOrderService.getPartnerOrderByOrderzId(orderzOrderId);
  const { rows } = await pool.query(
    `SELECT * FROM partner_order_messages
     WHERE orderz_order_id = $1
     ORDER BY id ASC
     LIMIT 500`,
    [Number(orderzOrderId)],
  );
  return rows.map(mapMessage);
}

async function createPartnerProxyMessage(orderzOrderId, body = {}) {
  const text = String(body.message || body.body || "").trim();
  if (!text) {
    const err = new Error("message is required.");
    err.statusCode = 400;
    throw err;
  }
  const externalMessageId = body.externalMessageId != null ? String(body.externalMessageId).trim() : null;

  const { row: partnerRow, order } = await fazatPartnerOrderService.getPartnerOrderByOrderzId(orderzOrderId);

  if (externalMessageId) {
    const { rows: existing } = await pool.query(
      `SELECT * FROM partner_order_messages
       WHERE partner_order_id = $1 AND external_message_id = $2
       LIMIT 1`,
      [partnerRow.id, externalMessageId],
    );
    if (existing[0]) {
      return { message: mapMessage(existing[0]), idempotentReplay: true };
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO partner_order_messages (
       partner_order_id, orderz_order_id, direction, sender_role, body, external_message_id, metadata_json
     ) VALUES ($1,$2,'partner_to_freelancer','partner_admin',$3,$4,$5::jsonb)
     RETURNING *`,
    [
      partnerRow.id,
      Number(orderzOrderId),
      text.slice(0, 8000),
      externalMessageId,
      JSON.stringify({ source: PARTNER_CODE }),
    ],
  );

  const msg = rows[0];

  if (partnerRow.freelancer_user_id) {
    const alias = getFazatIntegrationConfig().freelancerClientAliasAr;
    await notificationService.createNotification({
      recipientUserId: Number(partnerRow.freelancer_user_id),
      recipientRole: "freelancer",
      actorUserId: null,
      type: "order.message.received",
      title: "رسالة جديدة على الطلب",
      message: text.length > 160 ? `${text.slice(0, 160)}…` : text,
      entityType: "order",
      entityId: Number(orderzOrderId),
      link: `/dashboard/freelancer/my-orders/${encodeURIComponent(String(orderzOrderId))}`,
      priority: "medium",
      metadata: {
        orderId: String(orderzOrderId),
        // White-label: do not mention FAZAT.
        clientAlias: alias,
        source: "managed_order_message",
      },
    }).catch(() => {});
  }

  await writePartnerAudit({
    action: "fazat.partner_message.created",
    entityType: "partner_order_message",
    entityId: String(msg.id),
    detail: { orderzOrderId: String(orderzOrderId) },
  });

  notifyPartnerOrderEvent("orderz.partner_message.created", partnerRow, {
    messageId: String(msg.id),
    direction: "partner_to_freelancer",
  });

  return { message: mapMessage(msg), order, idempotentReplay: false };
}

module.exports = {
  mapMessage,
  listMessages,
  createPartnerProxyMessage,
};
