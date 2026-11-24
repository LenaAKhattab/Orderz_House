/**
 * Smart Orders S6 — monthly employee reward pool.
 *
 * Pool = percent × (sum of COMPANY share of the latest closed settlement version of every order whose
 * settlement was closed in that month), floored at 0. Freelancer compensation is never an input.
 * The `employee_reward_pool` policy is disabled (gate G7): preview works; approval/payout is refused
 * until management activates it with an approval reference.
 */

const { pool } = require("../../config/db");
const m = require("./money");
const finance = require("./orderFinanceService");

const FULL_BP = 10000;

function rErr(status, code, message, details) {
  const e = new Error(message);
  e.statusCode = status;
  e.publicCode = code;
  if (details) e.details = details;
  return e;
}

function parseMonth(v) {
  const s = String(v || "").trim();
  const mt = /^(\d{4})-(\d{2})$/.exec(s);
  if (!mt || Number(mt[2]) < 1 || Number(mt[2]) > 12) throw rErr(400, "REWARD_PERIOD_INVALID", "الشهر غير صالح (YYYY-MM).");
  return `${mt[1]}-${mt[2]}-01`;
}

/** Company share basis for a month: latest settlement version per order, closed within the month. */
async function companyShareForMonth(db, monthStart) {
  const { rows } = await db.query(
    `WITH latest AS (
       SELECT DISTINCT ON (order_id) order_id, company_milli, closed_at
         FROM order_settlements ORDER BY order_id, version DESC
     )
     SELECT COALESCE(SUM(company_milli), 0)::text AS total, COUNT(*)::int AS n
       FROM latest
      WHERE closed_at >= $1::date AND closed_at < ($1::date + interval '1 month')`,
    [monthStart],
  );
  return { totalMilli: BigInt(rows[0].total), count: rows[0].n };
}

