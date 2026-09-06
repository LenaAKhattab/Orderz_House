/**
 * FAZAT → Orderz settlement review + admin approve/reject/adjust.
 * Inbound creates PENDING_REVIEW only. Wallet credit happens only on admin approval.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { PARTNER_CODE } = require("../config/fazatIntegration");
const { writePartnerAudit } = require("./fazatAuditService");
const {
  creditAvailableBalance,
  EVENT_TYPES,
  PUBLIC_LABELS,
} = require("./freelancerCashWalletService");
const { enqueueAndDeliver } = require("./fazatWebhookOutboundService");

const STATUS = Object.freeze({
  PENDING_REVIEW: "PENDING_REVIEW",
  APPROVED_CREDITED: "APPROVED_CREDITED",
  REJECTED: "REJECTED",
  ADJUSTED_APPROVED: "ADJUSTED_APPROVED",
  CREDIT_FAILED: "CREDIT_FAILED",
  VOIDED: "VOIDED",
});

const STATUS_AR = Object.freeze({
  PENDING_REVIEW: "بانتظار المراجعة",
  APPROVED_CREDITED: "معتمد وتمت إضافة الرصيد",
  REJECTED: "مرفوض",
  ADJUSTED_APPROVED: "معدل ومعتمد",
  CREDIT_FAILED: "فشل إضافة الرصيد",
  VOIDED: "ملغى",
});

function sanitizeSourcePayload(body) {
  const src = body && typeof body === "object" ? body : {};
  const out = {
    fazatSettlementId: src.fazatSettlementId != null ? String(src.fazatSettlementId) : null,
    fazatOrderId: src.fazatOrderId != null ? String(src.fazatOrderId) : null,
    fazatExternalAssignmentId:
      src.fazatExternalAssignmentId != null ? String(src.fazatExternalAssignmentId) : null,
    orderzPartnerOrderId:
      src.orderzPartnerOrderId != null ? String(src.orderzPartnerOrderId) : null,
    orderzOrderId: src.orderzOrderId != null ? String(src.orderzOrderId) : null,
    freelancerId: src.freelancerId != null ? String(src.freelancerId) : null,
    amountMinor: src.amountMinor != null ? Number(src.amountMinor) : null,
    currency: src.currency != null ? String(src.currency) : null,
    sourceLabel: src.sourceLabel != null ? String(src.sourceLabel).slice(0, 200) : null,
    completedAt: src.completedAt || src.approvedAt || null,
  };
  // Explicitly drop PII / payment fields if somehow sent.
  delete src.clientName;
  delete src.clientEmail;
  delete src.stripe;
  delete src.payment;
  delete src.wallet;
  return out;
}

function mapSettlement(row, { admin = false } = {}) {
  if (!row) return null;
  const base = {
    id: String(row.id),
    partnerCode: row.partner_code,
    fazatSettlementId: row.fazat_settlement_id,
    fazatOrderId: row.fazat_order_id,
    fazatExternalAssignmentId: row.fazat_external_assignment_id,
    orderzPartnerOrderId:
      row.orderz_partner_order_id != null ? String(row.orderz_partner_order_id) : null,
    orderzOrderId: row.orderz_order_id != null ? String(row.orderz_order_id) : null,
    freelancerId: String(row.freelancer_user_id),
    freelancerName: row.freelancer_name || null,
    freelancerEmail: admin ? row.freelancer_email || null : null,
    amountMinor: Number(row.amount_minor),
    adjustedAmountMinor:
      row.adjusted_amount_minor != null ? Number(row.adjusted_amount_minor) : null,
    finalAmountMinor: row.final_amount_minor != null ? Number(row.final_amount_minor) : null,
    currency: row.currency || "JOD",
    status: row.status,
    statusLabelAr: STATUS_AR[row.status] || row.status,
    sourceLabel: row.source_label || null,
    adminNote: row.admin_note || null,
    adjustmentReason: row.adjustment_reason || null,
    rejectionReason: row.rejection_reason || null,
    approvedByAdminId: row.approved_by_admin_id != null ? String(row.approved_by_admin_id) : null,
    rejectedByAdminId: row.rejected_by_admin_id != null ? String(row.rejected_by_admin_id) : null,
    adjustedByAdminId: row.adjusted_by_admin_id != null ? String(row.adjusted_by_admin_id) : null,
    walletLedgerEntryId:
      row.wallet_ledger_entry_id != null ? String(row.wallet_ledger_entry_id) : null,
    idempotencyKey: row.idempotency_key || null,
    creditedAt: row.credited_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (admin) {
    base.sourcePayload = row.source_payload_json || {};
  }
  return base;
}

async function writeSettlementEvent(client, settlementId, eventType, actorUserId, detail) {
  await client.query(
    `INSERT INTO fazat_settlement_events (settlement_id, event_type, actor_user_id, detail_json)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [
      settlementId,
      eventType,
      actorUserId != null ? Number(actorUserId) : null,
      JSON.stringify(detail && typeof detail === "object" ? detail : {}),
    ],
  );
}

async function findExistingSettlement({ fazatSettlementId, idempotencyKey, client = pool }) {
  if (idempotencyKey) {
    const { rows } = await client.query(
      `SELECT * FROM fazat_settlements
        WHERE partner_code = $1 AND idempotency_key = $2
        LIMIT 1`,
      [PARTNER_CODE, String(idempotencyKey)],
    );
    if (rows[0]) return rows[0];
  }
  const { rows } = await client.query(
    `SELECT * FROM fazat_settlements
      WHERE partner_code = $1 AND fazat_settlement_id = $2
      LIMIT 1`,
    [PARTNER_CODE, String(fazatSettlementId)],
  );
  return rows[0] || null;
}

async function resolvePartnerOrderLinks({ orderzPartnerOrderId, orderzOrderId, fazatExternalAssignmentId }) {
  let partnerOrderId = orderzPartnerOrderId ? Number(orderzPartnerOrderId) : null;
  let orderId = orderzOrderId ? Number(orderzOrderId) : null;

  if (fazatExternalAssignmentId) {
    const { rows } = await pool.query(
      `SELECT id, orderz_order_id FROM partner_orders
        WHERE partner_code = $1 AND external_assignment_id = $2
        LIMIT 1`,
      [PARTNER_CODE, String(fazatExternalAssignmentId)],
    );
    if (rows[0]) {
      partnerOrderId = partnerOrderId || Number(rows[0].id);
      orderId = orderId || Number(rows[0].orderz_order_id);
    }
  }
  if (partnerOrderId && !orderId) {
    const { rows } = await pool.query(
      `SELECT orderz_order_id FROM partner_orders WHERE id = $1 LIMIT 1`,
      [partnerOrderId],
    );
    if (rows[0]) orderId = Number(rows[0].orderz_order_id);
  }
  return {
    orderzPartnerOrderId: Number.isInteger(partnerOrderId) ? partnerOrderId : null,
    orderzOrderId: Number.isInteger(orderId) ? orderId : null,
  };
}

/**
 * Inbound signed API: create PENDING_REVIEW settlement (no wallet credit).
 */
