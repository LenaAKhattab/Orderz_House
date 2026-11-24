/**
 * Smart Orders S5 — order financial engine.
 *
 * Gross → refunds → tax → processor fees → quality checks → direct costs → NET
 * NET − agreed freelancer compensation = company share.
 *
 * Rules (current Production policy, gates G2–G7):
 *  - Base currency JOD. Other currencies need an explicit, dated FX snapshot chosen by staff;
 *    rates are never invented or fetched implicitly, closed settlements never recompute.
 *  - Freelancer pay = the immutable accepted financial terms (S3) or the Admin budget for internal
 *    orders. Fees/costs are deducted from the company share, never from the freelancer.
 *  - VAT, revenue split, quality-check charging and the employee pool are policy-gated (disabled).
 *  - Client marketplace orders keep their existing claim rules (not recomputed here).
 *  - Recording never moves money; refunds are executed in Stripe by authorized staff.
 */

const { pool } = require("../../config/db");
const m = require("./money");
const { runLimited } = require("./runLimited");

const BASE_POLICY_KEYS = [
  "base_currency",
  "freelancer_compensation",
  "revenue_split",
  "vat",
  "payment_fees",
  "quality_checks",
  "employee_reward_pool",
];
/** Policies that change money and therefore need a management approval reference to activate. */
const GATED_POLICIES = new Set(["revenue_split", "vat", "quality_checks", "employee_reward_pool"]);

function fErr(status, code, message, details) {
  const e = new Error(message);
  e.statusCode = status;
  e.publicCode = code;
  if (details) e.details = details;
  return e;
}

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const ccy = (v) => {
  const c = String(v || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw fErr(400, "FINANCE_INVALID_CURRENCY", "العملة غير صالحة.");
  return c;
};
const posInt = (v, code = "FINANCE_INVALID_ID") => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw fErr(400, code, "المعرّف غير صالح.");
  return n;
};

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------
async function getPolicies(db = pool) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (policy_key) policy_key, version, status, config, approval_reference, note, effective_from, created_at
       FROM finance_policy_versions ORDER BY policy_key, version DESC`,
  );
  const out = {};
  for (const r of rows) {
    out[r.policy_key] = {
      key: r.policy_key,
      version: r.version,
      status: r.status,
      active: r.status === "active",
      config: r.config || {},
      gated: GATED_POLICIES.has(r.policy_key),
      approvalReference: r.approval_reference,
      note: r.note,
      effectiveFrom: r.effective_from,
    };
  }
  return out;
}

async function getPolicyHistory(key) {
  const { rows } = await pool.query(
    `SELECT v.*, u.first_name, u.family_name FROM finance_policy_versions v
       LEFT JOIN users u ON u.id = v.created_by_user_id
      WHERE v.policy_key = $1 ORDER BY v.version DESC LIMIT 50`,
    [key],
  );
  return rows.map((r) => ({
    version: r.version,
    status: r.status,
    config: r.config,
    approvalReference: r.approval_reference,
    note: r.note,
    effectiveFrom: r.effective_from,
    createdAt: r.created_at,
    createdBy: [r.first_name, r.family_name].filter(Boolean).join(" ") || null,
  }));
}

function normalizePolicyConfig(key, raw = {}) {
  const pct = (v, name) => {
    const s = String(v ?? "").trim();
    // Compared as exact milli-units (no float): 0 ≤ p ≤ 100 with at most 2 decimals.
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(s) || m.toMilli(s) > m.toMilli("100")) {
      throw fErr(400, "FINANCE_POLICY_INVALID", "نسبة غير صالحة.", { [name]: "invalid" });
    }
    return s;
  };
  switch (key) {
    case "base_currency": {
      const c = ccy(raw.currency);
      if (c !== "JOD") throw fErr(409, "FINANCE_POLICY_LOCKED", "تغيير العملة الأساسية يتطلب ترحيلًا للبيانات التاريخية ولا يتم من الواجهة.");
      return { currency: c };
    }
    case "freelancer_compensation":
      return { mode: "agreed_terms" };
    case "revenue_split":
      return { freelancerPercentOfNet: pct(raw.freelancerPercentOfNet, "freelancerPercentOfNet") };
    case "vat":
      return { ratePercent: pct(raw.ratePercent, "ratePercent"), pricesIncludeTax: true };
    case "payment_fees":
      return { source: "actual_recorded", deductFrom: "company_share" };
    case "quality_checks": {
      const unit = m.fromMilli(m.toMilli(raw.unitCost), 3);
      const max = Number(raw.maxPerOrder);
      if (!Number.isInteger(max) || max < 0 || max > 20) throw fErr(400, "FINANCE_POLICY_INVALID", "الحد الأقصى غير صالح.");
      return { unitCost: unit, currency: ccy(raw.currency), maxPerOrder: max };
    }
    case "employee_reward_pool":
      return { percentOfCompanyShare: pct(raw.percentOfCompanyShare, "percentOfCompanyShare"), period: "monthly" };
    default:
      throw fErr(400, "FINANCE_POLICY_INVALID", "سياسة غير معروفة.");
  }
}

/** New policy version. Activating a gated (money-changing) policy needs a management approval reference. */
async function setPolicy({ key, status, config, approvalReference, note, actorUserId }) {
  if (!BASE_POLICY_KEYS.includes(key)) throw fErr(404, "FINANCE_POLICY_NOT_FOUND", "سياسة غير معروفة.");
  if (!["active", "disabled"].includes(status)) throw fErr(400, "FINANCE_POLICY_INVALID", "الحالة غير صالحة.");
  if (["base_currency", "freelancer_compensation", "payment_fees"].includes(key) && status !== "active") {
    throw fErr(409, "FINANCE_POLICY_LOCKED", "هذه السياسة أساسية ولا يمكن تعطيلها.");
  }
  const ref = str(approvalReference, 300);
  if (GATED_POLICIES.has(key) && status === "active" && ref.length < 5) {
    throw fErr(400, "FINANCE_POLICY_APPROVAL_REQUIRED", "تفعيل هذه السياسة يتطلب مرجع موافقة الإدارة.");
  }
  const cfg = normalizePolicyConfig(key, config || {});
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('finance_policy:' || $1))`, [key]);
    const { rows } = await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM finance_policy_versions WHERE policy_key = $1`,
      [key],
    );
    await client.query(
      `INSERT INTO finance_policy_versions (policy_key, version, status, config, approval_reference, note, created_by_user_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [key, rows[0].v, status, JSON.stringify(cfg), ref || null, str(note, 500) || null, actorUserId ?? null],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return (await getPolicies())[key];
}