async function loadPeriod(db, periodId, { forUpdate = false } = {}) {
  // period_month as TEXT: a DATE parsed into a JS Date can shift a day/month across time zones.
  const { rows } = await db.query(
    `SELECT *, to_char(period_month, 'YYYY-MM-DD') AS month_start FROM reward_periods WHERE id = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
    [Number(periodId)],
  );
  if (!rows[0]) throw rErr(404, "REWARD_PERIOD_NOT_FOUND", "الفترة غير موجودة.");
  return rows[0];
}

async function staffIds(db, ids) {
  const { rows } = await db.query(
    `SELECT id FROM users WHERE id = ANY($1::bigint[]) AND role IN ('admin', 'super_admin') AND COALESCE(is_active, true) = true`,
    [ids],
  );
  return new Set(rows.map((r) => Number(r.id)));
}

async function createPeriod({ month, actorUserId }) {
  const monthStart = parseMonth(month);
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  if (monthStart > currentMonth) throw rErr(400, "REWARD_PERIOD_INVALID", "لا يمكن إنشاء فترة لشهر مستقبلي.");
  const { rows } = await pool.query(
    `INSERT INTO reward_periods (period_month, created_by_user_id) VALUES ($1, $2)
     ON CONFLICT (period_month) DO NOTHING RETURNING id`,
    [monthStart, actorUserId ?? null],
  );
  if (!rows[0]) throw rErr(409, "REWARD_PERIOD_EXISTS", "توجد فترة لهذا الشهر.");
  return getPeriod(rows[0].id);
}

/** Replace the draft weights. Total must be exactly 100.00% (10000 bp); staff accounts only. */
async function setWeights({ periodId, weights }) {
  if (!Array.isArray(weights) || !weights.length || weights.length > 200) throw rErr(400, "REWARD_WEIGHTS_INVALID", "قائمة الأوزان غير صالحة.");
  const list = weights.map((w) => {
    const userId = Number(w?.userId);
    const pct = String(w?.percent ?? "").trim();
    if (!Number.isInteger(userId) || userId < 1 || !/^\d{1,3}(\.\d{1,2})?$/.test(pct)) {
      throw rErr(400, "REWARD_WEIGHTS_INVALID", "وزن غير صالح.");
    }
    const bp = Number(m.toMilli(pct) / 10n); // "12.34" → 1234 bp (exact)
    if (bp <= 0 || bp > FULL_BP) throw rErr(400, "REWARD_WEIGHTS_INVALID", "وزن غير صالح.");
    return { userId, bp };
  });
  if (new Set(list.map((w) => w.userId)).size !== list.length) throw rErr(400, "REWARD_WEIGHTS_INVALID", "موظف مكرر.");
  const total = list.reduce((a, w) => a + w.bp, 0);
  if (total !== FULL_BP) {
    throw rErr(400, "REWARD_WEIGHTS_TOTAL", "يجب أن يكون مجموع الأوزان 100% تمامًا.", { totalPercent: (total / 100).toFixed(2) });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const p = await loadPeriod(client, periodId, { forUpdate: true });
    if (p.status !== "draft") throw rErr(409, "REWARD_PERIOD_LOCKED", "لا يمكن تعديل أوزان فترة معتمدة.");
    const ok = await staffIds(client, list.map((w) => w.userId));
    const bad = list.filter((w) => !ok.has(w.userId));
    if (bad.length) throw rErr(400, "REWARD_WEIGHTS_INVALID", "المستفيدون يجب أن يكونوا موظفين.", { userIds: bad.map((b) => String(b.userId)) });
    await client.query(`DELETE FROM reward_period_weights WHERE period_id = $1`, [p.id]);
    for (const w of list) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(`INSERT INTO reward_period_weights (period_id, user_id, weight_bp) VALUES ($1, $2, $3)`, [p.id, w.userId, w.bp]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return getPeriod(periodId);
}

async function computePreview(db, p) {
  const policies = await finance.getPolicies(db);
  const policy = policies.employee_reward_pool;
  const percent = String(policy?.config?.percentOfCompanyShare || "5.00");
  const basis = await companyShareForMonth(db, p.month_start);
  const eligible = basis.totalMilli > 0n ? basis.totalMilli : 0n;
  const poolMilli = m.percentOf(eligible, percent);
  const { rows: ws } = await db.query(
    `SELECT w.user_id, w.weight_bp, u.first_name, u.family_name FROM reward_period_weights w
       JOIN users u ON u.id = w.user_id WHERE w.period_id = $1 ORDER BY w.user_id`,
    [p.id],
  );
  const total = ws.reduce((a, w) => a + w.weight_bp, 0);
  const alloc = total === FULL_BP ? m.allocateByWeights(poolMilli, ws.map((w) => ({ userId: String(w.user_id), weight: w.weight_bp }))) : [];
  return {
    policyActive: Boolean(policy?.active),
    policyVersion: policy?.version ?? null,
    percent,
    companyShareMilli: basis.totalMilli,
    settlementCount: basis.count,
    poolMilli,
    weights: ws.map((w) => ({
      userId: String(w.user_id),
      name: [w.first_name, w.family_name].filter(Boolean).join(" "),
      percent: (w.weight_bp / 100).toFixed(2),
      amount: alloc.length ? m.fromMilli(alloc.find((a) => a.userId === String(w.user_id)).amount, 3) : null,
    })),
    weightsTotalPercent: (total / 100).toFixed(2),
    weightsValid: total === FULL_BP,
  };
}

async function getPeriod(periodId) {
  const p = await loadPeriod(pool, periodId);
  const base = {
    id: String(p.id),
    month: p.month_start.slice(0, 7),
    status: p.status,
    paymentStatus: p.payment_status,
    paymentReference: p.payment_reference,
    approvedAt: p.approved_at,
    closedAt: p.closed_at,
    paidAt: p.paid_at,
  };
  if (p.status === "draft") {
    const prev = await computePreview(pool, p);
    return {
      ...base,
      preview: {
        ...prev,
        companyShare: m.fromMilli(prev.companyShareMilli, 3),
        pool: m.fromMilli(prev.poolMilli, 3),
        companyShareMilli: undefined,
        poolMilli: undefined,
      },
    };
  }
  const [alloc, adj] = await Promise.all([
    pool.query(
      `SELECT a.user_id, a.weight_bp, a.amount_milli, u.first_name, u.family_name FROM reward_allocations a
         JOIN users u ON u.id = a.user_id WHERE a.period_id = $1 ORDER BY a.user_id`,
      [p.id],
    ),
    pool.query(`SELECT * FROM reward_adjustments WHERE period_id = $1 ORDER BY id`, [p.id]),
  ]);
  return {
    ...base,
    frozen: {
      percent: p.percent_of_company_share,
      policyVersion: p.policy_version,
      companyShare: m.fromMilli(BigInt(p.company_share_milli), 3),
      pool: m.fromMilli(BigInt(p.pool_milli), 3),
      settlementCount: p.settlement_count,
    },
    allocations: alloc.rows.map((a) => ({
      userId: String(a.user_id),
      name: [a.first_name, a.family_name].filter(Boolean).join(" "),
      percent: (a.weight_bp / 100).toFixed(2),
      amount: m.fromMilli(BigInt(a.amount_milli), 3),
    })),
    adjustments: adj.rows.map((a) => ({ id: String(a.id), userId: String(a.user_id), amount: m.fromMilli(BigInt(a.amount_milli), 3), reason: a.reason, createdAt: a.created_at })),
  };
}

/** Draft helper: copy the most recent earlier period's weights (still validated + editable). */
async function copyPreviousWeights({ periodId }) {
  const p = await loadPeriod(pool, periodId);
  if (p.status !== "draft") throw rErr(409, "REWARD_PERIOD_LOCKED", "لا يمكن تعديل أوزان فترة معتمدة.");
  const { rows } = await pool.query(
    `SELECT w.user_id, w.weight_bp FROM reward_period_weights w
      WHERE w.period_id = (SELECT id FROM reward_periods WHERE period_month < $1::date ORDER BY period_month DESC LIMIT 1)`,
    [p.month_start],
  );
  if (!rows.length) throw rErr(404, "REWARD_PERIOD_NOT_FOUND", "لا توجد فترة سابقة لنسخ أوزانها.");
  return setWeights({
    periodId,
    weights: rows.map((r) => ({ userId: r.user_id, percent: (r.weight_bp / 100).toFixed(2) })),
  });
}

async function listPeriods() {
  const { rows } = await pool.query(`SELECT id FROM reward_periods ORDER BY period_month DESC LIMIT 36`);
  const out = [];
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    out.push(await getPeriod(r.id));
  }
  return out;
}

/** Approve: freezes pool + allocations. Refused while the policy is disabled (no deduction happens). */
async function approvePeriod({ periodId, actorUserId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const p = await loadPeriod(client, periodId, { forUpdate: true });
    if (p.status !== "draft") throw rErr(409, "REWARD_PERIOD_NOT_DRAFT", "تم اعتماد هذه الفترة مسبقًا.");
    const [yy, mm] = p.month_start.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(yy, mm, 1));
    if (monthEnd > new Date()) throw rErr(409, "REWARD_PERIOD_OPEN_MONTH", "لا يمكن اعتماد فترة قبل انتهاء الشهر.");
    const prev = await computePreview(client, p);
    if (!prev.policyActive) {
      throw rErr(409, "FINANCE_POLICY_DISABLED", "سياسة مكافآت الموظفين غير مفعّلة. يتطلب التفعيل موافقة الإدارة.");
    }
    if (!prev.weightsValid) throw rErr(400, "REWARD_WEIGHTS_TOTAL", "يجب أن يكون مجموع الأوزان 100% تمامًا.");
    const alloc = m.allocateByWeights(
      prev.poolMilli,
      prev.weights.map((w) => ({ userId: w.userId, weight: Number(m.toMilli(w.percent) / 10n) })),
    );
    for (const a of alloc) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO reward_allocations (period_id, user_id, weight_bp, amount_milli) VALUES ($1, $2, $3, $4)`,
        [p.id, Number(a.userId), a.weight, a.amount.toString()],
      );
    }
    // Employee notice (own amount only; savepoint-isolated, delivered after COMMIT).
    const monthLabel = p.month_start.slice(0, 7);
    for (const a of alloc) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await require("../notificationService").createIfNotExists(
          {
            recipientUserId: Number(a.userId),
            recipientRole: "admin",
            actorUserId: actorUserId ?? null,
            type: "finance.reward.approved",
            title: "تم اعتماد مكافأتك",
            message: `تم اعتماد مكافأة شهر ${monthLabel} بقيمة ${m.fromMilli(a.amount, 3)} JOD.`,
            entityType: "reward_period",
            entityId: Number(p.id),
            link: "/dashboard/admin/finance?tab=myRewards",
            priority: "normal",
            metadata: { month: monthLabel },
          },
          `reward_approved_${p.id}_${a.userId}`,
          client,
        );
      } catch (err) {
        console.error("[notifications]", err?.message || err);
      }
    }
    await client.query(
      `UPDATE reward_periods SET status = 'approved', policy_version = $2, percent_of_company_share = $3,
              company_share_milli = $4, pool_milli = $5, settlement_count = $6, approved_by_user_id = $7, approved_at = NOW()
        WHERE id = $1`,
      [p.id, prev.policyVersion, prev.percent, prev.companyShareMilli.toString(), prev.poolMilli.toString(), prev.settlementCount, actorUserId ?? null],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return getPeriod(periodId);
}

