/**
 * Smart Orders S3 — commercial handoff for Admin-created customer orders (S1 customer modes).
 *
 *   quote (versioned, immutable once superseded) → customer acceptance → Stripe payment (webhook truth)
 *   or audited work authorization → assignment OFFER → freelancer accept / reject / expire
 *   → immutable financial terms snapshot → work may start.
 *
 * Current Production policy is preserved: freelancer pay = orders.budget (JOD, fixed), no VAT applied,
 * no revenue split, no employee pool. Legacy internal Admin orders, client marketplace orders and
 * WhatsApp intakes keep their existing flows (offers apply to customer-mode orders only).
 */
const crypto = require("crypto");
const { pool } = require("../config/db");
const { createPublicApiError } = require("../utils/publicApiError");
const { getPrimaryClientUrl } = require("../config/clientUrl");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");

const QUOTE_CURRENCIES = Object.freeze(["JOD", "AED"]);
const TAX_TREATMENTS = Object.freeze(["not_applicable", "taxable", "zero_rated", "exempt", "out_of_scope"]);
const REJECTION_REASONS = Object.freeze(["unavailable", "outside_skills", "deadline_too_short", "compensation", "other"]);
const LIVE_QUOTE = ["issued", "accepted"];
const MAX_ADJUSTMENTS = 10;
const MAX_AMOUNT_CENTS = 100000000; // 1,000,000.00
const OFFER_HOURS = Object.freeze({ min: 1, max: 168, default: 24 });
const QUOTE_DAYS = Object.freeze({ min: 1, max: 60, default: 7 });
const QUOTE_PAYMENT_PURPOSE = "order_quote_payment";

function cErr(status, code, messageAr, fieldErrors) {
  const err = createPublicApiError(messageAr, status, code);
  if (fieldErrors) err.fieldErrors = fieldErrors;
  return err;
}