async function receiveSettlement(body, { idempotencyKey = null } = {}) {
  const sanitized = sanitizeSourcePayload(body);
  const fazatSettlementId = String(sanitized.fazatSettlementId || "").trim();
  const fazatOrderId = String(sanitized.fazatOrderId || "").trim();
  const freelancerId = Number(sanitized.freelancerId);
  const amountMinor = Number(sanitized.amountMinor);
  const currency = String(sanitized.currency || "JOD").trim().toUpperCase() || "JOD";

  if (!fazatSettlementId) {
    throw createAppError("fazatSettlementId مطلوب.", 400, {
      exposeToClient: true,
      publicCode: "FAZAT_SETTLEMENT_ID_REQUIRED",
    });
  }
  if (!fazatOrderId) {
    throw createAppError("fazatOrderId مطلوب.", 400, {
      exposeToClient: true,
      publicCode: "FAZAT_ORDER_ID_REQUIRED",
    });
  }
  if (!Number.isInteger(freelancerId) || freelancerId <= 0) {
    throw createAppError("freelancerId غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_FREELANCER_ID",
    });
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw createAppError("لا يمكن اعتماد مبلغ صفر أو أقل.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_AMOUNT_MINOR",
    });
  }

  const existing = await findExistingSettlement({
    fazatSettlementId,
    idempotencyKey: idempotencyKey || null,
  });
  if (existing) {
    return { settlement: mapSettlement(existing, { admin: true }), idempotentReplay: true };
  }

  const { rows: userRows } = await pool.query(
    `SELECT id, role, is_active FROM users WHERE id = $1 LIMIT 1`,
    [freelancerId],
  );
  const user = userRows[0];
  if (!user) {
    throw createAppError("الفريلانسر غير موجود في Orderz.", 404, {
      exposeToClient: true,
      publicCode: "FREELANCER_NOT_FOUND",
    });
  }
  if (String(user.role) !== "freelancer") {
    throw createAppError("المستخدم المحدد ليس فريلانسر.", 400, {
      exposeToClient: true,
      publicCode: "NOT_A_FREELANCER",
    });
  }

  const links = await resolvePartnerOrderLinks({
    orderzPartnerOrderId: sanitized.orderzPartnerOrderId,
    orderzOrderId: sanitized.orderzOrderId,
    fazatExternalAssignmentId: sanitized.fazatExternalAssignmentId,
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO fazat_settlements (
         partner_code, fazat_settlement_id, fazat_order_id, fazat_external_assignment_id,
         orderz_partner_order_id, orderz_order_id, freelancer_user_id,
         amount_minor, currency, status, source_payload_json, source_label,
         idempotency_key, completed_at_source
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING_REVIEW',$10::jsonb,$11,$12,$13
       )
       RETURNING *`,
      [
        PARTNER_CODE,
        fazatSettlementId,
        fazatOrderId,
        sanitized.fazatExternalAssignmentId || null,
        links.orderzPartnerOrderId,
        links.orderzOrderId,
        freelancerId,
        amountMinor,
        currency,
        JSON.stringify(sanitized),
        sanitized.sourceLabel || null,
        idempotencyKey ? String(idempotencyKey).slice(0, 180) : null,
        sanitized.completedAt ? new Date(sanitized.completedAt) : null,
      ],
    );
    const row = rows[0];
    await writeSettlementEvent(client, row.id, "fazat_settlement.received", null, {
      amountMinor,
      currency,
      fazatSettlementId,
    });
    await client.query("COMMIT");

    await writePartnerAudit({
      action: "fazat_settlement.received",
      actorType: "partner",
      entityType: "fazat_settlement",
      entityId: String(row.id),
      detail: {
        fazatSettlementId,
        freelancerId,
        amountMinor,
        currency,
      },
    });

    return { settlement: mapSettlement(row, { admin: true }), idempotentReplay: false };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (err && err.code === "23505") {
      const replay = await findExistingSettlement({
        fazatSettlementId,
        idempotencyKey: idempotencyKey || null,
      });
      if (replay) {
        return { settlement: mapSettlement(replay, { admin: true }), idempotentReplay: true };
      }
    }
    throw err;
  } finally {
    client.release();
  }
}

async function listSettlements({ status = null, limit = 100, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  const params = [PARTNER_CODE];
  let where = `s.partner_code = $1`;
  if (status) {
    params.push(String(status));
    where += ` AND s.status = $${params.length}`;
  }
  params.push(lim, off);
  const { rows } = await pool.query(
    `SELECT s.*,
            TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)) AS freelancer_name,
            u.email AS freelancer_email
       FROM fazat_settlements s
       JOIN users u ON u.id = s.freelancer_user_id
      WHERE ${where}
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map((r) => mapSettlement(r, { admin: true }));
}

