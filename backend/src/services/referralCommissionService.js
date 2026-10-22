const { pool } = require("../config/db");
const { calculateCommissionMinor, refundAdjustment, PAYMENT_TYPES } = require("../domain/referralPolicy");
const notificationService = require("./notificationService");

const SUPPORTED_TYPES = new Set(Object.values(PAYMENT_TYPES));

async function notifyReferrer(input) {
  try {
    await notificationService.createNotification({
      recipientUserId: Number(input.userId),
      recipientRole: null,
      actorUserId: null,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: "referral",
      entityId: input.entityId || null,
      link: "/dashboard/referrals",
      priority: "medium",
      metadata: input.metadata || {},
      dedupeKey: input.dedupeKey,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ component: "referral", event: "notify_failed", message: error?.message }));
  }
}

async function insertLedger(client, row) {
  await client.query(
    `INSERT INTO referral_wallet_ledger (
       user_id, event_type, bucket, amount_minor, commission_id, withdrawal_id, bonus_award_id, idempotency_key, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      row.userId,
      row.eventType,
      row.bucket,
      row.amountMinor,
      row.commissionId || null,
      row.withdrawalId || null,
      row.bonusAwardId || null,
      row.idempotencyKey,
      JSON.stringify(row.metadata || {}),
    ],
  );
}

async function evaluateBonuses(client, referrerUserId) {
  const count = await client.query(
    `SELECT COUNT(DISTINCT referred_user_id)::int AS n
       FROM referral_commissions
      WHERE referrer_user_id = $1
        AND status IN ('available', 'paid')`,
    [referrerUserId],
  );
  const paid = Number(count.rows[0]?.n || 0);
  const rules = await client.query(
    `SELECT * FROM referral_bonus_rules
      WHERE enabled = TRUE AND threshold_paid_referrals <= $1 AND effective_from <= NOW()`,
    [paid],
  );
  for (const rule of rules.rows) {
    const awarded = await client.query(
      `INSERT INTO referral_bonus_awards (rule_id, referrer_user_id, amount_minor)
       VALUES ($1,$2,$3)
       ON CONFLICT (rule_id, referrer_user_id) DO NOTHING
       RETURNING id`,
      [rule.id, referrerUserId, rule.bonus_amount_minor],
    );
    if (!awarded.rows[0]) continue;
    await insertLedger(client, {
      userId: referrerUserId,
      eventType: "bonus_awarded",
      bucket: "available",
      amountMinor: Number(rule.bonus_amount_minor),
      bonusAwardId: awarded.rows[0].id,
      idempotencyKey: `bonus:${rule.id}:${referrerUserId}`,
    });
    await notifyReferrer({
      userId: referrerUserId,
      type: "referral.bonus",
      title: "مكافأة إحالة",
      message: "تم إضافة مكافأة إحالة إلى رصيدك المتاح.",
      entityId: Number(awarded.rows[0].id),
      dedupeKey: `referral_bonus_${rule.id}_${referrerUserId}`,
      metadata: { titleEn: "Referral bonus", messageEn: "A referral bonus was added to your available balance." },
    });
  }
}

async function promoteMaturedCommissions(client, referrerUserId = null, { limit = 500 } = {}) {
  const params = [Math.max(1, Math.min(Number(limit) || 500, 5000))];
  let where = `status = 'pending' AND hold_until <= NOW()`;
  if (referrerUserId) {
    params.push(referrerUserId);
    where += ` AND referrer_user_id = $2`;
  }
  const { rows } = await client.query(
    `WITH due AS (
       SELECT id FROM referral_commissions
        WHERE ${where}
        ORDER BY hold_until
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE referral_commissions c
        SET status = 'available', available_at = NOW()
       FROM due
      WHERE c.id = due.id
      RETURNING c.*`,
    params,
  );
  const referrers = new Set();
  for (const row of rows) {
    const amount = Number(row.commission_minor) - Number(row.reversed_minor || 0);
    referrers.add(Number(row.referrer_user_id));
    if (amount <= 0) continue;
    await insertLedger(client, {
      userId: row.referrer_user_id,
      eventType: "commission_available",
      bucket: "pending",
      amountMinor: -amount,
      commissionId: row.id,
      idempotencyKey: `available-pending:${row.id}`,
    });
    await insertLedger(client, {
      userId: row.referrer_user_id,
      eventType: "commission_available",
      bucket: "available",
      amountMinor: amount,
      commissionId: row.id,
      idempotencyKey: `available-credit:${row.id}`,
    });
    await notifyReferrer({
      userId: row.referrer_user_id,
      type: "referral.commission_available",
      title: "عمولة إحالة متاحة",
      message: "أصبحت عمولة إحالة متاحة للسحب.",
      entityId: Number(row.id),
      dedupeKey: `referral_available_${row.id}`,
      metadata: { titleEn: "Referral commission available", messageEn: "A referral commission is now available to withdraw." },
    });
  }
  for (const id of referrers) await evaluateBonuses(client, id);
  return rows.length;
}

/**
 * Scheduled hold processor: matures due commissions and evaluates bonuses.
 * One pooled client, bounded batch, single runner via advisory lock, always released.
 */
async function runReferralHoldProcessor({ limit = 200 } = {}) {
  const db = await pool.connect();
  let locked = false;
  try {
    const lock = await db.query(`SELECT pg_try_advisory_lock(hashtext('referral_hold_processor')) AS ok`);
    locked = Boolean(lock.rows[0]?.ok);
    if (!locked) return { skipped: true, promoted: 0 };
    await db.query("BEGIN");
    const promoted = await promoteMaturedCommissions(db, null, { limit });
    // Referrers who already qualify for an enabled, effective rule they have not received
    // (e.g. a rule created after their referrals matured).
    const referrers = await db.query(
      `SELECT c.referrer_user_id
         FROM referral_commissions c
        WHERE c.status IN ('available', 'paid')
        GROUP BY c.referrer_user_id
       HAVING EXISTS (
         SELECT 1 FROM referral_bonus_rules r
          WHERE r.enabled AND r.effective_from <= NOW()
            AND r.threshold_paid_referrals <= COUNT(DISTINCT c.referred_user_id)
            AND NOT EXISTS (
              SELECT 1 FROM referral_bonus_awards a
               WHERE a.rule_id = r.id AND a.referrer_user_id = c.referrer_user_id
            )
       )
        LIMIT $1`,
      [limit],
    );
    for (const row of referrers.rows) await evaluateBonuses(db, row.referrer_user_id);
    await db.query("COMMIT");
    return { skipped: false, promoted };
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    if (locked) {
      try {
        await db.query(`SELECT pg_advisory_unlock(hashtext('referral_hold_processor'))`);
      } catch {
        /* ignore */
      }
    }
    db.release();
  }
}

async function processReferralCommissionForPayment(input, client = pool) {
  const paymentType = String(input.paymentType || "");
  if (!SUPPORTED_TYPES.has(paymentType)) return { created: false, reason: "unsupported_payment_type" };
  const payerUserId = Number(input.payerUserId);
  const baseMinor = Math.trunc(Number(input.paidAmountMinor));
  const sourceId = String(input.paymentSourceId || "");
  const discountMinor = Math.max(Math.trunc(Number(input.discountMinor)) || 0, 0);
  const listAmountMinor = Math.trunc(Number(input.listAmountMinor)) || baseMinor + discountMinor;
  if (!payerUserId || !sourceId || !Number.isInteger(baseMinor) || baseMinor <= 0) {
    return { created: false, reason: "invalid_payment" };
  }
  const ownClient = client === pool;
  const db = ownClient ? await pool.connect() : client;
  try {
    if (ownClient) await db.query("BEGIN");
    const relation = await db.query(
      `SELECT r.*, p.calculation_mode, p.percentage_bps, p.fixed_amount_minor, p.eligible_payment_types,
              p.commission_hold_days, p.currency AS policy_currency
         FROM user_referrals r
         JOIN referral_commission_policy_versions p ON p.id = r.policy_version_id
        WHERE r.referred_user_id = $1
        LIMIT 1`,
      [payerUserId],
    );
    const row = relation.rows[0];
    if (!row) {
      if (ownClient) await db.query("COMMIT");
      return { created: false, reason: "no_referral" };
    }
    if (discountMinor > 0) {
      await db.query(
        `INSERT INTO referral_discount_redemptions (
           user_referral_id, referred_user_id, policy_version_id, payment_source_type, payment_source_id,
           list_amount_minor, discount_minor
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (payment_source_type, payment_source_id) DO NOTHING`,
        [row.id, payerUserId, row.policy_version_id, paymentType, sourceId, listAmountMinor, discountMinor],
      );
    }
    const eligible = row.eligible_payment_types || [];
    if (!eligible.includes(paymentType)) {
      if (ownClient) await db.query("COMMIT");
      return { created: false, reason: "payment_type_not_eligible" };
    }
    const commissionMinor = calculateCommissionMinor({
      mode: row.calculation_mode,
      percentageBps: row.percentage_bps,
      fixedMinor: row.fixed_amount_minor,
      baseMinor,
    });
    if (commissionMinor <= 0) {
      if (ownClient) await db.query("COMMIT");
      return { created: false, reason: "zero_commission" };
    }
    const holdDays = Number(row.commission_hold_days) || 0;
    const inserted = await db.query(
      `INSERT INTO referral_commissions (
         user_referral_id, referrer_user_id, referred_user_id, policy_version_id,
         payment_source_type, payment_source_id, stripe_payment_intent_id,
         payment_base_minor, currency, calculation_mode, percentage_bps, fixed_amount_minor,
         commission_minor, status, hold_until, list_amount_minor, discount_minor
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending', NOW() + ($14::int * INTERVAL '1 day'), $15, $16)
       ON CONFLICT (payment_source_type, payment_source_id) DO NOTHING
       RETURNING id`,
      [
        row.id,
        row.referrer_user_id,
        payerUserId,
        row.policy_version_id,
        paymentType,
        sourceId,
        input.stripePaymentIntentId || null,
        baseMinor,
        String(input.currency || "jod").toUpperCase(),
        row.calculation_mode,
        row.percentage_bps,
        row.fixed_amount_minor,
        commissionMinor,
        holdDays,
        listAmountMinor,
        discountMinor,
      ],
    );
    if (!inserted.rows[0]) {
      if (ownClient) await db.query("COMMIT");
      return { created: false, reason: "duplicate_payment" };
    }
    const commissionId = inserted.rows[0].id;
    await insertLedger(db, {
      userId: row.referrer_user_id,
      eventType: "commission_pending",
      bucket: "pending",
      amountMinor: commissionMinor,
      commissionId,
      idempotencyKey: `pending:${commissionId}`,
    });
    await notifyReferrer({
      userId: row.referrer_user_id,
      type: "referral.commission_pending",
      title: "عمولة إحالة معلّقة",
      message: "تم تسجيل عمولة إحالة وهي قيد فترة الأمان.",
      entityId: Number(commissionId),
      dedupeKey: `referral_pending_${commissionId}`,
      metadata: { titleEn: "Referral commission pending", messageEn: "A referral commission was recorded and is in the hold period." },
    });
    if (holdDays === 0) await promoteMaturedCommissions(db, row.referrer_user_id);
    if (ownClient) await db.query("COMMIT");
    return { created: true, commissionId: Number(commissionId), commissionMinor, policyVersionId: Number(row.policy_version_id) };
  } catch (error) {
    if (ownClient) await db.query("ROLLBACK");
    throw error;
  } finally {
    if (ownClient) db.release();
  }
}

/**
 * Refund / lost dispute. The commission target is recomputed from the remaining captured base
 * (snapshotted terms) and only the delta is posted. Rows are never deleted.
 * `refundedAmountMinor` is cumulative (Stripe charge.amount_refunded); null means full reversal.
 */
async function reverseReferralCommission({ paymentSourceType, paymentSourceId, stripePaymentIntentId, refundedAmountMinor = null, reason = "refund" }) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query(
      `SELECT * FROM referral_commissions
        WHERE ($1::text IS NOT NULL AND payment_source_type = $1 AND payment_source_id = $2)
           OR ($3::text IS NOT NULL AND stripe_payment_intent_id = $3)
        FOR UPDATE`,
      [paymentSourceType || null, paymentSourceId || null, stripePaymentIntentId || null],
    );
    const results = [];
    for (const row of rows) {
      if (row.status === "reversed" || row.status === "cancelled") continue;
      const refunded = refundedAmountMinor == null
        ? Number(row.payment_base_minor)
        : Math.min(Math.trunc(Number(refundedAmountMinor)) || 0, Number(row.payment_base_minor));
      if (refunded <= Number(row.refunded_base_minor || 0)) continue;
      const adj = refundAdjustment({
        mode: row.calculation_mode,
        percentageBps: row.percentage_bps,
        fixedMinor: row.fixed_amount_minor,
        baseMinor: row.payment_base_minor,
        refundedBaseMinor: refunded,
        commissionMinor: row.commission_minor,
        reversedMinor: row.reversed_minor,
      });
      const nextStatus = adj.fullyReversed && (row.status === "pending" || row.status === "available") ? "reversed" : row.status;
      await db.query(
        `UPDATE referral_commissions
            SET refunded_base_minor = $2,
                reversed_minor = reversed_minor + $3,
                status = $4,
                reversed_at = CASE WHEN $4 = 'reversed' THEN NOW() ELSE reversed_at END
          WHERE id = $1`,
        [row.id, adj.refundedBaseMinor, adj.reverseMinor, nextStatus],
      );
      if (adj.reverseMinor > 0) {
        await insertLedger(db, {
          userId: row.referrer_user_id,
          eventType: row.status === "pending" ? "commission_reversed" : "commission_refund_adjustment",
          bucket: row.status === "pending" ? "pending" : "available",
          amountMinor: -adj.reverseMinor,
          commissionId: row.id,
          idempotencyKey: `refund:${row.id}:${adj.refundedBaseMinor}`,
          metadata: { reason, refundedBaseMinor: adj.refundedBaseMinor, targetMinor: adj.targetMinor },
        });
      }
      results.push({
        id: Number(row.id),
        status: nextStatus,
        reversedMinor: adj.reverseMinor,
        targetMinor: adj.targetMinor,
      });
    }
    await db.query("COMMIT");
    return { reversed: results };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

module.exports = {
  promoteMaturedCommissions,
  runReferralHoldProcessor,
  processReferralCommissionForPayment,
  reverseReferralCommission,
  evaluateBonuses,
};