// ---------------------------------------------------------------------------
// Money: integer cents only (no float arithmetic on money)
// ---------------------------------------------------------------------------

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
function asciiDigits(s) {
  return String(s ?? "").replace(ARABIC_DIGITS, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** "12.5" → 1250; signed allowed for adjustments. Returns null when invalid. */
function toCents(raw, { signed = false } = {}) {
  const s = asciiDigits(raw).trim().replace(/,/g, ".");
  const re = signed ? /^-?\d{1,7}(\.\d{1,2})?$/ : /^\d{1,7}(\.\d{1,2})?$/;
  if (!re.test(s)) return null;
  const neg = s.startsWith("-");
  const [i, f = ""] = s.replace("-", "").split(".");
  const cents = Number(i) * 100 + Number((f + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > MAX_AMOUNT_CENTS) return null;
  return neg ? -cents : cents;
}

function centsToText(c) {
  const neg = c < 0;
  const a = Math.abs(c);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

function sha256Hex(v) {
  return crypto.createHash("sha256").update(String(v), "utf8").digest("hex");
}

function isWellFormedToken(t) {
  return typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);
}

function baseUrl() {
  return String(getPrimaryClientUrl() || "https://orderzhouse.com").replace(/\/+$/, "");
}

function guestQuoteUrl(token, ret) {
  // Token only in the fragment: never sent to servers, proxies or Stripe logs as a query string.
  return `${baseUrl()}/pay-quote${ret ? `?r=${ret}` : ""}#t=${token}`;
}

function staffRole(role) {
  return role === "super_admin" ? "super_admin" : "admin";
}

async function withTx(fn) {
  const client = await pool.connect();
  const after = [];
  try {
    await client.query("BEGIN");
    const out = await fn(client, after);
    await client.query("COMMIT");
    for (const job of after) {
      // Post-COMMIT side effects only (Stripe session expiry, etc.). Never throw to the caller.
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve()
        .then(job)
        .catch(() => {});
    }
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function event(client, { orderId, action, actorUserId = null, actorRole = null, detail = {} }) {
  await client.query(
    `INSERT INTO order_commercial_events (order_id, action, actor_user_id, actor_role, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [Number(orderId), action, actorUserId != null ? Number(actorUserId) : null, actorRole, JSON.stringify(detail || {})],
  );
}

/** Notification inside the caller's transaction (savepoint-isolated; realtime/push after COMMIT). */
async function notify(client, payload, dedupeKey) {
  try {
    const notificationService = require("./notificationService");
    await notificationService.createIfNotExists(payload, dedupeKey, client);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications]", err?.message || err);
  }
}

async function loadCustomerOrderForUpdate(client, orderId) {
  const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [Number(orderId)]);
  const o = rows[0];
  if (!o || !["admin_created", "super_admin_created"].includes(o.source_type)) {
    throw cErr(404, "SMART_ORDER_NOT_FOUND", "الطلب غير موجود.");
  }
  if (!o.customer_mode) {
    throw cErr(409, "SMART_ORDER_COMMERCIAL_NOT_APPLICABLE", "هذا طلب داخلي بدون عميل؛ لا ينطبق عليه عرض السعر.");
  }
  return o;
}

// ---------------------------------------------------------------------------
// Lazy expiration (no polling): applied on every read/write that touches these rows
// ---------------------------------------------------------------------------

async function expireDue(client, { orderId = null, freelancerUserId = null } = {}) {
  const params = [];
  let filterQ = "";
  let filterO = "";
  if (orderId != null) {
    params.push(Number(orderId));
    filterQ = `AND order_id = $${params.length}`;
    filterO = filterQ;
  } else if (freelancerUserId != null) {
    params.push(Number(freelancerUserId));
    filterO = `AND freelancer_user_id = $${params.length}`;
  }
  const { rows: q } = await client.query(
    `UPDATE order_quotes SET status = 'expired', updated_at = NOW()
      WHERE status IN ('issued', 'accepted') AND payment_status = 'unpaid' AND expires_at <= NOW() ${filterQ}
      RETURNING id, order_id, version`,
    params.slice(0, filterQ ? 1 : 0),
  );
  for (const r of q) await event(client, { orderId: r.order_id, action: "quote_expired", detail: { quoteId: String(r.id), version: r.version } });
  const { rows: o } = await client.query(
    `UPDATE order_assignment_offers SET status = 'expired', updated_at = NOW()
      WHERE id IN (
        SELECT id FROM order_assignment_offers
         WHERE status = 'pending' AND expires_at <= NOW() ${filterO}
         ORDER BY expires_at LIMIT 200)
      RETURNING id, order_id, freelancer_user_id`,
    params.slice(0, filterO ? 1 : 0),
  );
  for (const r of o) {
    await event(client, {
      orderId: r.order_id,
      action: "offer_expired",
      detail: { offerId: String(r.id), freelancerUserId: String(r.freelancer_user_id) },
    });
  }
  return { quotes: q.length, offers: o.length };
}

// ---------------------------------------------------------------------------
// Readiness / start-work gate
// ---------------------------------------------------------------------------

/** Customer orders may start only after a confirmed payment OR an explicit audited authorization. */
async function isFinanciallyReady(client, order) {
  if (!order.customer_mode) return true;
  const { rows } = await client.query(
    `SELECT
        EXISTS (SELECT 1 FROM order_quotes WHERE order_id = $1 AND payment_status = 'paid') AS paid,
        EXISTS (SELECT 1 FROM order_work_authorizations WHERE order_id = $1) AS authorized`,
    [Number(order.id)],
  );
  return Boolean(rows[0]?.paid || rows[0]?.authorized);
}

function computeDueAt(start, durationValue, durationUnit) {
  const v = Number(durationValue);
  const mul = durationUnit === "days" ? 86400000 : durationUnit === "hours" ? 3600000 : 60000;
  if (!Number.isFinite(v) || v <= 0) return null;
  return new Date(start.getTime() + v * mul);
}

/** Accepted + financially ready → 'in_progress' (work may start). Idempotent. */
async function startWorkIfReady(client, orderId, { actorUserId = null, actorRole = null } = {}) {
  const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [Number(orderId)]);
  const o = rows[0];
  if (!o || o.order_status !== "assigned" || !o.assigned_freelancer_id) return false;
  const { rows: acc } = await client.query(
    `SELECT id FROM order_assignment_offers WHERE order_id = $1 AND status = 'accepted' LIMIT 1`,
    [o.id],
  );
  if (!acc[0] || !(await isFinanciallyReady(client, o))) return false;
  const now = new Date();
  const { rows: t } = await client.query(
    `SELECT due_at FROM order_financial_terms WHERE order_id = $1 ORDER BY terms_version DESC LIMIT 1`,
    [o.id],
  );
  const dueAt = t[0]?.due_at || computeDueAt(now, o.duration_value, o.duration_unit);
  await client.query(
    `UPDATE orders SET order_status = 'in_progress', started_at = $2, due_at = $3, updated_at = NOW() WHERE id = $1`,
    [o.id, now, dueAt],
  );
  await event(client, { orderId: o.id, action: "work_started", actorUserId, actorRole, detail: {} });
  await notify(
    client,
    {
      recipientUserId: Number(o.assigned_freelancer_id),
      recipientRole: "freelancer",
      actorUserId: actorUserId != null ? Number(actorUserId) : null,
      type: "order.work.authorized",
      title: "يمكنك بدء العمل",
      message: "تم تأكيد الدفع أو التصريح، ويمكنك الآن بدء تنفيذ الطلب.",
      entityType: "order",
      entityId: Number(o.id),
      link: `/dashboard/freelancer/my-orders/${encodeURIComponent(String(o.id))}`,
      priority: "high",
      metadata: { orderId: String(o.id) },
    },
    `order_work_started_${o.id}`,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

function parseQuoteInput(input) {
  const errors = {};
  const base = toCents(input?.baseAmount);
  if (base === null || base <= 0) errors.baseAmount = "invalid_amount";
  const currency = String(input?.currency || "").toUpperCase();
  if (!QUOTE_CURRENCIES.includes(currency)) errors.currency = "invalid";
  const adjRaw = Array.isArray(input?.adjustments) ? input.adjustments : [];
  if (adjRaw.length > MAX_ADJUSTMENTS) errors.adjustments = "too_many";
  const adjustments = [];
  adjRaw.slice(0, MAX_ADJUSTMENTS).forEach((a, i) => {
    const label = String(a?.label || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 120);
    const amt = toCents(a?.amount, { signed: true });
    if (!label || amt === null || amt === 0) errors[`adjustments[${i}]`] = "invalid";
    else adjustments.push({ label, amount: centsToText(amt), cents: amt });
  });
  const days = input?.validDays === undefined || input?.validDays === null || input?.validDays === "" ? QUOTE_DAYS.default : Number(input.validDays);
  if (!Number.isInteger(days) || days < QUOTE_DAYS.min || days > QUOTE_DAYS.max) errors.validDays = "invalid";
  const tax = String(input?.taxTreatment || "not_applicable");
  if (!TAX_TREATMENTS.includes(tax)) errors.taxTreatment = "invalid";
  const termsNote = input?.termsNote ? String(input.termsNote).replace(/[<>\u0000-\u0008]/g, "").trim().slice(0, 1000) : null;
  const total = (base || 0) + adjustments.reduce((s, a) => s + a.cents, 0);
  if (!errors.baseAmount && total <= 0) errors.total = "non_positive";
  if (Object.keys(errors).length) throw cErr(400, "SMART_ORDER_QUOTE_INVALID", "بيانات عرض السعر غير صالحة.", errors);
  return {
    baseCents: base,
    currency,
    adjustments: adjustments.map(({ label, amount }) => ({ label, amount })),
    totalCents: total,
    validDays: days,
    taxTreatment: tax,
    termsNote: termsNote || null,
  };
}

/**
 * Issue a quote. A live unpaid quote is SUPERSEDED (never edited) and its open Checkout Session is
 * expired after COMMIT; a paid quote cannot be replaced. Guests get a one-time payment link token.
 */
async function issueQuote({ orderId, input, actorUserId, actorRole }) {
  const q = parseQuoteInput(input);
  const res = await withTx(async (client, after) => {
    const order = await loadCustomerOrderForUpdate(client, orderId);
    if (["completed", "cancelled"].includes(order.order_status)) {
      throw cErr(409, "SMART_ORDER_ACTION_NOT_ALLOWED", "لا يمكن تسعير طلب مغلق.");
    }
    await expireDue(client, { orderId: order.id });
    const { rows: paid } = await client.query(
      `SELECT 1 FROM order_quotes WHERE order_id = $1 AND payment_status = 'paid' LIMIT 1`,
      [order.id],
    );
    if (paid[0]) throw cErr(409, "SMART_ORDER_QUOTE_PAID_LOCKED", "تم دفع عرض السعر؛ أي تغيير يتطلب معالجة يدوية معتمدة.");
    const { rows: live } = await client.query(
      `SELECT * FROM order_quotes WHERE order_id = $1 AND status IN ('issued', 'accepted') FOR UPDATE`,
      [order.id],
    );
    const { rows: v } = await client.query(`SELECT COALESCE(MAX(version), 0) + 1 AS next FROM order_quotes WHERE order_id = $1`, [order.id]);
    const version = Number(v[0].next);
    if (live[0]) {
      await client.query(
        `UPDATE order_quotes SET status = 'superseded', superseded_at = NOW(), guest_token_hash = NULL, updated_at = NOW() WHERE id = $1`,
        [live[0].id],
      );
      await event(client, {
        orderId: order.id,
        action: "quote_superseded",
        actorUserId,
        actorRole: staffRole(actorRole),
        detail: { quoteId: String(live[0].id), version: live[0].version, byVersion: version },
      });
      if (live[0].stripe_checkout_session_id) {
        const sid = live[0].stripe_checkout_session_id;
        after.push(async () => {
          const stripe = getStripe();
          if (stripe) await stripe.checkout.sessions.expire(sid).catch(() => {});
        });
      }
    }
    const { rows: snapRows } = await client.query(
      `SELECT service_code, service_version, definition->'name' AS name, quantity::text AS quantity, quantity_unit, quantity_unspecified
         FROM order_form_snapshots WHERE order_id = $1 LIMIT 1`,
      [order.id],
    );
    const s = snapRows[0];
    const snapshot = {
      orderCode: order.order_code,
      title: order.title,
      service: s
        ? { code: s.service_code, version: s.service_version, name: s.name || {}, quantity: s.quantity, unit: s.quantity_unit, unspecified: s.quantity_unspecified }
        : null,
    };
    const isGuest = order.customer_mode === "guest" && !order.customer_user_id;
    const token = isGuest ? crypto.randomBytes(32).toString("base64url") : null;
    const { rows } = await client.query(
      `INSERT INTO order_quotes
         (order_id, version, currency, base_amount, adjustments, total_amount, tax_treatment, terms_note, snapshot,
          expires_at, guest_token_hash, guest_token_expires_at, created_by_admin_id)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb, NOW() + make_interval(days => $10::int), $11::text,
               CASE WHEN $11::text IS NULL THEN NULL ELSE NOW() + make_interval(days => $10::int) END, $12)
       RETURNING *`,
      [
        order.id, version, q.currency, centsToText(q.baseCents), JSON.stringify(q.adjustments), centsToText(q.totalCents),
        q.taxTreatment, q.termsNote, JSON.stringify(snapshot), q.validDays, token ? sha256Hex(token) : null, Number(actorUserId),
      ],
    );
    const quote = rows[0];
    if (live[0]) await client.query(`UPDATE order_quotes SET superseded_by_quote_id = $2 WHERE id = $1`, [live[0].id, quote.id]);
    // Keep the S1 customer price in sync with the live quote.
    await client.query(
      `UPDATE orders SET customer_pricing_status = 'priced', customer_price_amount = $2, customer_price_currency = $3, updated_at = NOW() WHERE id = $1`,
      [order.id, centsToText(q.totalCents), q.currency],
    );
    await event(client, {
      orderId: order.id,
      action: "quote_issued",
      actorUserId,
      actorRole: staffRole(actorRole),
      detail: { quoteId: String(quote.id), version, total: centsToText(q.totalCents), currency: q.currency, guestLink: Boolean(token) },
    });
    if (order.customer_user_id) {
      await notify(
        client,
        {
          recipientUserId: Number(order.customer_user_id),
          recipientRole: "client",
          actorUserId: Number(actorUserId),
          type: "order.quote.issued",
          title: "عرض سعر جديد لطلبك",
          message: `تم إصدار عرض سعر لطلبك ${order.order_code}.`,
          entityType: "order",
          entityId: Number(order.id),
          link: `/dashboard/client/my-orders?orderId=${encodeURIComponent(String(order.id))}`,
          priority: "high",
          metadata: { orderId: String(order.id), quoteVersion: version },
        },
        `order_quote_issued_${order.id}_v${version}`,
      );
    }
    return { quoteId: String(quote.id), version, guestLink: token ? { url: guestQuoteUrl(token), expiresAt: quote.guest_token_expires_at } : null };
  });
  return res;
}

async function cancelQuote({ orderId, reason, actorUserId, actorRole }) {
  return withTx(async (client, after) => {
    const order = await loadCustomerOrderForUpdate(client, orderId);
    const { rows } = await client.query(
      `SELECT * FROM order_quotes WHERE order_id = $1 AND status IN ('issued', 'accepted') FOR UPDATE`,
      [order.id],
    );
    const q = rows[0];
    if (!q) throw cErr(409, "SMART_ORDER_ACTION_NOT_ALLOWED", "لا يوجد عرض سعر فعّال.");
    if (q.payment_status !== "unpaid") throw cErr(409, "SMART_ORDER_QUOTE_PAID_LOCKED", "تم دفع عرض السعر.");
    await client.query(
      `UPDATE order_quotes SET status = 'cancelled', cancelled_at = NOW(), guest_token_hash = NULL, updated_at = NOW() WHERE id = $1`,
      [q.id],
    );
    await event(client, {
      orderId: order.id,
      action: "quote_cancelled",
      actorUserId,
      actorRole: staffRole(actorRole),
      detail: { quoteId: String(q.id), version: q.version, reason: String(reason || "").slice(0, 300) || null },
    });
    if (q.stripe_checkout_session_id) {
      const sid = q.stripe_checkout_session_id;
      after.push(async () => {
        const stripe = getStripe();
        if (stripe) await stripe.checkout.sessions.expire(sid).catch(() => {});
      });
    }
    return { ok: true };
  });
}

/** New guest link for the live quote (previous link stops working). */
async function regenerateGuestLink({ orderId, actorUserId, actorRole }) {
  return withTx(async (client) => {
    const order = await loadCustomerOrderForUpdate(client, orderId);
    if (order.customer_mode !== "guest" || order.customer_user_id) {
      throw cErr(409, "SMART_ORDER_ACTION_NOT_ALLOWED", "رابط الدفع المستقل متاح لطلبات الضيوف فقط.");
    }
    await expireDue(client, { orderId: order.id });
    const { rows } = await client.query(
      `SELECT * FROM order_quotes WHERE order_id = $1 AND status IN ('issued', 'accepted') FOR UPDATE`,
      [order.id],
    );
    const q = rows[0];
    if (!q) throw cErr(409, "SMART_ORDER_ACTION_NOT_ALLOWED", "لا يوجد عرض سعر فعّال.");
    const token = crypto.randomBytes(32).toString("base64url");
    await client.query(
      `UPDATE order_quotes SET guest_token_hash = $2, guest_token_expires_at = expires_at, updated_at = NOW() WHERE id = $1`,
      [q.id, sha256Hex(token)],
    );
    await event(client, { orderId: order.id, action: "guest_link_created", actorUserId, actorRole: staffRole(actorRole), detail: { quoteId: String(q.id) } });
    return { url: guestQuoteUrl(token), expiresAt: q.expires_at };
  });
}

async function acceptQuoteInTx(client, q, { channel, userId = null, evidence = null, actorRole = null }) {
  if (q.status === "accepted") return false;
  if (q.status !== "issued") throw cErr(409, "SMART_ORDER_QUOTE_NOT_ACTIVE", "عرض السعر غير فعّال.");
  if (new Date(q.expires_at).getTime() <= Date.now()) throw cErr(409, "SMART_ORDER_QUOTE_NOT_ACTIVE", "انتهت صلاحية عرض السعر.");
  await client.query(
    `UPDATE order_quotes SET status = 'accepted', accepted_at = NOW(), accepted_channel = $2, accepted_by_user_id = $3,
            acceptance_evidence = $4, updated_at = NOW() WHERE id = $1`,
    [q.id, channel, userId, evidence],
  );
  await event(client, {
    orderId: q.order_id,
    action: "quote_accepted",
    actorUserId: userId,
    actorRole,
    detail: { quoteId: String(q.id), version: q.version, channel },
  });
  return true;
}

async function recordQuoteAcceptance({ orderId, evidence, actorUserId, actorRole }) {
  const ev = String(evidence || "").replace(/[<>]/g, "").trim().slice(0, 500);
  if (ev.length < 3) throw cErr(400, "SMART_ORDER_CONVERSION_EVIDENCE_REQUIRED", "سجّل كيف وافق العميل على عرض السعر.");
  return withTx(async (client) => {
    const order = await loadCustomerOrderForUpdate(client, orderId);
    await expireDue(client, { orderId: order.id });
    const { rows } = await client.query(
      `SELECT * FROM order_quotes WHERE order_id = $1 AND status IN ('issued', 'accepted') FOR UPDATE`,
      [order.id],
    );
    if (!rows[0]) throw cErr(409, "SMART_ORDER_QUOTE_NOT_ACTIVE", "لا يوجد عرض سعر فعّال.");
    await acceptQuoteInTx(client, rows[0], { channel: "admin_recorded", userId: Number(actorUserId), evidence: ev, actorRole: staffRole(actorRole) });
    return { ok: true };
  });
}

/** Linked (registered) customer accepts their live quote. */
async function customerAcceptQuote({ clientUserId, orderId, channel = "customer_web" }) {
  return withTx(async (client) => {
    const { rows: o } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [Number(orderId)]);
    const order = o[0];
    if (!order || Number(order.customer_user_id) !== Number(clientUserId) || order.source_type === "client_created") {
      throw cErr(404, "SMART_ORDER_NOT_FOUND", "الطلب غير موجود.");
    }
    await expireDue(client, { orderId: order.id });
    const { rows } = await client.query(
      `SELECT * FROM order_quotes WHERE order_id = $1 AND status IN ('issued', 'accepted') FOR UPDATE`,
      [order.id],
    );
    if (!rows[0]) throw cErr(409, "SMART_ORDER_QUOTE_NOT_ACTIVE", "لا يوجد عرض سعر فعّال.");
    await acceptQuoteInTx(client, rows[0], {
      channel: channel === "customer_app" ? "customer_app" : "customer_web",
      userId: Number(clientUserId),
      actorRole: "client",
    });
    return { ok: true };
  });
}

/** Customer-facing quote (no internal ids beyond what the customer already has; no freelancer pay). */
function mapCustomerQuote(q) {
  if (!q) return null;
  const expired = q.status === "expired" || ((q.status === "issued" || q.status === "accepted") && new Date(q.expires_at).getTime() <= Date.now() && q.payment_status === "unpaid");
  const status = expired ? "expired" : q.status;
  return {
    version: q.version,
    status,
    paymentStatus: q.payment_status === "paid_inactive" ? "paid" : q.payment_status,
    currency: q.currency,
    baseAmount: String(q.base_amount),
    adjustments: q.adjustments || [],
    totalAmount: String(q.total_amount),
    taxTreatment: q.tax_treatment,
    termsNote: q.terms_note || null,
    issuedAt: q.issued_at,
    expiresAt: q.expires_at,
    acceptedAt: q.accepted_at || null,
    paidAt: q.paid_at || null,
    service: q.snapshot?.service || null,
    orderCode: q.snapshot?.orderCode || null,
    canAccept: status === "issued",
    canPay: (status === "issued" || status === "accepted") && q.payment_status === "unpaid",
  };
}

/** Latest quote per order for customer list views (one batched query). */
async function loadCustomerQuotesMap(orderIds) {
  const ids = (orderIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return new Map();
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (order_id) * FROM order_quotes
      WHERE order_id = ANY($1::bigint[]) AND status <> 'superseded'
      ORDER BY order_id, version DESC`,
    [ids],
  );
  return new Map(rows.map((r) => [String(r.order_id), mapCustomerQuote(r)]));
}

// ---------------------------------------------------------------------------
// Guest quote page (token only — no account)
// ---------------------------------------------------------------------------

async function loadGuestQuote(client, token, { forUpdate = false } = {}) {
  if (!isWellFormedToken(token)) throw cErr(404, "SMART_ORDER_QUOTE_LINK_INVALID", "رابط عرض السعر غير صالح أو منتهي.");
  const { rows } = await client.query(
    `SELECT q.*, o.customer_mode, o.customer_user_id
       FROM order_quotes q JOIN orders o ON o.id = q.order_id
      WHERE q.guest_token_hash = $1 ${forUpdate ? "FOR UPDATE OF q" : ""}`,
    [sha256Hex(token)],
  );
  const q = rows[0];
  if (!q || (q.guest_token_expires_at && new Date(q.guest_token_expires_at).getTime() <= Date.now() && q.payment_status === "unpaid")) {
    throw cErr(404, "SMART_ORDER_QUOTE_LINK_INVALID", "رابط عرض السعر غير صالح أو منتهي.");
  }
  return q;
}

const GUEST_FUNNEL_EVENTS = new Set(["checkout_redirect_started", "checkout_cancel_returned", "checkout_success_returned"]);

async function guestQuoteView({ token, funnelEvent = null }) {
  const q = await loadGuestQuote(pool, token);
  if (funnelEvent && GUEST_FUNNEL_EVENTS.has(funnelEvent)) {
    try {
      const telemetry = require("./paymentCheckoutFunnelTelemetry");
      await telemetry.recordFunnelEvent({
        eventType: funnelEvent,
        paymentFlow: "guest_quote",
        channel: "web",
        stripeCheckoutSessionId: q.stripe_checkout_session_id || null,
        localRef: `gq:${q.id}`,
        actorUserId: null,
        allowAnonymous: true,
      });
    } catch {
      /* telemetry never blocks */
    }
  }
  return mapCustomerQuote(q);
}

// ---------------------------------------------------------------------------
// Stripe quote payment (reuses the hardened checkout conventions)
// ---------------------------------------------------------------------------

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).trim();
  if (!key) return null;
  const Stripe = require("stripe");
  return new Stripe(key);
}

/** Stripe accepts 30 min – 24 h; never let a session outlive the quote when avoidable. */
function sessionExpiry(quoteExpiresAt) {
  const now = Math.floor(Date.now() / 1000);
  const end = Math.min(Math.floor(new Date(quoteExpiresAt).getTime() / 1000), now + 23 * 3600);
  return end >= now + 31 * 60 ? { expires_at: end } : {};
}

async function readSessionState(stripe, sid) {
  try {
    const s = await stripe.checkout.sessions.retrieve(sid);
    if (s.payment_status === "paid") return { state: "paid", session: s };
    if (s.status === "open") return { state: "open", session: s };
    if (s.status === "expired") return { state: "expired", session: s };
    return { state: s.status === "complete" ? "processing" : "unknown", session: s };
  } catch (e) {
    if (e?.statusCode === 404 || e?.code === "resource_missing") return { state: "missing" };
    return { state: "unknown" };
  }
}

/**
 * Open (or resume) the Checkout Session for the LIVE quote. Amount is always derived on the server from
 * the quote row. Payer is a linked client (clientUserId) or a guest (guestToken).
 */
async function createQuoteCheckout({ orderId = null, clientUserId = null, guestToken = null, channel = "web", deps = {} }) {
  const stripe = deps.stripe || getStripe();
  if (!stripe) throw cErr(503, "SMART_ORDER_PAYMENT_UNAVAILABLE", "الدفع الإلكتروني غير متاح حاليًا.");
  let createdSid = null;
  const client = await pool.connect();
  let telemetry = null;
  try {
    await client.query("BEGIN");
    let q;
    if (guestToken) {
      q = await loadGuestQuote(client, guestToken, { forUpdate: true });
    } else {
      const { rows: o } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [Number(orderId)]);
      if (!o[0] || Number(o[0].customer_user_id) !== Number(clientUserId) || o[0].source_type === "client_created") {
        throw cErr(404, "SMART_ORDER_NOT_FOUND", "الطلب غير موجود.");
      }
      const { rows } = await client.query(
        `SELECT * FROM order_quotes WHERE order_id = $1 AND status IN ('issued', 'accepted') FOR UPDATE`,
        [o[0].id],
      );
      q = rows[0];
    }
    if (!q || !LIVE_QUOTE.includes(q.status) || new Date(q.expires_at).getTime() <= Date.now()) {
      throw cErr(409, "SMART_ORDER_QUOTE_NOT_ACTIVE", "عرض السعر غير فعّال أو منتهي الصلاحية.");
    }
    if (q.payment_status !== "unpaid") throw cErr(409, "SMART_ORDER_QUOTE_ALREADY_PAID", "تم دفع عرض السعر بالفعل.");

    if (q.stripe_checkout_session_id) {
      const cur = await readSessionState(stripe, q.stripe_checkout_session_id);
      if (cur.state === "open" && Number(cur.session.amount_total) === Number(q.stripe_expected_amount_minor)) {
        await client.query("COMMIT");
        return { checkoutUrl: cur.session.url, resumed: true };
      }
      if (cur.state === "paid" || cur.state === "processing") {
        throw cErr(409, "SMART_ORDER_PAYMENT_PROCESSING", "جارٍ تأكيد الدفع. حدّث الصفحة بعد قليل.");
      }
      if (cur.state === "unknown") throw cErr(503, "SMART_ORDER_PAYMENT_UNAVAILABLE", "تعذر التحقق من حالة الدفع حاليًا.");
      await client.query(
        `UPDATE client_order_payments SET status = 'expired' WHERE quote_id = $1 AND status = 'pending' AND provider_checkout_session_id = $2`,
        [q.id, q.stripe_checkout_session_id],
      );
    }

    const amountMinor = amountMajorToStripeMinor(Number(q.total_amount), q.currency);
    if (!amountMinor || amountMinor < 1) throw cErr(400, "SMART_ORDER_QUOTE_INVALID", "مبلغ عرض السعر غير صالح.");
    const { rows: n } = await client.query(`SELECT COUNT(*)::int AS n FROM client_order_payments WHERE quote_id = $1`, [q.id]);
    const metadata = {
      purpose: QUOTE_PAYMENT_PURPOSE,
      paymentContext: "order_quote",
      orderId: String(q.order_id),
      quoteId: String(q.id),
      quoteVersion: String(q.version),
      expectedAmountMinor: String(amountMinor),
      currency: q.currency,
      payer: guestToken ? "guest" : "client",
    };
    const success = guestToken
      ? guestQuoteUrl(guestToken, "success")
      : `${baseUrl()}/dashboard/client/my-orders?orderId=${encodeURIComponent(String(q.order_id))}&quotePayment=success`;
    const cancel = guestToken
      ? guestQuoteUrl(guestToken, "cancel")
      : `${baseUrl()}/dashboard/client/my-orders?orderId=${encodeURIComponent(String(q.order_id))}&quotePayment=cancel`;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: `quote:${q.id}`,
        metadata,
        payment_intent_data: { metadata, description: "FAZAAT - Orderz House - Order Quote Payment" },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: q.currency.toLowerCase(),
              unit_amount: amountMinor,
              product_data: { name: `Order ${q.snapshot?.orderCode || ""} — quote v${q.version}`.slice(0, 120) },
            },
          },
        ],
        success_url: success,
        cancel_url: cancel,
        ...sessionExpiry(q.expires_at),
      },
      { idempotencyKey: `order_quote:${q.id}:attempt:${Number(n[0].n) + 1}` },
    );
    createdSid = session.id;
    await client.query(
      `UPDATE order_quotes SET stripe_checkout_session_id = $2, stripe_expected_amount_minor = $3, updated_at = NOW() WHERE id = $1`,
      [q.id, session.id, amountMinor],
    );
    await client.query(
      `INSERT INTO client_order_payments (order_id, client_id, amount, payment_provider, provider_checkout_session_id, status, purpose, quote_id, currency)
       VALUES ($1, $2, $3, 'stripe', $4, 'pending', 'quote_payment', $5, $6)`,
      [q.order_id, clientUserId ? Number(clientUserId) : null, q.total_amount, session.id, q.id, q.currency],
    );
    await event(client, {
      orderId: q.order_id,
      action: "payment_checkout_created",
      actorUserId: clientUserId ? Number(clientUserId) : null,
      actorRole: clientUserId ? "client" : "guest",
      detail: { quoteId: String(q.id), version: q.version },
    });
    await client.query("COMMIT");
    createdSid = null;
    telemetry = { sessionId: session.id, quoteId: q.id };
    return { checkoutUrl: session.url, resumed: false };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    if (createdSid) await stripe.checkout.sessions.expire(createdSid).catch(() => {});
    throw e;
  } finally {
    client.release();
    if (telemetry) {
      try {
        const t = require("./paymentCheckoutFunnelTelemetry");
        for (const eventType of ["checkout_requested", "checkout_session_created"]) {
          // eslint-disable-next-line no-await-in-loop
          await t.recordFunnelEvent({
            eventType,
            paymentFlow: guestToken ? "guest_quote" : "client_quote",
            channel: channel === "mobile" ? "mobile" : "web",
            stripeCheckoutSessionId: telemetry.sessionId,
            localRef: `gq:${telemetry.quoteId}`,
            actorUserId: clientUserId ? Number(clientUserId) : null,
            allowAnonymous: true,
          });
        }
      } catch {
        /* telemetry */
      }
    }
  }
}