async function getSettlementById(id) {
  const { rows } = await pool.query(
    `SELECT s.*,
            TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)) AS freelancer_name,
            u.email AS freelancer_email
       FROM fazat_settlements s
       JOIN users u ON u.id = s.freelancer_user_id
      WHERE s.id = $1
      LIMIT 1`,
    [Number(id)],
  );
  if (!rows[0]) {
    throw createAppError("التسوية غير موجودة.", 404, {
      exposeToClient: true,
      publicCode: "SETTLEMENT_NOT_FOUND",
    });
  }
  return mapSettlement(rows[0], { admin: true });
}

async function notifySettlementWebhook(settlementRow, eventType, extra = {}) {
  try {
    const partnerOrder = settlementRow.orderz_partner_order_id
      ? (
          await pool.query(`SELECT * FROM partner_orders WHERE id = $1 LIMIT 1`, [
            settlementRow.orderz_partner_order_id,
          ])
        ).rows[0]
      : {
          id: null,
          external_assignment_id: settlementRow.fazat_external_assignment_id,
          external_order_id: settlementRow.fazat_order_id,
          orderz_order_id: settlementRow.orderz_order_id,
          freelancer_user_id: settlementRow.freelancer_user_id,
          status: settlementRow.status,
        };

    const result = await enqueueAndDeliver({
      eventType,
      partnerOrder,
      status: settlementRow.status,
      extra: {
        fazatSettlementId: settlementRow.fazat_settlement_id,
        orderzSettlementId: String(settlementRow.id),
        amountMinor: Number(settlementRow.amount_minor),
        finalAmountMinor:
          settlementRow.final_amount_minor != null
            ? Number(settlementRow.final_amount_minor)
            : settlementRow.adjusted_amount_minor != null
              ? Number(settlementRow.adjusted_amount_minor)
              : Number(settlementRow.amount_minor),
        currency: settlementRow.currency,
        reason: settlementRow.rejection_reason || settlementRow.adjustment_reason || null,
        creditedAt: settlementRow.credited_at || null,
        ...extra,
      },
    });

    await writePartnerAudit({
      action: result?.skipped
        ? "fazat_settlement.webhook_failed"
        : result?.sent
          ? "fazat_settlement.webhook_sent"
          : "fazat_settlement.webhook_failed",
      actorType: "system",
      entityType: "fazat_settlement",
      entityId: String(settlementRow.id),
      detail: {
        eventType,
        skipped: Boolean(result?.skipped),
        reason: result?.reason || null,
        sent: Boolean(result?.sent),
      },
    });
  } catch (err) {
    // Wallet credit must not fail because webhook failed.
    // eslint-disable-next-line no-console
    console.error(
      "[fazat-settlement-webhook]",
      String(err?.message || err).slice(0, 160),
    );
    await writePartnerAudit({
      action: "fazat_settlement.webhook_failed",
      actorType: "system",
      entityType: "fazat_settlement",
      entityId: String(settlementRow.id),
      detail: { eventType, error: String(err?.message || err).slice(0, 120) },
    });
  }
}