// ---------------------------------------------------------------------------
// FX snapshots
// ---------------------------------------------------------------------------
async function createFxSnapshot({ baseCurrency, quoteCurrency, rate, source, rateAt, note, actorUserId }) {
  const base = ccy(baseCurrency || "JOD");
  const quote = ccy(quoteCurrency);
  if (base === quote) throw fErr(400, "FINANCE_FX_INVALID", "زوج العملات غير صالح.");
  const r = String(rate ?? "").trim();
  if (!/^\d{1,13}(\.\d{1,10})?$/.test(r) || /^0+(\.0+)?$/.test(r)) throw fErr(400, "FINANCE_FX_INVALID", "سعر الصرف غير صالح.");
  const src = str(source, 120);
  if (src.length < 3) throw fErr(400, "FINANCE_FX_SOURCE_REQUIRED", "مصدر سعر الصرف مطلوب.");
  const at = rateAt ? new Date(rateAt) : null;
  if (!at || Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60 * 1000) {
    throw fErr(400, "FINANCE_FX_INVALID", "تاريخ سعر الصرف غير صالح.");
  }
  const { rows } = await pool.query(
    `INSERT INTO fx_rate_snapshots (base_currency, quote_currency, rate, source, rate_at, note, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [base, quote, r, src, at.toISOString(), str(note, 300) || null, actorUserId ?? null],
  );
  return mapFx(rows[0]);
}

function mapFx(r) {
  return {
    id: String(r.id),
    baseCurrency: r.base_currency,
    quoteCurrency: r.quote_currency,
    rate: String(r.rate),
    source: r.source,
    rateAt: r.rate_at,
    note: r.note,
    createdAt: r.created_at,
  };
}

async function listFxSnapshots({ quoteCurrency, limit = 50 } = {}) {
  const params = [];
  let where = "";
  if (quoteCurrency) {
    params.push(ccy(quoteCurrency));
    where = `WHERE quote_currency = $1`;
  }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
  const { rows } = await pool.query(
    `SELECT * FROM fx_rate_snapshots ${where} ORDER BY rate_at DESC, id DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapFx);
}