/**
 * Webhook truth: checkout.session.completed for purpose=order_quote_payment.
 * Exactly one financial outcome per quote; a payment for a no-longer-live quote is recorded as
 * `paid_inactive` (no automatic refund, never applied to the newer version).
 */
async function applyQuoteCheckoutCompleted(session, dbPool = pool) {
  const meta = session?.metadata || {};
  const quoteId = Number(meta.quoteId);
  if (!Number.isInteger(quoteId) || quoteId < 1) return { status: "ignored", reason: "quote_missing_id" };
  if (session.payment_status !== "paid") return { status: "ignored", reason: "quote_session_not_paid" };
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM order_quotes WHERE id = $1 FOR UPDATE`, [quoteId]);
    const q = rows[0];
    if (!q) {
      await client.query("ROLLBACK");
      return { status: "ignored", reason: "quote_not_found" };
    }
    const expectedMinor = amountMajorToStripeMinor(Number(q.total_amount), q.currency);
    const amountOk =
      Number(session.amount_total) === Number(expectedMinor) &&
      String(session.currency || "").toUpperCase() === q.currency &&
      Number(meta.quoteVersion) === Number(q.version);
    const { rows: pay } = await client.query(
      `UPDATE client_order_payments SET status = 'paid', paid_at = COALESCE(paid_at, NOW()), provider_payment_id = $2
        WHERE provider_checkout_session_id = $1 AND quote_id = $3 AND status <> 'paid'
        RETURNING id`,
      [String(session.id), session.payment_intent ? String(session.payment_intent) : null, q.id],
    );
    if (q.payment_status !== "unpaid") {
      await client.query("COMMIT");
      return { status: "already_applied", duplicate: true };
    }
    const live = LIVE_QUOTE.includes(q.status) || q.status === "expired";
    if (!live || !amountOk) {
      // Old / superseded / cancelled quote or mismatched amount: keep the money trail, never fulfil v2 with v1.
      await client.query(
        `UPDATE order_quotes SET payment_status = 'paid_inactive', paid_at = NOW(), paid_amount_minor = $2,
                stripe_payment_intent_id = $3, updated_at = NOW() WHERE id = $1`,
        [q.id, Number(session.amount_total) || null, session.payment_intent ? String(session.payment_intent) : null],
      );
      await event(client, {
        orderId: q.order_id,
        action: "payment_on_inactive_quote",
        detail: { quoteId: String(q.id), version: q.version, sessionId: String(session.id), amountOk },
      });
      const { rows: o } = await client.query(`SELECT account_manager_admin_id, order_code FROM orders WHERE id = $1`, [q.order_id]);
      if (o[0]?.account_manager_admin_id) {
        await notify(
          client,
          {
            recipientUserId: Number(o[0].account_manager_admin_id),
            recipientRole: "admin",
            actorUserId: null,
            type: "order.quote.payment_review",
            title: "دفعة تحتاج مراجعة",
            message: `وصلت دفعة لعرض سعر غير فعّال للطلب ${o[0].order_code}. راجعها يدويًا.`,
            entityType: "order",
            entityId: Number(q.order_id),
            link: `/dashboard/admin/orders?orderId=${encodeURIComponent(String(q.order_id))}`,
            priority: "high",
            metadata: { orderId: String(q.order_id), quoteId: String(q.id) },
          },
          `order_quote_paid_inactive_${q.id}`,
        );
      }
      await client.query("COMMIT");
      return { status: "applied", outcome: "paid_inactive" };
    }
    await client.query(
      `UPDATE order_quotes SET payment_status = 'paid', paid_at = NOW(), paid_amount_minor = $2, stripe_payment_intent_id = $3,
              status = CASE WHEN status = 'expired' THEN 'accepted' ELSE status END,
              accepted_at = COALESCE(accepted_at, NOW()), accepted_channel = COALESCE(accepted_channel, 'payment'),
              updated_at = NOW()
        WHERE id = $1`,
      [q.id, Number(session.amount_total), session.payment_intent ? String(session.payment_intent) : null],
    );
    await event(client, {
      orderId: q.order_id,
      action: "payment_confirmed",
      detail: { quoteId: String(q.id), version: q.version, sessionId: String(session.id), attemptRows: pay.length },
    });
    const { rows: o } = await client.query(`SELECT customer_user_id, account_manager_admin_id, order_code FROM orders WHERE id = $1`, [q.order_id]);
    for (const [uid, role] of [
      [o[0]?.customer_user_id, "client"],
      [o[0]?.account_manager_admin_id, "admin"],
    ]) {
      if (!uid) continue;
      // eslint-disable-next-line no-await-in-loop
      await notify(
        client,
        {
          recipientUserId: Number(uid),
          recipientRole: role,
          actorUserId: null,
          type: "order.quote.paid",
          title: "تم تأكيد الدفع",
          message: `تم تأكيد دفع الطلب ${o[0].order_code}.`,
          entityType: "order",
          entityId: Number(q.order_id),
          link: role === "client" ? `/dashboard/client/my-orders?orderId=${q.order_id}` : `/dashboard/admin/orders?orderId=${q.order_id}`,
          priority: "high",
          metadata: { orderId: String(q.order_id), quoteVersion: q.version },
        },
        `order_quote_paid_${q.id}_${role}`,
      );
    }
    await startWorkIfReady(client, q.order_id);
    await client.query("COMMIT");
    return { status: "applied", outcome: "paid" };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function applyQuoteCheckoutExpired(session, dbPool = pool) {
  const sid = session?.id ? String(session.id) : "";
  if (!sid) return { status: "ignored", reason: "quote_missing_session" };
  const { rows } = await dbPool.query(
    `UPDATE client_order_payments SET status = 'expired' WHERE provider_checkout_session_id = $1 AND purpose = 'quote_payment' AND status = 'pending' RETURNING id`,
    [sid],
  );
  return { status: "applied", duplicate: rows.length === 0 };
}

// ---------------------------------------------------------------------------
// Work authorization (explicit override, audited)
// ---------------------------------------------------------------------------

async function authorizeWork({ orderId, reason, actorUserId, actorRole }) {
  const r = String(reason || "").replace(/[<>]/g, "").trim().slice(0, 500);
  if (r.length < 5) throw cErr(400, "SMART_ORDER_REASON_REQUIRED", "اكتب سببًا واضحًا للتصريح.");
  return withTx(async (client) => {
    const order = await loadCustomerOrderForUpdate(client, orderId);
    await client.query(
      `INSERT INTO order_work_authorizations (order_id, reason, authorized_by_user_id, authorized_by_role) VALUES ($1, $2, $3, $4)`,
      [order.id, r, Number(actorUserId), staffRole(actorRole)],
    );
    await event(client, { orderId: order.id, action: "work_authorized", actorUserId, actorRole: staffRole(actorRole), detail: { reason: r } });
    const started = await startWorkIfReady(client, order.id, { actorUserId, actorRole: staffRole(actorRole) });
    return { ok: true, started };
  });
}

// ---------------------------------------------------------------------------
// Assignment offers
// ---------------------------------------------------------------------------

function parseOfferInput(input, order) {
  const errors = {};
  const fid = Number(input?.freelancerUserId);
  if (!Number.isInteger(fid) || fid < 1) errors.freelancerUserId = "invalid";
  const rawAmt = input?.compensationAmount === undefined || input?.compensationAmount === "" || input?.compensationAmount === null ? order.budget : input.compensationAmount;
  const cents = toCents(rawAmt);
  if (cents === null || cents <= 0) errors.compensationAmount = "invalid_amount";
  const hours = input?.deadlineHours === undefined || input?.deadlineHours === "" || input?.deadlineHours === null ? OFFER_HOURS.default : Number(input.deadlineHours);
  if (!Number.isInteger(hours) || hours < OFFER_HOURS.min || hours > OFFER_HOURS.max) errors.deadlineHours = "invalid";
  if (Object.keys(errors).length) throw cErr(400, "SMART_ORDER_OFFER_INVALID", "بيانات عرض الإسناد غير صالحة.", errors);
  return { freelancerUserId: fid, cents, hours };
}

async function createOfferInTransaction(client, { order, input, actorUserId, actorRole }) {
  const p = parseOfferInput(input, order);
  if (order.project_type !== "fixed") {
    // Agreed pay is orders.budget (fixed). Bidding-type orders keep their marketplace flow.
    throw cErr(400, "SMART_ORDER_OFFER_INVALID", "عرض الإسناد يتطلب طلبًا بسعر ثابت.", { projectType: "fixed_required" });
  }
  if (order.assigned_freelancer_id) throw cErr(409, "SMART_ORDER_ALREADY_ASSIGNED", "الطلب مُسند بالفعل.");
  if (["completed", "cancelled"].includes(order.order_status)) throw cErr(409, "SMART_ORDER_ACTION_NOT_ALLOWED", "لا يمكن إسناد طلب مغلق.");
  await expireDue(client, { orderId: order.id });
  const { rows: live } = await client.query(
    `SELECT id FROM order_assignment_offers WHERE order_id = $1 AND status IN ('pending', 'accepted') LIMIT 1`,
    [order.id],
  );
  if (live[0]) throw cErr(409, "SMART_ORDER_OFFER_EXISTS", "يوجد عرض إسناد قائم لهذا الطلب.");
  const ordersService = require("./ordersService");
  await ordersService.assertAssignableFreelancer({ freelancerUserId: p.freelancerUserId }, client);
  const { rows } = await client.query(
    `INSERT INTO order_assignment_offers (order_id, freelancer_user_id, compensation_amount, expires_at, offered_by_admin_id)
     VALUES ($1, $2, $3, NOW() + make_interval(hours => $4), $5) RETURNING *`,
    [order.id, p.freelancerUserId, centsToText(p.cents), p.hours, Number(actorUserId)],
  );
  const offer = rows[0];
  await event(client, {
    orderId: order.id,
    action: "offer_created",
    actorUserId,
    actorRole: staffRole(actorRole),
    detail: { offerId: String(offer.id), freelancerUserId: String(p.freelancerUserId), compensation: centsToText(p.cents), hours: p.hours },
  });
  await notify(
    client,
    {
      recipientUserId: p.freelancerUserId,
      recipientRole: "freelancer",
      actorUserId: Number(actorUserId),
      type: "order.assignment.offered",
      title: "عرض إسناد جديد",
      message: "لديك عرض إسناد جديد. راجع المتطلبات والأجر ثم اقبل أو ارفض قبل انتهاء المهلة.",
      entityType: "order",
      entityId: Number(order.id),
      link: "/dashboard/freelancer/assignment-offers",
      priority: "high",
      metadata: { orderId: String(order.id), offerId: String(offer.id) },
    },
    `order_assignment_offer_${offer.id}`,
  );
  return offer;
}

async function createOffer({ orderId, input, actorUserId, actorRole }) {
  return withTx(async (client) => {
    const order = await loadCustomerOrderForUpdate(client, orderId);
    const offer = await createOfferInTransaction(client, { order, input, actorUserId, actorRole });
    return { offerId: String(offer.id), expiresAt: offer.expires_at };
  });
}

async function cancelOffer({ orderId, reason, actorUserId, actorRole }) {
  return withTx(async (client) => {
    const order = await loadCustomerOrderForUpdate(client, orderId);
    await expireDue(client, { orderId: order.id });
    const { rows } = await client.query(
      `UPDATE order_assignment_offers SET status = 'cancelled', cancelled_by_admin_id = $2, cancel_reason = $3, updated_at = NOW()
        WHERE order_id = $1 AND status = 'pending' RETURNING id, freelancer_user_id`,
      [order.id, Number(actorUserId), String(reason || "").slice(0, 500) || null],
    );
    if (!rows[0]) throw cErr(409, "SMART_ORDER_ACTION_NOT_ALLOWED", "لا يوجد عرض إسناد بانتظار الرد.");
    await event(client, {
      orderId: order.id,
      action: "offer_cancelled",
      actorUserId,
      actorRole: staffRole(actorRole),
      detail: { offerId: String(rows[0].id), freelancerUserId: String(rows[0].freelancer_user_id) },
    });
    return { ok: true };
  });
}

/** Freelancer-facing offer view: task + pay + deadline only (no customer identity/contact). */
function mapFreelancerOffer(r) {
  const svc = r.form_snapshot || null;
  return {
    id: String(r.id),
    orderId: String(r.order_id),
    orderCode: r.order_code,
    title: r.title,
    description: r.description,
    status: r.status,
    compensationAmount: String(r.compensation_amount),
    currency: r.currency,
    durationValue: r.duration_value,
    durationUnit: r.duration_unit,
    expiresAt: r.expires_at,
    respondedAt: r.responded_at || null,
    createdAt: r.created_at,
    service: svc
      ? {
          serviceCode: svc.service_code,
          version: svc.service_version,
          name: svc.definition?.name || {},
          quantity: { unit: svc.quantity_unit, value: svc.quantity != null ? String(svc.quantity) : null, unspecified: Boolean(svc.quantity_unspecified) },
          fields: svc.definition?.fields || [],
          values: svc.field_values || {},
        }
      : null,
    terms: r.terms_amount ? { compensationAmount: String(r.terms_amount), currency: "JOD", termsVersion: r.terms_version, acceptedAt: r.terms_accepted_at, dueAt: r.terms_due_at } : null,
    pendingChange: r.change_id
      ? { id: String(r.change_id), oldAmount: String(r.change_old), newAmount: String(r.change_new), newDueAt: r.change_due || null, reason: r.change_reason }
      : null,
  };
}

async function listFreelancerOffers({ freelancerUserId }) {
  await withTx((client) => expireDue(client, { freelancerUserId }));
  const { rows } = await pool.query(
    `SELECT f.*, o.order_code, o.title, o.description, o.duration_value, o.duration_unit,
            (SELECT row_to_json(s) FROM (SELECT service_code, service_version, definition, field_values, quantity::text AS quantity,
                    quantity_unit, quantity_unspecified FROM order_form_snapshots WHERE order_id = o.id LIMIT 1) s) AS form_snapshot,
            t.compensation_amount AS terms_amount, t.terms_version, t.accepted_at AS terms_accepted_at, t.due_at AS terms_due_at,
            c.id AS change_id, c.old_amount AS change_old, c.new_amount AS change_new, c.new_due_at AS change_due, c.reason AS change_reason
       FROM order_assignment_offers f
       JOIN orders o ON o.id = f.order_id
       LEFT JOIN LATERAL (SELECT * FROM order_financial_terms x WHERE x.offer_id = f.id ORDER BY terms_version DESC LIMIT 1) t ON TRUE
       LEFT JOIN order_commercial_changes c ON c.offer_id = f.id AND c.status = 'pending_freelancer'
      WHERE f.freelancer_user_id = $1
      ORDER BY (f.status = 'pending') DESC, f.created_at DESC
      LIMIT 100`,
    [Number(freelancerUserId)],
  );
  return rows.map(mapFreelancerOffer);
}

async function lockOfferForFreelancer(client, { offerId, freelancerUserId }) {
  const { rows: pre } = await client.query(`SELECT order_id FROM order_assignment_offers WHERE id = $1`, [Number(offerId)]);
  if (!pre[0]) throw cErr(404, "SMART_ORDER_OFFER_NOT_FOUND", "عرض الإسناد غير موجود.");
  // Lock order first, then the offer (same order as Admin operations → no deadlocks).
  const { rows: o } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [pre[0].order_id]);
  const { rows } = await client.query(`SELECT * FROM order_assignment_offers WHERE id = $1 FOR UPDATE`, [Number(offerId)]);
  const offer = rows[0];
  if (!offer || Number(offer.freelancer_user_id) !== Number(freelancerUserId)) {
    throw cErr(404, "SMART_ORDER_OFFER_NOT_FOUND", "عرض الإسناد غير موجود.");
  }
  return { order: o[0], offer };
}

async function acceptOffer({ freelancerUserId, offerId }) {
  return withTx(async (client) => {
    const { order, offer } = await lockOfferForFreelancer(client, { offerId, freelancerUserId });
    if (offer.status === "pending" && new Date(offer.expires_at).getTime() <= Date.now()) {
      await client.query(`UPDATE order_assignment_offers SET status = 'expired', updated_at = NOW() WHERE id = $1`, [offer.id]);
      await event(client, { orderId: order.id, action: "offer_expired", detail: { offerId: String(offer.id) } });
      throw cErr(409, "SMART_ORDER_OFFER_EXPIRED", "انتهت مهلة قبول عرض الإسناد.");
    }
    if (offer.status !== "pending") throw cErr(409, "SMART_ORDER_OFFER_NOT_PENDING", "لم يعد عرض الإسناد متاحًا.");
    if (order.assigned_freelancer_id || ["completed", "cancelled"].includes(order.order_status)) {
      throw cErr(409, "SMART_ORDER_OFFER_NOT_PENDING", "لم يعد عرض الإسناد متاحًا.");
    }
    const now = new Date();
    const ready = await isFinanciallyReady(client, order);
    const dueAt = computeDueAt(now, order.duration_value, order.duration_unit);
    const { rows: q } = await client.query(
      `SELECT id, version FROM order_quotes WHERE order_id = $1 AND status IN ('issued', 'accepted') ORDER BY version DESC LIMIT 1`,
      [order.id],
    );
    await client.query(`UPDATE order_assignment_offers SET status = 'accepted', responded_at = NOW(), updated_at = NOW() WHERE id = $1`, [offer.id]);
    const { rows: tv } = await client.query(`SELECT COALESCE(MAX(terms_version), 0) + 1 AS v FROM order_financial_terms WHERE order_id = $1`, [order.id]);
    await client.query(
      `INSERT INTO order_financial_terms
         (order_id, offer_id, freelancer_user_id, terms_version, source, compensation_amount, currency, due_at, quote_id, quote_version, accepted_at)
       VALUES ($1,$2,$3,$4,'offer_acceptance',$5,'JOD',$6,$7,$8,NOW())`,
      [order.id, offer.id, offer.freelancer_user_id, Number(tv[0].v), offer.compensation_amount, dueAt, q[0]?.id || null, q[0]?.version || null],
    );
    // Canonical assignment (same fields as direct Admin assignment); freelancer pay = agreed compensation.
    await client.query(
      `UPDATE orders
          SET assigned_freelancer_id = $2, is_direct_admin_assignment = TRUE, budget = $3,
              received_at = $4::timestamptz, started_at = CASE WHEN $5::boolean THEN $4::timestamptz ELSE NULL END,
              due_at = CASE WHEN $5::boolean THEN $6::timestamptz ELSE NULL END,
              order_status = CASE WHEN $5::boolean THEN 'in_progress' ELSE 'assigned' END,
              is_published = FALSE, is_open_for_pool = FALSE, is_archived = FALSE, updated_at = NOW()
        WHERE id = $1`,
      [order.id, offer.freelancer_user_id, offer.compensation_amount, now, ready, dueAt],
    );
    const { rows: fresh } = await client.query(`SELECT * FROM orders WHERE id = $1`, [order.id]);
    {
      // Same work-history / membership side effects as direct Admin assignment (first real accepted order policy).
      const fairDist = require("./marketplaceFairDistributionService");
      await fairDist.recordAwarded({ client, order: fresh[0], freelancerUserId: Number(offer.freelancer_user_id), reason: "direct_admin_assignment", actorRole: "freelancer", actorUserId: Number(freelancerUserId) });
      await fairDist.recordEffectiveAssignment({ client, order: fresh[0], freelancerUserId: Number(offer.freelancer_user_id), reason: "direct_admin_assignment", actorRole: "freelancer", actorUserId: Number(freelancerUserId) });
    }
    await event(client, { orderId: order.id, action: "offer_accepted", actorUserId: freelancerUserId, actorRole: "freelancer", detail: { offerId: String(offer.id) } });
    await event(client, {
      orderId: order.id,
      action: "terms_snapshot",
      actorUserId: freelancerUserId,
      actorRole: "freelancer",
      detail: { offerId: String(offer.id), compensation: String(offer.compensation_amount), termsVersion: Number(tv[0].v) },
    });
    if (ready) await event(client, { orderId: order.id, action: "work_started", actorUserId: freelancerUserId, actorRole: "freelancer", detail: {} });
    if (order.account_manager_admin_id) {
      await notify(
        client,
        {
          recipientUserId: Number(order.account_manager_admin_id),
          recipientRole: "admin",
          actorUserId: Number(freelancerUserId),
          type: "order.assignment.accepted",
          title: "قبل المستقل عرض الإسناد",
          message: `قبل المستقل تنفيذ الطلب ${order.order_code}.`,
          entityType: "order",
          entityId: Number(order.id),
          link: `/dashboard/admin/orders?orderId=${order.id}`,
          priority: "medium",
          metadata: { orderId: String(order.id), offerId: String(offer.id) },
        },
        `order_assignment_accepted_${offer.id}`,
      );
    }
    return { ok: true, workStarted: ready, orderId: String(order.id) };
  });
}

async function rejectOffer({ freelancerUserId, offerId, reasonCode }) {
  const reason = REJECTION_REASONS.includes(reasonCode) ? reasonCode : "other";
  return withTx(async (client) => {
    const { order, offer } = await lockOfferForFreelancer(client, { offerId, freelancerUserId });
    if (offer.status !== "pending" || new Date(offer.expires_at).getTime() <= Date.now()) {
      throw cErr(409, "SMART_ORDER_OFFER_NOT_PENDING", "لم يعد عرض الإسناد متاحًا.");
    }
    await client.query(
      `UPDATE order_assignment_offers SET status = 'rejected', responded_at = NOW(), rejection_reason_code = $2, updated_at = NOW() WHERE id = $1`,
      [offer.id, reason],
    );
    await event(client, { orderId: order.id, action: "offer_rejected", actorUserId: freelancerUserId, actorRole: "freelancer", detail: { offerId: String(offer.id), reason } });
    if (order.account_manager_admin_id) {
      await notify(
        client,
        {
          recipientUserId: Number(order.account_manager_admin_id),
          recipientRole: "admin",
          actorUserId: Number(freelancerUserId),
          type: "order.assignment.rejected",
          title: "رفض المستقل عرض الإسناد",
          message: `رفض المستقل عرض الإسناد للطلب ${order.order_code}؛ يمكنك إسناده لمستقل آخر.`,
          entityType: "order",
          entityId: Number(order.id),
          link: `/dashboard/admin/orders?orderId=${order.id}`,
          priority: "high",
          metadata: { orderId: String(order.id), offerId: String(offer.id), reason },
        },
        `order_assignment_rejected_${offer.id}`,
      );
    }
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Compensation change requests (no silent reduction)
// ---------------------------------------------------------------------------

async function currentTerms(client, orderId) {
  const { rows } = await client.query(
    `SELECT * FROM order_financial_terms WHERE order_id = $1 ORDER BY terms_version DESC LIMIT 1`,
    [Number(orderId)],
  );
  return rows[0] || null;
}

async function applyTermsChange(client, { order, terms, change, actorUserId }) {
  await client.query(
    `INSERT INTO order_financial_terms
       (order_id, offer_id, freelancer_user_id, terms_version, source, compensation_amount, currency, due_at, quote_id, quote_version, change_request_id)
     VALUES ($1,$2,$3,$4,'change_request',$5,'JOD',$6,$7,$8,$9)`,
    [order.id, terms.offer_id, terms.freelancer_user_id, terms.terms_version + 1, change.new_amount, change.new_due_at || terms.due_at, terms.quote_id, terms.quote_version, change.id],
  );
  await client.query(
    `UPDATE orders SET budget = $2, due_at = CASE WHEN $3::timestamptz IS NOT NULL AND order_status = 'in_progress' THEN $3::timestamptz ELSE due_at END, updated_at = NOW() WHERE id = $1`,
    [order.id, change.new_amount, change.new_due_at || null],
  );
  await event(client, {
    orderId: order.id,
    action: "terms_snapshot",
    actorUserId,
    detail: { changeId: String(change.id), compensation: String(change.new_amount), termsVersion: terms.terms_version + 1 },
  });
}

/**
 * Admin proposes new freelancer pay / deadline after acceptance. Increases apply immediately (audited);
 * reductions (or deadline-only changes) need the freelancer's explicit approval.
 */
async function requestCompensationChange({ orderId, newAmount, newDueAt = null, reason, actorUserId, actorRole }) {
  const cents = toCents(newAmount);
  const r = String(reason || "").replace(/[<>]/g, "").trim().slice(0, 500);
  const due = newDueAt ? new Date(newDueAt) : null;
  const errors = {};
  if (cents === null || cents <= 0) errors.newAmount = "invalid_amount";
  if (r.length < 5) errors.reason = "required";
  if (due && (Number.isNaN(due.getTime()) || due.getTime() <= Date.now())) errors.newDueAt = "invalid_date";
  if (Object.keys(errors).length) throw cErr(400, "SMART_ORDER_CHANGE_INVALID", "بيانات طلب التعديل غير صالحة.", errors);
  return withTx(async (client) => {
    const order = await loadCustomerOrderForUpdate(client, orderId);
    const terms = await currentTerms(client, order.id);
    if (!terms) throw cErr(409, "SMART_ORDER_NO_TERMS", "لا توجد شروط متفق عليها بعد لهذا الطلب.");
    const oldCents = toCents(String(terms.compensation_amount));
    const { rows } = await client.query(
      `INSERT INTO order_commercial_changes (order_id, offer_id, old_amount, new_amount, old_due_at, new_due_at, reason, status, requested_by_admin_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [order.id, terms.offer_id, terms.compensation_amount, centsToText(cents), terms.due_at, due, r, cents > oldCents && !due ? "applied" : "pending_freelancer", Number(actorUserId)],
    );
    const change = rows[0];
    await event(client, {
      orderId: order.id,
      action: change.status === "applied" ? "change_applied" : "change_requested",
      actorUserId,
      actorRole: staffRole(actorRole),
      detail: { changeId: String(change.id), old: String(terms.compensation_amount), new: centsToText(cents) },
    });
    if (change.status === "applied") {
      await applyTermsChange(client, { order, terms, change, actorUserId });
    } else {
      await notify(
        client,
        {
          recipientUserId: Number(terms.freelancer_user_id),
          recipientRole: "freelancer",
          actorUserId: Number(actorUserId),
          type: "order.terms.change_requested",
          title: "طلب تعديل على الشروط",
          message: "طلبت الإدارة تعديل الأجر أو الموعد. الشروط الحالية سارية حتى توافق.",
          entityType: "order",
          entityId: Number(order.id),
          link: "/dashboard/freelancer/assignment-offers",
          priority: "high",
          metadata: { orderId: String(order.id), changeId: String(change.id) },
        },
        `order_terms_change_${change.id}`,
      );
    }
    return { changeId: String(change.id), status: change.status };
  });
}