/**
 * Adjust amount on PENDING_REVIEW (Super Admin). Does not credit yet.
 */
async function adjustSettlement({ settlementId, adjustedAmountMinor, reason, adminUserId }) {
  const amount = Number(adjustedAmountMinor);
  const why = String(reason || "").trim();
  if (!Number.isInteger(amount) || amount <= 0) {
    throw createAppError("لا يمكن اعتماد مبلغ صفر أو أقل.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_ADJUSTED_AMOUNT",
    });
  }
  if (!why || why.length < 3) {
    throw createAppError("يجب إدخال سبب التعديل.", 400, {
      exposeToClient: true,
      publicCode: "ADJUSTMENT_REASON_REQUIRED",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM fazat_settlements WHERE id = $1 FOR UPDATE`,
      [Number(settlementId)],
    );
    const row = rows[0];
    if (!row) {
      throw createAppError("التسوية غير موجودة.", 404, {
        exposeToClient: true,
        publicCode: "SETTLEMENT_NOT_FOUND",
      });
    }
    if (row.status !== STATUS.PENDING_REVIEW && row.status !== STATUS.CREDIT_FAILED) {
      throw createAppError("لا يمكن تعديل تسوية تم اعتمادها مسبقًا.", 409, {
        exposeToClient: true,
        publicCode: "SETTLEMENT_NOT_ADJUSTABLE",
      });
    }

    const { rows: updated } = await client.query(
      `UPDATE fazat_settlements
          SET adjusted_amount_minor = $2,
              adjustment_reason = $3,
              adjusted_by_admin_id = $4,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [row.id, amount, why.slice(0, 1000), Number(adminUserId)],
    );
    await writeSettlementEvent(client, row.id, "fazat_settlement.adjusted", adminUserId, {
      previousAmountMinor: Number(row.amount_minor),
      previousAdjusted: row.adjusted_amount_minor,
      adjustedAmountMinor: amount,
      reason: why.slice(0, 200),
    });
    await client.query("COMMIT");

    await writePartnerAudit({
      action: "fazat_settlement.adjusted",
      actorType: "admin",
      entityType: "fazat_settlement",
      entityId: String(row.id),
      detail: {
        adminId: adminUserId,
        freelancerId: row.freelancer_user_id,
        amountMinor: Number(row.amount_minor),
        adjustedAmountMinor: amount,
        reason: why.slice(0, 200),
      },
    });

    return mapSettlement(updated[0], { admin: true });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Approve + credit wallet. Idempotent if already credited.
 */
async function approveSettlement({ settlementId, adminUserId, adminNote = null }) {
  const client = await pool.connect();
  let settlementRow = null;
  let creditResult = null;
  let finalStatus = STATUS.APPROVED_CREDITED;
  let finalAmount = 0;

  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM fazat_settlements WHERE id = $1 FOR UPDATE`,
      [Number(settlementId)],
    );
    const row = rows[0];
    if (!row) {
      throw createAppError("التسوية غير موجودة.", 404, {
        exposeToClient: true,
        publicCode: "SETTLEMENT_NOT_FOUND",
      });
    }
    settlementRow = row;

    if (
      row.status === STATUS.APPROVED_CREDITED ||
      row.status === STATUS.ADJUSTED_APPROVED
    ) {
      await client.query("COMMIT");
      return {
        settlement: mapSettlement(row, { admin: true }),
        idempotent: true,
      };
    }

    if (row.status === STATUS.REJECTED || row.status === STATUS.VOIDED) {
      throw createAppError("لا يمكن اعتماد تسوية مرفوضة أو ملغاة.", 409, {
        exposeToClient: true,
        publicCode: "SETTLEMENT_NOT_APPROVABLE",
      });
    }

    if (row.status !== STATUS.PENDING_REVIEW && row.status !== STATUS.CREDIT_FAILED) {
      throw createAppError("حالة التسوية لا تسمح بالاعتماد.", 409, {
        exposeToClient: true,
        publicCode: "SETTLEMENT_NOT_APPROVABLE",
      });
    }

    finalAmount =
      row.adjusted_amount_minor != null
        ? Number(row.adjusted_amount_minor)
        : Number(row.amount_minor);
    if (!Number.isInteger(finalAmount) || finalAmount <= 0) {
      throw createAppError("لا يمكن اعتماد مبلغ صفر أو أقل.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_AMOUNT_MINOR",
      });
    }

    const wasAdjusted = row.adjusted_amount_minor != null;
    finalStatus = wasAdjusted ? STATUS.ADJUSTED_APPROVED : STATUS.APPROVED_CREDITED;

    const creditIdempotency = `fazat-settlement-credit:${row.id}`;
    try {
      creditResult = await creditAvailableBalance({
        client,
        freelancerUserId: row.freelancer_user_id,
        amountMinor: finalAmount,
        currency: row.currency || "JOD",
        eventType: EVENT_TYPES.MANAGED_ORDER_CREDIT,
        descriptionPublic: PUBLIC_LABELS.MANAGED_ORDER_CREDIT,
        descriptionInternal: `settlement:${row.id} fazat:${row.fazat_settlement_id}`,
        referenceType: "fazat_settlement",
        referenceId: String(row.id),
        idempotencyKey: creditIdempotency,
        actorUserId: adminUserId,
        metadata: {
          partnerCode: PARTNER_CODE,
          fazatSettlementId: row.fazat_settlement_id,
        },
      });
    } catch (creditErr) {
      await client.query(
        `UPDATE fazat_settlements
            SET status = 'CREDIT_FAILED',
                admin_note = COALESCE($2, admin_note),
                updated_at = NOW()
          WHERE id = $1`,
        [row.id, adminNote ? String(adminNote).slice(0, 1000) : null],
      );
      await writeSettlementEvent(client, row.id, "fazat_settlement.credit_failed", adminUserId, {
        error: String(creditErr?.message || creditErr).slice(0, 200),
        finalAmountMinor: finalAmount,
      });
      await client.query("COMMIT");
      await writePartnerAudit({
        action: "fazat_settlement.credit_failed",
        actorType: "admin",
        entityType: "fazat_settlement",
        entityId: String(row.id),
        detail: {
          adminId: adminUserId,
          freelancerId: row.freelancer_user_id,
          finalAmountMinor: finalAmount,
        },
      });
      settlementRow = (await pool.query(`SELECT * FROM fazat_settlements WHERE id = $1`, [row.id]))
        .rows[0];
      setImmediate(() => {
        notifySettlementWebhook(settlementRow, "settlement.credit_failed").catch(() => {});
      });
      throw createAppError("فشل إضافة الرصيد إلى محفظة الفريلانسر.", 500, {
        exposeToClient: true,
        publicCode: "SETTLEMENT_CREDIT_FAILED",
      });
    }

    const ledgerId = creditResult?.entry?.id ? Number(creditResult.entry.id) : null;
    const { rows: updated } = await client.query(
      `UPDATE fazat_settlements
          SET status = $2,
              final_amount_minor = $3,
              wallet_ledger_entry_id = $4,
              approved_by_admin_id = $5,
              admin_note = COALESCE($6, admin_note),
              credited_at = NOW(),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [
        row.id,
        finalStatus,
        finalAmount,
        ledgerId,
        Number(adminUserId),
        adminNote ? String(adminNote).slice(0, 1000) : null,
      ],
    );
    settlementRow = updated[0];

    if (settlementRow.orderz_partner_order_id) {
      await client.query(
        `UPDATE partner_orders
            SET settlement_status = 'credited_on_orderz_wallet',
                updated_at = NOW()
          WHERE id = $1`,
        [settlementRow.orderz_partner_order_id],
      );
    }

    const auditAction =
      finalStatus === STATUS.ADJUSTED_APPROVED
        ? "fazat_settlement.adjusted_approved"
        : "fazat_settlement.approved";
    await writeSettlementEvent(client, row.id, auditAction, adminUserId, {
      finalAmountMinor: finalAmount,
      ledgerEntryId: ledgerId,
      idempotentCredit: Boolean(creditResult?.idempotent),
    });
    await client.query("COMMIT");

    await writePartnerAudit({
      action: auditAction,
      actorType: "admin",
      entityType: "fazat_settlement",
      entityId: String(row.id),
      detail: {
        adminId: adminUserId,
        freelancerId: row.freelancer_user_id,
        amountMinor: Number(row.amount_minor),
        finalAmountMinor: finalAmount,
        ledgerEntryId: ledgerId,
      },
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }

  const webhookType =
    finalStatus === STATUS.ADJUSTED_APPROVED
      ? "settlement.adjusted_approved"
      : "settlement.approved";
  setImmediate(() => {
    notifySettlementWebhook(settlementRow, webhookType).catch(() => {});
  });

  return {
    settlement: mapSettlement(settlementRow, { admin: true }),
    idempotent: Boolean(creditResult?.idempotent),
  };
}

async function rejectSettlement({ settlementId, adminUserId, reason }) {
  const why = String(reason || "").trim();
  if (!why || why.length < 3) {
    throw createAppError("يجب إدخال سبب الرفض.", 400, {
      exposeToClient: true,
      publicCode: "REJECTION_REASON_REQUIRED",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM fazat_settlements WHERE id = $1 FOR UPDATE`,
      [Number(settlementId)],
    );
    const row = rows[0];
    if (!row) {
      throw createAppError("التسوية غير موجودة.", 404, {
        exposeToClient: true,
        publicCode: "SETTLEMENT_NOT_FOUND",
      });
    }
    if (
      row.status === STATUS.APPROVED_CREDITED ||
      row.status === STATUS.ADJUSTED_APPROVED
    ) {
      throw createAppError(
        "لا يمكن رفض تسوية تم اعتمادها مسبقًا. استخدم إجراء تصحيح مالي.",
        409,
        {
          exposeToClient: true,
          publicCode: "SETTLEMENT_ALREADY_CREDITED",
        },
      );
    }
    if (row.status === STATUS.REJECTED) {
      await client.query("COMMIT");
      return { settlement: mapSettlement(row, { admin: true }), idempotent: true };
    }
    if (row.status !== STATUS.PENDING_REVIEW && row.status !== STATUS.CREDIT_FAILED) {
      throw createAppError("حالة التسوية لا تسمح بالرفض.", 409, {
        exposeToClient: true,
        publicCode: "SETTLEMENT_NOT_REJECTABLE",
      });
    }

    const { rows: updated } = await client.query(
      `UPDATE fazat_settlements
          SET status = 'REJECTED',
              rejection_reason = $2,
              rejected_by_admin_id = $3,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [row.id, why.slice(0, 1000), Number(adminUserId)],
    );
    await writeSettlementEvent(client, row.id, "fazat_settlement.rejected", adminUserId, {
      reason: why.slice(0, 200),
    });
    await client.query("COMMIT");

    await writePartnerAudit({
      action: "fazat_settlement.rejected",
      actorType: "admin",
      entityType: "fazat_settlement",
      entityId: String(row.id),
      detail: {
        adminId: adminUserId,
        freelancerId: row.freelancer_user_id,
        amountMinor: Number(row.amount_minor),
        reason: why.slice(0, 200),
      },
    });

    setImmediate(() => {
      notifySettlementWebhook(updated[0], "settlement.rejected").catch(() => {});
    });

    return { settlement: mapSettlement(updated[0], { admin: true }), idempotent: false };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  STATUS,
  STATUS_AR,
  receiveSettlement,
  listSettlements,
  getSettlementById,
  adjustSettlement,
  approveSettlement,
  rejectSettlement,
  mapSettlement,
};