async function closePeriod({ periodId, actorUserId }) {
  const { rows } = await pool.query(
    `UPDATE reward_periods SET status = 'closed', closed_by_user_id = $2, closed_at = NOW()
      WHERE id = $1 AND status = 'approved' RETURNING id`,
    [Number(periodId), actorUserId ?? null],
  );
  if (!rows[0]) throw rErr(409, "REWARD_PERIOD_NOT_APPROVED", "يجب اعتماد الفترة قبل إقفالها.");
  return getPeriod(periodId);
}

/** Records that the payout happened outside the system (bank transfer etc.); moves no money. */
async function markPaid({ periodId, paymentReference, actorUserId }) {
  const ref = String(paymentReference || "").trim().slice(0, 200);
  if (ref.length < 3) throw rErr(400, "REWARD_PAYMENT_REFERENCE_REQUIRED", "مرجع الصرف مطلوب.");
  const { rows } = await pool.query(
    `UPDATE reward_periods SET payment_status = 'paid', payment_reference = $2, paid_by_user_id = $3, paid_at = NOW()
      WHERE id = $1 AND status = 'closed' AND payment_status = 'unpaid' RETURNING id`,
    [Number(periodId), ref, actorUserId ?? null],
  );
  if (!rows[0]) throw rErr(409, "REWARD_PERIOD_NOT_PAYABLE", "الفترة غير مقفلة أو مصروفة مسبقًا.");
  return getPeriod(periodId);
}