async function respondToChange({ freelancerUserId, changeId, approve }) {
  return withTx(async (client) => {
    const { rows: pre } = await client.query(`SELECT order_id FROM order_commercial_changes WHERE id = $1`, [Number(changeId)]);
    if (!pre[0]) throw cErr(404, "SMART_ORDER_CHANGE_NOT_FOUND", "طلب التعديل غير موجود.");
    const { rows: o } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [pre[0].order_id]);
    const { rows } = await client.query(`SELECT * FROM order_commercial_changes WHERE id = $1 FOR UPDATE`, [Number(changeId)]);
    const change = rows[0];
    const terms = await currentTerms(client, change.order_id);
    if (!terms || Number(terms.freelancer_user_id) !== Number(freelancerUserId)) throw cErr(404, "SMART_ORDER_CHANGE_NOT_FOUND", "طلب التعديل غير موجود.");
    if (change.status !== "pending_freelancer") throw cErr(409, "SMART_ORDER_ACTION_NOT_ALLOWED", "تمت معالجة طلب التعديل بالفعل.");
    await client.query(
      `UPDATE order_commercial_changes SET status = $2, decided_by_user_id = $3, decided_at = NOW() WHERE id = $1`,
      [change.id, approve ? "approved" : "rejected", Number(freelancerUserId)],
    );
    await event(client, {
      orderId: change.order_id,
      action: approve ? "change_approved" : "change_rejected",
      actorUserId: freelancerUserId,
      actorRole: "freelancer",
      detail: { changeId: String(change.id) },
    });
    if (approve) await applyTermsChange(client, { order: o[0], terms, change, actorUserId: freelancerUserId });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Admin read model (batched — one round trip per table)
// ---------------------------------------------------------------------------

async function getAdminCommercial(orderId) {
  await withTx((client) => expireDue(client, { orderId }));
  const oid = Number(orderId);
  const [{ rows: o }, { rows: quotes }, { rows: offers }, { rows: terms }, { rows: changes }, { rows: auths }, { rows: events }] = await Promise.all([
    pool.query(`SELECT id, order_code, source_type, customer_mode, customer_user_id, order_status, assigned_freelancer_id, budget, duration_value, duration_unit FROM orders WHERE id = $1`, [oid]),
    pool.query(`SELECT * FROM order_quotes WHERE order_id = $1 ORDER BY version DESC`, [oid]),
    pool.query(
      `SELECT f.*, u.first_name, u.family_name, u.account_id FROM order_assignment_offers f JOIN users u ON u.id = f.freelancer_user_id
        WHERE f.order_id = $1 ORDER BY f.created_at DESC`,
      [oid],
    ),
    pool.query(`SELECT * FROM order_financial_terms WHERE order_id = $1 ORDER BY terms_version DESC`, [oid]),
    pool.query(`SELECT * FROM order_commercial_changes WHERE order_id = $1 ORDER BY created_at DESC`, [oid]),
    pool.query(
      `SELECT a.*, u.first_name, u.family_name FROM order_work_authorizations a JOIN users u ON u.id = a.authorized_by_user_id WHERE a.order_id = $1 ORDER BY a.created_at DESC`,
      [oid],
    ),
    pool.query(`SELECT action, actor_role, detail, created_at FROM order_commercial_events WHERE order_id = $1 ORDER BY id DESC LIMIT 60`, [oid]),
  ]);
  const order = o[0];
  if (!order || !["admin_created", "super_admin_created"].includes(order.source_type)) throw cErr(404, "SMART_ORDER_NOT_FOUND", "الطلب غير موجود.");
  const paid = quotes.some((q) => q.payment_status === "paid");
  return {
    orderId: String(order.id),
    orderCode: order.order_code,
    applicable: Boolean(order.customer_mode),
    customerMode: order.customer_mode,
    orderStatus: order.order_status,
    freelancerBudget: order.budget != null ? String(order.budget) : null,
    readiness: { paid, authorized: auths.length > 0, ready: !order.customer_mode || paid || auths.length > 0 },
    quotes: quotes.map((q) => ({
      id: String(q.id),
      version: q.version,
      status: q.status,
      paymentStatus: q.payment_status,
      currency: q.currency,
      baseAmount: String(q.base_amount),
      adjustments: q.adjustments || [],
      totalAmount: String(q.total_amount),
      taxTreatment: q.tax_treatment,
      termsNote: q.terms_note,
      issuedAt: q.issued_at,
      expiresAt: q.expires_at,
      acceptedAt: q.accepted_at,
      acceptedChannel: q.accepted_channel,
      paidAt: q.paid_at,
      hasGuestLink: Boolean(q.guest_token_hash),
      supersededAt: q.superseded_at,
      cancelledAt: q.cancelled_at,
    })),
    offers: offers.map((f) => ({
      id: String(f.id),
      status: f.status,
      freelancer: { id: String(f.freelancer_user_id), name: [f.first_name, f.family_name].filter(Boolean).join(" "), accountId: f.account_id },
      compensationAmount: String(f.compensation_amount),
      expiresAt: f.expires_at,
      respondedAt: f.responded_at,
      rejectionReasonCode: f.rejection_reason_code,
      createdAt: f.created_at,
    })),
    terms: terms.map((t) => ({
      termsVersion: t.terms_version,
      source: t.source,
      compensationAmount: String(t.compensation_amount),
      currency: t.currency,
      basis: t.compensation_basis,
      dueAt: t.due_at,
      quoteVersion: t.quote_version,
      acceptedAt: t.accepted_at,
    })),
    changes: changes.map((c) => ({
      id: String(c.id),
      status: c.status,
      oldAmount: String(c.old_amount),
      newAmount: String(c.new_amount),
      newDueAt: c.new_due_at,
      reason: c.reason,
      createdAt: c.created_at,
      decidedAt: c.decided_at,
    })),
    authorizations: auths.map((a) => ({
      reason: a.reason,
      by: [a.first_name, a.family_name].filter(Boolean).join(" "),
      role: a.authorized_by_role,
      createdAt: a.created_at,
    })),
    events: events.map((e) => ({ action: e.action, actorRole: e.actor_role, detail: e.detail, createdAt: e.created_at })),
  };
}

/** Start-work gate used by the delivery path (backend enforcement, not UI hiding). */
async function assertWorkAllowed(client, order) {
  if (!order.customer_mode) return;
  if (order.order_status === "assigned") {
    throw cErr(409, "SMART_ORDER_WORK_NOT_AUTHORIZED", "لا يمكن بدء التنفيذ قبل تأكيد الدفع أو تصريح الإدارة.");
  }
  const { rows } = await client.query(
    `SELECT status FROM order_assignment_offers WHERE order_id = $1 AND freelancer_user_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [order.id, order.assigned_freelancer_id],
  );
  if (rows[0] && rows[0].status !== "accepted") {
    throw cErr(409, "SMART_ORDER_WORK_NOT_AUTHORIZED", "لم يتم قبول الإسناد بعد.");
  }
}

module.exports = {
  QUOTE_PAYMENT_PURPOSE,
  REJECTION_REASONS,
  toCents,
  centsToText,
  parseQuoteInput,
  issueQuote,
  cancelQuote,
  regenerateGuestLink,
  recordQuoteAcceptance,
  customerAcceptQuote,
  mapCustomerQuote,
  loadCustomerQuotesMap,
  guestQuoteView,
  createQuoteCheckout,
  applyQuoteCheckoutCompleted,
  applyQuoteCheckoutExpired,
  authorizeWork,
  createOfferInTransaction,
  createOffer,
  cancelOffer,
  listFreelancerOffers,
  acceptOffer,
  rejectOffer,
  requestCompensationChange,
  respondToChange,
  getAdminCommercial,
  isFinanciallyReady,
  startWorkIfReady,
  assertWorkAllowed,
  expireDue,
};
