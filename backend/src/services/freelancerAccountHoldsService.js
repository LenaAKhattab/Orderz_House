/**
 * Reason-based marketplace holds for freelancers (e.g. Stripe renewal payment failure).
 * Does not disable login; eligibility gates marketplace work.
 */

const { pool } = require("../config/db");

const HOLD_REASON = Object.freeze({
  STRIPE_SUBSCRIPTION_PAYMENT_FAILED: "stripe_subscription_payment_failed",
});

const HOLD_SOURCE = Object.freeze({
  STRIPE: "stripe",
  ADMIN: "admin",
  SYSTEM: "system",
});

const CLEAR_SOURCE = Object.freeze({
  STRIPE: "stripe",
  ADMIN: "admin",
  SYSTEM: "system",
});

const MARKETPLACE_BLOCKING_REASONS = new Set([HOLD_REASON.STRIPE_SUBSCRIPTION_PAYMENT_FAILED]);

const RENEWAL_FAILED_COPY = Object.freeze({
  ar: {
    title: "تعذر تجديد الاشتراك",
    message:
      "تعذر سحب رسوم الاشتراك الشهري البالغة 15 د.أ من البطاقة المسجلة، لذلك تم تجميد حسابك مؤقتًا. يرجى التواصل معنا لإعادة تفعيل الحساب.",
  },
  en: {
    title: "Subscription renewal failed",
    message:
      "We could not charge the 15 JOD monthly subscription fee to your saved card. Your account has been temporarily frozen. Please contact us to reactivate it.",
  },
});

function mapHold(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    freelancerUserId: String(row.freelancer_user_id),
    reasonCode: row.reason_code,
    reasonDetail: row.reason_detail || null,
    stripeSubscriptionId: row.stripe_subscription_id || null,
    stripeInvoiceId: row.stripe_invoice_id || null,
    source: row.source,
    createdAt: row.created_at,
    clearedAt: row.cleared_at || null,
    clearedByAdminId: row.cleared_by_admin_id != null ? String(row.cleared_by_admin_id) : null,
    clearReason: row.clear_reason || null,
    clearSource: row.clear_source || null,
  };
}

async function listActiveHolds(freelancerUserId, client) {
  const runner = client || pool;
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) return [];
  const { rows } = await runner.query(
    `SELECT *
     FROM freelancer_account_holds
     WHERE freelancer_user_id = $1
       AND cleared_at IS NULL
     ORDER BY created_at DESC, id DESC`,
    [uid],
  );
  return rows.map(mapHold);
}

async function getActiveMarketplaceBlockingHold(freelancerUserId, client) {
  const holds = await listActiveHolds(freelancerUserId, client);
  return holds.find((h) => MARKETPLACE_BLOCKING_REASONS.has(h.reasonCode)) || null;
}

async function writeAudit(
  { holdId = null, freelancerUserId, action, actorAdminId = null, detail = null },
  client,
) {
  const runner = client || pool;
  await runner.query(
    `INSERT INTO freelancer_account_hold_audit (
      hold_id, freelancer_user_id, action, actor_admin_id, detail
    ) VALUES ($1, $2, $3, $4, $5)`,
    [
      holdId != null ? Number(holdId) : null,
      Number(freelancerUserId),
      String(action),
      actorAdminId != null ? Number(actorAdminId) : null,
      detail != null ? String(detail).slice(0, 2000) : null,
    ],
  );
}

/**
 * Idempotent freeze for a failed Stripe invoice. Duplicate invoice ids do not create second holds.
 */
async function applyStripeSubscriptionPaymentFailedHold(
  {
    freelancerUserId,
    stripeSubscriptionId = null,
    stripeInvoiceId = null,
    failureCode = null,
    failureMessage = null,
  },
  client,
) {
  const runner = client || pool;
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) {
    const err = new Error("Invalid freelancer user id.");
    err.statusCode = 400;
    throw err;
  }

  const invoiceKey =
    stripeInvoiceId != null && String(stripeInvoiceId).trim() !== ""
      ? String(stripeInvoiceId).trim()
      : null;

  if (invoiceKey) {
    const { rows: existing } = await runner.query(
      `SELECT *
       FROM freelancer_account_holds
       WHERE freelancer_user_id = $1
         AND reason_code = $2
         AND stripe_invoice_id = $3
         AND cleared_at IS NULL
       LIMIT 1`,
      [uid, HOLD_REASON.STRIPE_SUBSCRIPTION_PAYMENT_FAILED, invoiceKey],
    );
    if (existing[0]) {
      return { hold: mapHold(existing[0]), created: false };
    }
  }

  const detailParts = [];
  if (failureCode) detailParts.push(`code=${String(failureCode).slice(0, 80)}`);
  if (failureMessage) detailParts.push(String(failureMessage).slice(0, 240));
  const reasonDetail = detailParts.length ? detailParts.join("; ") : null;

  const { rows } = await runner.query(
    `INSERT INTO freelancer_account_holds (
      freelancer_user_id, reason_code, reason_detail,
      stripe_subscription_id, stripe_invoice_id, source
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      uid,
      HOLD_REASON.STRIPE_SUBSCRIPTION_PAYMENT_FAILED,
      reasonDetail,
      stripeSubscriptionId != null ? String(stripeSubscriptionId).trim() : null,
      invoiceKey,
      HOLD_SOURCE.STRIPE,
    ],
  );
  const hold = mapHold(rows[0]);
  await writeAudit(
    {
      holdId: hold.id,
      freelancerUserId: uid,
      action: "create",
      detail: reasonDetail,
    },
    runner,
  );
  return { hold, created: true };
}

async function clearPaymentFailureHoldsForFreelancer(
  {
    freelancerUserId,
    clearSource,
    actorAdminId = null,
    clearReason = null,
    stripeSubscriptionId = null,
  },
  client,
) {
  const runner = client || pool;
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) {
    const err = new Error("Invalid freelancer user id.");
    err.statusCode = 400;
    throw err;
  }

  const values = [uid, HOLD_REASON.STRIPE_SUBSCRIPTION_PAYMENT_FAILED, String(clearSource)];
  let sql = `
    UPDATE freelancer_account_holds
    SET cleared_at = NOW(),
        clear_source = $3,
        cleared_by_admin_id = $4,
        clear_reason = $5
    WHERE freelancer_user_id = $1
      AND reason_code = $2
      AND cleared_at IS NULL`;
  values.push(actorAdminId != null ? Number(actorAdminId) : null);
  values.push(clearReason != null ? String(clearReason).slice(0, 2000) : null);

  if (stripeSubscriptionId) {
    values.push(String(stripeSubscriptionId).trim());
    sql += ` AND (stripe_subscription_id IS NULL OR stripe_subscription_id = $${values.length})`;
  }
  sql += ` RETURNING *`;

  const { rows } = await runner.query(sql, values);
  const action = clearSource === CLEAR_SOURCE.ADMIN ? "reactivate_admin" : "clear_stripe";
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    await writeAudit(
      {
        holdId: row.id,
        freelancerUserId: uid,
        action,
        actorAdminId,
        detail: clearReason,
      },
      runner,
    );
  }
  return rows.map(mapHold);
}

module.exports = {
  HOLD_REASON,
  HOLD_SOURCE,
  CLEAR_SOURCE,
  MARKETPLACE_BLOCKING_REASONS,
  RENEWAL_FAILED_COPY,
  mapHold,
  listActiveHolds,
  getActiveMarketplaceBlockingHold,
  applyStripeSubscriptionPaymentFailedHold,
  clearPaymentFailureHoldsForFreelancer,
  writeAudit,
};