/** Corrections to an approved/closed period are append-only adjustments (never edits). */
async function addAdjustment({ periodId, userId, amount, reason, actorUserId }) {
  const p = await loadPeriod(pool, periodId);
  if (p.status === "draft") throw rErr(409, "REWARD_PERIOD_NOT_APPROVED", "عدّل الأوزان مباشرة في الفترة المسودة.");
  const amt = m.toMilli(amount);
  if (amt === 0n) throw rErr(400, "FINANCE_INVALID_AMOUNT", "المبلغ لا يمكن أن يكون صفرًا.");
  const why = String(reason || "").trim().slice(0, 500);
  if (why.length < 5) throw rErr(400, "FINANCE_REASON_REQUIRED", "السبب مطلوب.");
  const ok = await staffIds(pool, [Number(userId)]);
  if (!ok.has(Number(userId))) throw rErr(400, "REWARD_WEIGHTS_INVALID", "المستفيد يجب أن يكون موظفًا.");
  await pool.query(
    `INSERT INTO reward_adjustments (period_id, user_id, amount_milli, reason, created_by_user_id) VALUES ($1, $2, $3, $4, $5)`,
    [p.id, Number(userId), amt.toString(), why, actorUserId ?? null],
  );
  return getPeriod(periodId);
}

/** An employee's own rewards only (no company figures). */
async function myRewards(userId) {
  const { rows } = await pool.query(
    `SELECT to_char(p.period_month, 'YYYY-MM') AS month, p.status, p.payment_status, a.amount_milli, a.weight_bp,
            (SELECT COALESCE(SUM(amount_milli), 0) FROM reward_adjustments x WHERE x.period_id = p.id AND x.user_id = a.user_id)::text AS adj
       FROM reward_allocations a JOIN reward_periods p ON p.id = a.period_id
      WHERE a.user_id = $1 ORDER BY p.period_month DESC LIMIT 36`,
    [Number(userId)],
  );
  return rows.map((r) => ({
    month: r.month,
    status: r.status,
    paymentStatus: r.payment_status,
    percent: (r.weight_bp / 100).toFixed(2),
    amount: m.fromMilli(BigInt(r.amount_milli) + BigInt(r.adj), 3),
  }));
}

async function listEligibleStaff() {
  const { rows } = await pool.query(
    `SELECT id, first_name, family_name, email, role FROM users
      WHERE role IN ('admin', 'super_admin') AND COALESCE(is_active, true) = true
      ORDER BY first_name LIMIT 300`,
  );
  return rows.map((r) => ({ id: String(r.id), name: [r.first_name, r.family_name].filter(Boolean).join(" "), email: r.email, role: r.role }));
}

module.exports = {
  createPeriod,
  setWeights,
  copyPreviousWeights,
  getPeriod,
  listPeriods,
  approvePeriod,
  closePeriod,
  markPaid,
  addAdjustment,
  myRewards,
  listEligibleStaff,
  companyShareForMonth,
};