// ---------------------------------------------------------------------------
// Costs, adjustments
// ---------------------------------------------------------------------------
async function assertOrderExists(db, orderId) {
  const { rows } = await db.query(`SELECT id, source_type FROM orders WHERE id = $1`, [orderId]);
  if (!rows[0]) throw fErr(404, "FINANCE_ORDER_NOT_FOUND", "الطلب غير موجود.");
  return rows[0];
}

async function recordCost(input, db = pool) {
  // Quality checks have a per-order cap: count + insert must be serialized per order.
  if (input?.kind !== "quality_check" || db !== pool) return recordCostInner(input, db);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM orders WHERE id = $1 FOR UPDATE`, [posInt(input.orderId)]);
    const out = await recordCostInner(input, client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function recordCostInner({ orderId, kind, amount, currency, description, sourceRef, qcProvider, qcResult, actorUserId }, db = pool) {
  const oid = posInt(orderId);
  if (!["payment_fee", "quality_check", "direct_expense"].includes(kind)) throw fErr(400, "FINANCE_COST_INVALID", "نوع التكلفة غير صالح.");
  if (kind === "quality_check" && qcResult !== "passed") {
    // Failed technical checks never create a charge.
    throw fErr(400, "FINANCE_QC_NOT_BILLABLE", "لا تُسجَّل تكلفة لفحص لم ينجح.");
  }
  const amt = m.toMilli(amount);
  if (amt <= 0n) throw fErr(400, "FINANCE_INVALID_AMOUNT", "المبلغ يجب أن يكون أكبر من صفر.");
  const desc = str(description, 500);
  if (desc.length < 3) throw fErr(400, "FINANCE_DESCRIPTION_REQUIRED", "الوصف مطلوب.");
  await assertOrderExists(db, oid);
  if (kind === "quality_check") {
    const policies = await getPolicies(db);
    const max = Number(policies.quality_checks?.config?.maxPerOrder ?? 3);
    const { rows: n } = await db.query(
      `SELECT COUNT(*)::int AS n FROM order_cost_entries e
        WHERE e.order_id = $1 AND e.kind = 'quality_check'
          AND NOT EXISTS (SELECT 1 FROM order_cost_entry_voids v WHERE v.cost_entry_id = e.id)`,
      [oid],
    );
    if (n[0].n >= max) throw fErr(409, "FINANCE_QC_LIMIT", "تم بلوغ الحد الأقصى لفحوص الجودة لهذا الطلب.");
  }
  const ref = str(sourceRef, 160) || null;
  const { rows } = await db.query(
    `INSERT INTO order_cost_entries (order_id, kind, amount_milli, currency, description, source_ref, qc_provider, qc_result, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (kind, source_ref) WHERE source_ref IS NOT NULL DO NOTHING
     RETURNING id`,
    [oid, kind, amt.toString(), ccy(currency), desc, ref, kind === "quality_check" ? str(qcProvider, 60) || null : null,
      kind === "quality_check" ? "passed" : null, actorUserId ?? null],
  );
  return { id: rows[0] ? String(rows[0].id) : null, duplicate: !rows[0] };
}

async function voidCost({ costEntryId, reason, actorUserId }) {
  const id = posInt(costEntryId);
  const why = str(reason, 500);
  if (why.length < 5) throw fErr(400, "FINANCE_REASON_REQUIRED", "سبب الإلغاء مطلوب.");
  const { rows } = await pool.query(
    `INSERT INTO order_cost_entry_voids (cost_entry_id, reason, created_by_user_id)
     SELECT id, $2, $3 FROM order_cost_entries WHERE id = $1
     ON CONFLICT (cost_entry_id) DO NOTHING RETURNING id`,
    [id, why, actorUserId ?? null],
  );
  if (!rows[0]) throw fErr(409, "FINANCE_COST_VOID_INVALID", "التكلفة غير موجودة أو أُلغيت مسبقًا.");
  return { voided: true };
}

async function recordAdjustment({ orderId, kind, amount, currency, reason, sourceRef, actorUserId }, db = pool) {
  const oid = posInt(orderId);
  if (!["refund", "dispute_loss", "customer_credit", "correction"].includes(kind)) {
    throw fErr(400, "FINANCE_ADJUSTMENT_INVALID", "نوع التسوية غير صالح.");
  }
  const amt = m.toMilli(amount);
  if (amt === 0n) throw fErr(400, "FINANCE_INVALID_AMOUNT", "المبلغ لا يمكن أن يكون صفرًا.");
  if (kind !== "correction" && amt < 0n) throw fErr(400, "FINANCE_INVALID_AMOUNT", "المبلغ يجب أن يكون موجبًا.");
  const why = str(reason, 500);
  if (why.length < 5) throw fErr(400, "FINANCE_REASON_REQUIRED", "السبب مطلوب.");
  await assertOrderExists(db, oid);
  const { rows } = await db.query(
    `INSERT INTO order_financial_adjustments (order_id, kind, amount_milli, currency, reason, source_ref, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (kind, source_ref) WHERE source_ref IS NOT NULL DO NOTHING RETURNING id`,
    [oid, kind, amt.toString(), ccy(currency), why, str(sourceRef, 160) || null, actorUserId ?? null],
  );
  return { id: rows[0] ? String(rows[0].id) : null, duplicate: !rows[0] };
}

// ---------------------------------------------------------------------------
// Payment exceptions
// ---------------------------------------------------------------------------
async function recordPaymentException(db, { orderId, quoteId, paymentId, kind, amountMilli, currency, detail, sourceRef }) {
  const { rows } = await db.query(
    `INSERT INTO payment_exceptions (order_id, quote_id, payment_id, kind, amount_milli, currency, detail, source_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (kind, source_ref) DO NOTHING RETURNING id`,
    [orderId ?? null, quoteId ?? null, paymentId ?? null, kind, amountMilli != null ? String(amountMilli) : null,
      currency || null, JSON.stringify(detail || {}), String(sourceRef).slice(0, 160)],
  );
  return rows[0] ? String(rows[0].id) : null;
}

async function listPaymentExceptions({ status = "open", orderId = null, limit = 50 } = {}) {
  const params = [];
  const where = [];
  if (status && status !== "all") {
    params.push(status);
    where.push(`e.status = $${params.length}`);
  }
  if (orderId) {
    params.push(posInt(orderId));
    where.push(`e.order_id = $${params.length}`);
  }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
  const { rows } = await pool.query(
    `SELECT e.*, o.order_code, q.version AS quote_version
       FROM payment_exceptions e
       LEFT JOIN orders o ON o.id = e.order_id
       LEFT JOIN order_quotes q ON q.id = e.quote_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY e.created_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({
    id: String(r.id),
    orderId: r.order_id ? String(r.order_id) : null,
    orderCode: r.order_code || null,
    quoteId: r.quote_id ? String(r.quote_id) : null,
    quoteVersion: r.quote_version ?? null,
    kind: r.kind,
    status: r.status,
    amount: r.amount_milli != null ? m.fromMilli(BigInt(r.amount_milli), 3) : null,
    currency: r.currency,
    detail: r.detail,
    resolution: r.resolution,
    resolutionNote: r.resolution_note,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
  }));
}

/** Resolution is a decision record only: refunds are executed in Stripe by authorized staff, never here. */
async function resolvePaymentException({ exceptionId, resolution, note, actorUserId }) {
  const id = posInt(exceptionId);
  if (!["refunded_in_stripe", "kept_with_authorization", "no_action_required", "other"].includes(resolution)) {
    throw fErr(400, "FINANCE_EXCEPTION_INVALID", "نوع المعالجة غير صالح.");
  }
  const why = str(note, 1000);
  if (why.length < 5) throw fErr(400, "FINANCE_REASON_REQUIRED", "ملاحظة المعالجة مطلوبة.");
  const { rows } = await pool.query(
    `UPDATE payment_exceptions SET status = 'resolved', resolution = $2, resolution_note = $3,
            resolved_by_user_id = $4, resolved_at = NOW()
      WHERE id = $1 AND status = 'open' RETURNING id`,
    [id, resolution, why, actorUserId ?? null],
  );
  if (!rows[0]) throw fErr(409, "FINANCE_EXCEPTION_NOT_OPEN", "الاستثناء غير موجود أو تمت معالجته.");
  return { resolved: true };
}

// ---------------------------------------------------------------------------
// Settlement preview / close
// ---------------------------------------------------------------------------
async function loadFx(db, ids) {
  const list = (ids || []).map((x) => posInt(x, "FINANCE_FX_INVALID"));
  if (!list.length) return new Map();
  const { rows } = await db.query(`SELECT * FROM fx_rate_snapshots WHERE id = ANY($1::bigint[])`, [list]);
  if (rows.length !== new Set(list).size) throw fErr(400, "FINANCE_FX_INVALID", "سعر صرف غير موجود.");
  const map = new Map();
  for (const r of rows) {
    if (map.has(r.quote_currency)) throw fErr(400, "FINANCE_FX_INVALID", "أكثر من سعر صرف لنفس العملة.");
    map.set(r.quote_currency, r);
  }
  return map;
}

/**
 * Pure-ish computation over loaded facts (exported for unit tests).
 * Every line: { label, currency, milli }. Returns BigInt amounts in base currency.
 */
function computeBreakdown({ base, lines, fx, policies, freelancer }) {
  const fxUsed = new Set();
  const missing = new Set();
  const toBase = (milli, currency) => {
    if (currency === base) return BigInt(milli);
    const r = fx.get(currency);
    if (!r || r.base_currency !== base) {
      missing.add(currency);
      return null;
    }
    fxUsed.add(String(r.id));
    return m.convertQuoteToBase(BigInt(milli), String(r.rate));
  };
  const sum = (arr) => {
    let total = 0n;
    let ok = true;
    for (const l of arr) {
      const v = toBase(l.milli, l.currency);
      l.baseMilli = v;
      if (v == null) ok = false;
      else total += v;
    }
    return ok ? total : null;
  };
  const gross = sum(lines.revenue);
  const refunds = sum(lines.adjustments);
  const fees = sum(lines.fees);
  const qcAll = sum(lines.qualityChecks);
  const qc = policies.quality_checks?.active ? qcAll : 0n;
  const costs = sum(lines.directCosts);
  // VAT: prices include tax; only taxable lines while the VAT policy is active (gate G4).
  let tax = 0n;
  if (policies.vat?.active) {
    for (const l of lines.revenue) {
      if (l.taxTreatment === "taxable" && l.baseMilli != null) tax += m.inclusiveTax(l.baseMilli, policies.vat.config.ratePercent);
    }
  }
  const freelancerBase = freelancer ? toBase(freelancer.milli, freelancer.currency) : 0n;
  const ready = [gross, refunds, fees, qcAll, costs, freelancerBase].every((v) => v != null);
  const net = ready ? gross - refunds - tax - fees - qc - costs : null;
  const company = ready ? net - freelancerBase : null;
  let splitSuggestion = null;
  if (ready && policies.revenue_split?.active) {
    splitSuggestion = m.percentOf(net, policies.revenue_split.config.freelancerPercentOfNet);
  }
  return {
    ready,
    fxMissing: [...missing],
    fxUsed: [...fxUsed],
    amounts: { gross, refunds, tax, fees, qualityChecks: qc, qualityChecksExcluded: policies.quality_checks?.active ? 0n : qcAll ?? 0n, directCosts: costs, net, freelancer: freelancerBase, company },
    splitSuggestion,
  };
}

async function loadOrderFacts(db, orderId) {
  const { rows: o } = await db.query(
    `SELECT id, order_code, title, source_type, order_status, budget, assigned_freelancer_id, customer_mode
       FROM orders WHERE id = $1`,
    [orderId],
  );
  const order = o[0];
  if (!order) throw fErr(404, "FINANCE_ORDER_NOT_FOUND", "الطلب غير موجود.");
  // Bounded: never hold more than 3 pool connections for one order view (pool max 10).
  const [quotes, terms, costs, adjs, exc, claims, settlements] = await runLimited([
    () => db.query(
      `SELECT id, version, currency, payment_status, paid_amount_minor, total_amount, tax_treatment, paid_at
         FROM order_quotes WHERE order_id = $1 AND payment_status IN ('paid', 'paid_inactive') ORDER BY version`,
      [orderId],
    ),
    () => db.query(
      `SELECT compensation_amount, currency, terms_version, freelancer_user_id FROM order_financial_terms
        WHERE order_id = $1 ORDER BY terms_version DESC LIMIT 1`,
      [orderId],
    ),
    () => db.query(
      `SELECT e.*, (v.id IS NOT NULL) AS voided FROM order_cost_entries e
         LEFT JOIN order_cost_entry_voids v ON v.cost_entry_id = e.id
        WHERE e.order_id = $1 ORDER BY e.id`,
      [orderId],
    ),
    () => db.query(`SELECT * FROM order_financial_adjustments WHERE order_id = $1 ORDER BY id`, [orderId]),
    () => db.query(`SELECT COUNT(*)::int AS n FROM payment_exceptions WHERE order_id = $1 AND status = 'open'`, [orderId]),
    () => db.query(
      `SELECT id, status, user_amount_snapshot, paid_amount FROM financial_claims WHERE project_id = $1 ORDER BY id`,
      [orderId],
    ),
    () => db.query(`SELECT * FROM order_settlements WHERE order_id = $1 ORDER BY version`, [orderId]),
  ]);
  return { order, quotes: quotes.rows, terms: terms.rows[0] || null, costs: costs.rows, adjs: adjs.rows, openExceptions: exc.rows[0].n, claims: claims.rows, settlements: settlements.rows };
}

function linesFromFacts(f) {
  const revenue = f.quotes
    .filter((q) => q.payment_status === "paid" && q.paid_amount_minor != null)
    .map((q) => ({
      label: `quote_v${q.version}`,
      currency: q.currency,
      milli: m.stripeMinorToMilli(q.paid_amount_minor, q.currency),
      taxTreatment: q.tax_treatment,
      sourceId: String(q.id),
    }));
  const live = f.costs.filter((c) => !c.voided);
  const pick = (kind) => live.filter((c) => c.kind === kind).map((c) => ({ label: c.description, currency: c.currency, milli: BigInt(c.amount_milli), sourceId: String(c.id) }));
  return {
    revenue,
    adjustments: f.adjs.map((a) => ({ label: `${a.kind}: ${a.reason}`, currency: a.currency, milli: BigInt(a.amount_milli), sourceId: String(a.id) })),
    fees: pick("payment_fee"),
    qualityChecks: pick("quality_check"),
    directCosts: pick("direct_expense"),
    unallocated: f.quotes
      .filter((q) => q.payment_status === "paid_inactive" && q.paid_amount_minor != null)
      .map((q) => ({ label: `quote_v${q.version}`, currency: q.currency, milli: m.stripeMinorToMilli(q.paid_amount_minor, q.currency) })),
  };
}

function freelancerFromFacts(f) {
  if (f.terms) return { milli: m.numericToMilli(f.terms.compensation_amount), currency: f.terms.currency || "JOD", source: `terms_v${f.terms.terms_version}` };
  if (f.order.assigned_freelancer_id && f.order.budget != null) {
    return { milli: m.numericToMilli(f.order.budget), currency: "JOD", source: "order_budget" };
  }
  return null;
}

const fmt = (v) => (v == null ? null : m.fromMilli(v, 3));
const fmtLines = (arr) =>
  arr.map((l) => ({ label: l.label, currency: l.currency, amount: m.fromMilli(l.milli, 3), baseAmount: l.baseMilli == null ? null : m.fromMilli(l.baseMilli, 3), sourceId: l.sourceId }));

async function previewSettlement({ orderId, fxSnapshotIds = [] }, db = pool) {
  const oid = posInt(orderId);
  const policies = await getPolicies(db);
  const base = policies.base_currency?.config?.currency || "JOD";
  const facts = await loadOrderFacts(db, oid);
  if (facts.order.source_type === "client_created") {
    return {
      orderId: String(oid),
      supported: false,
      reason: "client_marketplace_existing_rules",
      latestSettlement: null,
    };
  }
  const fx = await loadFx(db, fxSnapshotIds);
  const lines = linesFromFacts(facts);
  const freelancer = freelancerFromFacts(facts);
  const b = computeBreakdown({ base, lines, fx, policies, freelancer });
  const blockers = [];
  if (!b.ready) blockers.push("fx_snapshot_required");
  if (facts.order.order_status !== "completed") blockers.push("order_not_completed");
  if (facts.openExceptions > 0) blockers.push("open_payment_exceptions");
  const latest = facts.settlements[facts.settlements.length - 1] || null;
  return {
    orderId: String(oid),
    orderCode: facts.order.order_code,
    supported: true,
    baseCurrency: base,
    orderStatus: facts.order.order_status,
    amounts: Object.fromEntries(Object.entries(b.amounts).map(([k, v]) => [k, fmt(v)])),
    companyShareNegative: b.ready ? b.amounts.company < 0n : null,
    lines: {
      revenue: fmtLines(lines.revenue),
      adjustments: fmtLines(lines.adjustments),
      fees: fmtLines(lines.fees),
      qualityChecks: fmtLines(lines.qualityChecks),
      directCosts: fmtLines(lines.directCosts),
      unallocatedReceipts: lines.unallocated.map((l) => ({ label: l.label, currency: l.currency, amount: m.fromMilli(l.milli, 3) })),
    },
    freelancer: freelancer ? { source: freelancer.source, currency: freelancer.currency, amount: m.fromMilli(freelancer.milli, 3) } : null,
    splitSuggestion: b.splitSuggestion == null ? null : fmt(b.splitSuggestion),
    fxMissing: b.fxMissing,
    fxUsed: b.fxUsed,
    policies: Object.fromEntries(Object.values(policies).map((p) => [p.key, { active: p.active, version: p.version }])),
    claims: facts.claims.map((c) => ({ id: String(c.id), status: c.status, amount: c.user_amount_snapshot != null ? String(c.user_amount_snapshot) : null, paid: String(c.paid_amount) })),
    openExceptions: facts.openExceptions,
    blockers,
    canClose: blockers.length === 0,
    settlements: facts.settlements.map(mapSettlement),
    latestSettlement: latest ? mapSettlement(latest) : null,
  };
}

function mapSettlement(r) {
  return {
    id: String(r.id),
    version: r.version,
    baseCurrency: r.base_currency,
    gross: m.fromMilli(BigInt(r.gross_milli), 3),
    refunds: m.fromMilli(BigInt(r.refunds_milli), 3),
    tax: m.fromMilli(BigInt(r.tax_milli), 3),
    fees: m.fromMilli(BigInt(r.fees_milli), 3),
    qualityChecks: m.fromMilli(BigInt(r.quality_checks_milli), 3),
    directCosts: m.fromMilli(BigInt(r.direct_costs_milli), 3),
    net: m.fromMilli(BigInt(r.net_milli), 3),
    freelancer: m.fromMilli(BigInt(r.freelancer_milli), 3),
    company: m.fromMilli(BigInt(r.company_milli), 3),
    correctionReason: r.correction_reason,
    fxSnapshotIds: (r.fx_snapshot_ids || []).map(String),
    closedAt: r.closed_at,
  };
}

/**
 * Close (or correct) a settlement. Idempotent via expectedVersion; serialized per order.
 * A correction (expectedVersion ≥ 1) appends version n+1 with a mandatory reason; history stays.
 */
async function closeSettlement({ orderId, expectedVersion, fxSnapshotIds = [], correctionReason, actorUserId }) {
  const oid = posInt(orderId);
  const expected = Number(expectedVersion);
  if (!Number.isInteger(expected) || expected < 0) throw fErr(400, "FINANCE_SETTLEMENT_VERSION_REQUIRED", "رقم النسخة المتوقعة مطلوب.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM orders WHERE id = $1 FOR UPDATE`, [oid]);
    const preview = await previewSettlement({ orderId: oid, fxSnapshotIds }, client);
    if (!preview.supported) throw fErr(409, "FINANCE_SETTLEMENT_UNSUPPORTED", "هذا الطلب يتبع قواعد السوق الحالية.");
    const current = preview.latestSettlement ? preview.latestSettlement.version : 0;
    if (current !== expected) throw fErr(409, "FINANCE_SETTLEMENT_VERSION_CONFLICT", "تغيّرت التسوية. حدّث الصفحة.", { currentVersion: current });
    if (!preview.canClose) throw fErr(409, "FINANCE_SETTLEMENT_BLOCKED", "لا يمكن إقفال التسوية حاليًا.", { blockers: preview.blockers });
    const reason = str(correctionReason, 500);
    if (current >= 1 && reason.length < 5) throw fErr(400, "FINANCE_REASON_REQUIRED", "سبب التصحيح مطلوب.");
    const a = preview.amounts;
    const prev = preview.latestSettlement;
    const { rows } = await client.query(
      `INSERT INTO order_settlements
         (order_id, version, base_currency, gross_milli, refunds_milli, tax_milli, fees_milli, quality_checks_milli,
          direct_costs_milli, net_milli, freelancer_milli, company_milli, breakdown, policy_snapshot, fx_snapshot_ids,
          supersedes_settlement_id, correction_reason, closed_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::bigint[],$16,$17,$18)
       RETURNING *`,
      [
        oid, current + 1, preview.baseCurrency,
        m.toMilli(a.gross).toString(), m.toMilli(a.refunds).toString(), m.toMilli(a.tax).toString(), m.toMilli(a.fees).toString(),
        m.toMilli(a.qualityChecks).toString(), m.toMilli(a.directCosts).toString(), m.toMilli(a.net).toString(),
        m.toMilli(a.freelancer).toString(), m.toMilli(a.company).toString(),
        JSON.stringify({ lines: preview.lines, freelancer: preview.freelancer, claims: preview.claims }),
        JSON.stringify(preview.policies), preview.fxUsed,
        prev ? Number(prev.id) : null, current >= 1 ? reason : null, actorUserId ?? null,
      ],
    );
    await client.query("COMMIT");
    return mapSettlement(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    if (e.code === "23505") throw fErr(409, "FINANCE_SETTLEMENT_VERSION_CONFLICT", "تم إقفال التسوية بالفعل.");
    throw e;
  } finally {
    client.release();
  }
}

async function getOrderFinance({ orderId, fxSnapshotIds }) {
  const oid = posInt(orderId);
  const preview = await previewSettlement({ orderId: oid, fxSnapshotIds });
  const [costs, adjustments, exceptions] = await runLimited([
    () => pool.query(
      `SELECT e.*, v.reason AS void_reason, v.created_at AS voided_at FROM order_cost_entries e
         LEFT JOIN order_cost_entry_voids v ON v.cost_entry_id = e.id WHERE e.order_id = $1 ORDER BY e.id DESC`,
      [oid],
    ),
    () => pool.query(`SELECT * FROM order_financial_adjustments WHERE order_id = $1 ORDER BY id DESC`, [oid]),
    () => listPaymentExceptions({ status: "all", orderId: oid }),
  ]);
  return {
    settlement: preview,
    costs: costs.rows.map((c) => ({
      id: String(c.id),
      kind: c.kind,
      amount: m.fromMilli(BigInt(c.amount_milli), 3),
      currency: c.currency,
      description: c.description,
      sourceRef: c.source_ref,
      qcProvider: c.qc_provider,
      voided: Boolean(c.voided_at),
      voidReason: c.void_reason,
      createdAt: c.created_at,
    })),
    adjustments: adjustments.rows.map((a) => ({
      id: String(a.id),
      kind: a.kind,
      amount: m.fromMilli(BigInt(a.amount_milli), 3),
      currency: a.currency,
      reason: a.reason,
      createdAt: a.created_at,
    })),
    exceptions,
  };
}

module.exports = {
  GATED_POLICIES,
  getPolicies,
  getPolicyHistory,
  setPolicy,
  createFxSnapshot,
  listFxSnapshots,
  recordCost,
  voidCost,
  recordAdjustment,
  recordPaymentException,
  listPaymentExceptions,
  resolvePaymentException,
  computeBreakdown,
  previewSettlement,
  closeSettlement,
  getOrderFinance,
};
