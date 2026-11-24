/**
 * Smart Orders S1 — customer linkage for Admin-created orders (Path D).
 *
 * Modes (explicit Admin choice, never inferred from a phone number):
 *   existing     verified client account selected by the Admin → orders.customer_user_id.
 *   new_account  no account yet. A one-time claim link (sha256-hashed, short TTL) is generated; the
 *                customer opens it, signs in / registers through the EXISTING email-verified auth,
 *                and the SAME order gets customer_user_id. No users row, password or OTP is created here.
 *   guest        NO users row, ever. A minimal guest_contacts row is linked. Converting to an account
 *                later requires an explicit, audited Admin action + the same one-time claim flow.
 *   (absent)     legacy internal Admin order (Path A) — unchanged behaviour.
 *
 * Privacy: freelancer APIs never read these columns (mapOrderBase has no customer fields). Guest
 * phone numbers are masked in Admin reads; revealing the full number is an audited action.
 */

const crypto = require("crypto");
const { pool } = require("../config/db");
const { createPublicApiError } = require("../utils/publicApiError");
const { getPrimaryClientUrl } = require("../config/clientUrl");

const CUSTOMER_MODES = Object.freeze(["existing", "new_account", "guest"]);
/** Every value the orders.order_channel CHECK accepts. */
const ORDER_CHANNELS = Object.freeze(["whatsapp", "admin", "app", "web", "phone", "email", "other"]);
/** Channels an Admin may record when creating a customer order. */
const ADMIN_ORDER_CHANNELS = Object.freeze(["whatsapp", "admin", "phone", "email", "other"]);
const GUEST_CONTACT_CHANNELS = Object.freeze(["whatsapp", "phone", "email", "other"]);
const GUEST_CONSENT_STATUSES = Object.freeze(["customer_initiated", "verbal", "written"]);
const PRICE_CURRENCIES = Object.freeze(["JOD", "AED"]);
const INVITATION_TTL_HOURS = Object.freeze({ new_account: 72, guest_conversion: 48 });
/** Retention metadata only (policy gate: no automatic redaction job in S1). */
const GUEST_RETENTION_DAYS = 365;
const MAX_PRICE = 1000000;
const MAX_REFERENCE_NAME = 120;
const MAX_NOTE = 500;
const MAX_EVIDENCE = 500;
const CUSTOMER_SEARCH_LIMIT = 10;

const ERROR_CODES = Object.freeze({
  INVALID: "SMART_ORDER_CUSTOMER_INVALID",
  MODE_REQUIRED: "SMART_ORDER_CUSTOMER_MODE_REQUIRED",
  CUSTOMER_NOT_ELIGIBLE: "SMART_ORDER_CUSTOMER_NOT_ELIGIBLE",
  PHONE_INVALID: "SMART_ORDER_PHONE_INVALID",
  ACCOUNT_MANAGER_INVALID: "SMART_ORDER_ACCOUNT_MANAGER_INVALID",
  PRICE_INVALID: "SMART_ORDER_PRICE_INVALID",
  NOT_FOUND: "SMART_ORDER_NOT_FOUND",
  ACTION_NOT_ALLOWED: "SMART_ORDER_ACTION_NOT_ALLOWED",
  EVIDENCE_REQUIRED: "SMART_ORDER_CONVERSION_EVIDENCE_REQUIRED",
  CLAIM_INVALID: "SMART_ORDER_CLAIM_INVALID",
  CLAIM_ROLE: "SMART_ORDER_CLAIM_CLIENT_ONLY",
  CLAIM_ALREADY_LINKED: "SMART_ORDER_CLAIM_ALREADY_LINKED",
  MANAGED_BY_TEAM: "SMART_ORDER_MANAGED_BY_TEAM",
});

function customerError(statusCode, code, messageAr, meta) {
  const err = createPublicApiError(messageAr, statusCode, code);
  if (meta) err.meta = meta;
  return err;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

function toAsciiDigits(s) {
  return String(s ?? "").replace(/[٠-٩۰-۹]/g, (ch) => {
    const i = ARABIC_INDIC.indexOf(ch);
    return String(i >= 0 ? i : EASTERN_ARABIC_INDIC.indexOf(ch));
  });
}

/** Returns "+<8..15 digits>" or null. Accepts "+", "00" prefixes, spaces, dashes, parentheses. */
function normalizePhoneE164(raw) {
  let s = toAsciiDigits(raw).trim();
  if (!s) return null;
  s = s.replace(/[\s\-().‎‏‪-‮]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (!/^\+[1-9][0-9]{7,14}$/.test(s)) return null;
  return s;
}

function cleanText(raw, max) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function maskPhone(e164) {
  const s = String(e164 || "");
  if (s.length < 6) return s ? "••••" : null;
  return `${s.slice(0, 4)}${"•".repeat(Math.max(2, s.length - 6))}${s.slice(-2)}`;
}

function maskEmail(email) {
  const s = String(email || "");
  const at = s.indexOf("@");
  if (at < 1) return s ? "••••" : null;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  return `${local.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}

function fullName(row, prefix = "") {
  if (!row) return null;
  const n = [row[`${prefix}first_name`], row[`${prefix}father_name`], row[`${prefix}family_name`]]
    .filter(Boolean)
    .join(" ")
    .trim();
  return n || null;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function generateClaimToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/** Claim tokens are base64url, 43 chars. Anything else is rejected before hitting the database. */
function isWellFormedClaimToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

function buildClaimUrl(token) {
  const base = String(getPrimaryClientUrl() || "https://orderzhouse.com").replace(/\/+$/, "");
  // Fragment, not query: the token never reaches server/proxy access logs.
  return `${base}/claim-order#t=${token}`;
}

function parsePrice(rawAmount, rawCurrency) {
  if (rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === "") {
    return { status: "pending_pricing", amount: null, currency: null };
  }
  const text = toAsciiDigits(rawAmount).trim().replace(/,/g, ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) {
    throw customerError(400, ERROR_CODES.PRICE_INVALID, "سعر العميل غير صالح.");
  }
  const amount = Number(text);
  if (!(amount > 0) || amount > MAX_PRICE) {
    throw customerError(400, ERROR_CODES.PRICE_INVALID, "سعر العميل غير صالح.");
  }
  const currency = String(rawCurrency || "").trim().toUpperCase();
  if (!PRICE_CURRENCIES.includes(currency)) {
    throw customerError(400, ERROR_CODES.PRICE_INVALID, "عملة سعر العميل غير مدعومة.");
  }
  // Keep the exact decimal text (2 dp) — no float arithmetic on money.
  const [i, f = ""] = text.split(".");
  return { status: "priced", amount: `${i}.${(f + "00").slice(0, 2)}`, currency };
}

function parseIdOrNull(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

/**
 * Validate the `customer` block sent with POST /api/admin/orders.
 * Returns null when no customer block was sent (legacy internal order).
 */
function parseCustomerInput(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      throw customerError(400, ERROR_CODES.INVALID, "بيانات العميل غير صالحة.");
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw customerError(400, ERROR_CODES.INVALID, "بيانات العميل غير صالحة.");
  }
  const mode = String(obj.mode || "").trim();
  if (mode === "internal" || mode === "none") return null;
  if (!CUSTOMER_MODES.includes(mode)) {
    throw customerError(400, ERROR_CODES.MODE_REQUIRED, "اختر نوع ارتباط العميل بالطلب.");
  }

  const channel = String(obj.channel || "whatsapp").trim();
  if (!ADMIN_ORDER_CHANNELS.includes(channel)) {
    throw customerError(400, ERROR_CODES.INVALID, "قناة الطلب غير صالحة.", { field: "channel" });
  }
  const accountManagerAdminId = parseIdOrNull(obj.accountManagerAdminId);
  if (Number.isNaN(accountManagerAdminId)) {
    throw customerError(400, ERROR_CODES.ACCOUNT_MANAGER_INVALID, "المسؤول عن المتابعة غير صالح.");
  }
  const pricing = parsePrice(obj.priceAmount, obj.priceCurrency);

  const out = { mode, channel, accountManagerAdminId, pricing };

  if (mode === "existing") {
    const id = parseIdOrNull(obj.customerUserId);
    if (!id || Number.isNaN(id)) {
      throw customerError(400, ERROR_CODES.CUSTOMER_NOT_ELIGIBLE, "اختر حساب العميل.", { field: "customerUserId" });
    }
    out.customerUserId = id;
  } else if (mode === "new_account") {
    const phone = normalizePhoneE164(obj.phone);
    if (!phone) {
      throw customerError(400, ERROR_CODES.PHONE_INVALID, "رقم الهاتف غير صالح. استخدم الصيغة الدولية مثل +9627XXXXXXXX.", {
        field: "phone",
      });
    }
    out.phone = phone;
  } else {
    const hasPhone = obj.phone !== undefined && obj.phone !== null && String(obj.phone).trim() !== "";
    const phone = hasPhone ? normalizePhoneE164(obj.phone) : null;
    if (hasPhone && !phone) {
      throw customerError(400, ERROR_CODES.PHONE_INVALID, "رقم الهاتف غير صالح. استخدم الصيغة الدولية مثل +9627XXXXXXXX.", {
        field: "phone",
      });
    }
    const contactChannel = String(obj.contactChannel || "whatsapp").trim();
    if (!GUEST_CONTACT_CHANNELS.includes(contactChannel)) {
      throw customerError(400, ERROR_CODES.INVALID, "وسيلة التواصل غير صالحة.", { field: "contactChannel" });
    }
    if ((contactChannel === "whatsapp" || contactChannel === "phone") && !phone) {
      throw customerError(400, ERROR_CODES.PHONE_INVALID, "رقم التواصل مطلوب لهذه الوسيلة.", { field: "phone" });
    }
    const consentStatus = String(obj.consentStatus || "customer_initiated").trim();
    if (!GUEST_CONSENT_STATUSES.includes(consentStatus)) {
      throw customerError(400, ERROR_CODES.INVALID, "حالة الموافقة غير صالحة.", { field: "consentStatus" });
    }
    out.guest = {
      referenceName: cleanText(obj.referenceName, MAX_REFERENCE_NAME),
      phone,
      contactChannel,
      whatsappOnly: obj.whatsappOnly === undefined ? true : obj.whatsappOnly === true || obj.whatsappOnly === "true",
      consentStatus,
      note: cleanText(obj.note, MAX_NOTE),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

async function appendEvent(client, { orderId, action, actorUserId = null, actorRole = null, detail = {} }) {
  await client.query(
    `INSERT INTO order_customer_events (order_id, action, actor_user_id, actor_role, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [Number(orderId), action, actorUserId != null ? Number(actorUserId) : null, actorRole || null, JSON.stringify(detail || {})],
  );
}

function staffRole(actorRole) {
  return actorRole === "super_admin" ? "super_admin" : "admin";
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

async function assertEligibleCustomerAccount(client, userId) {
  const { rows } = await client.query(
    `SELECT id, role, is_active, email_verified FROM users WHERE id = $1 LIMIT 1`,
    [Number(userId)],
  );
  const u = rows[0];
  if (!u || u.role !== "client" || u.is_active !== true || u.email_verified !== true) {
    throw customerError(400, ERROR_CODES.CUSTOMER_NOT_ELIGIBLE, "الحساب المختار ليس حساب عميل مفعّل.");
  }
  return u;
}

async function assertAccountManager(client, adminId) {
  const { rows } = await client.query(
    `SELECT id FROM users WHERE id = $1 AND role IN ('admin', 'super_admin') AND is_active = TRUE LIMIT 1`,
    [Number(adminId)],
  );
  if (!rows[0]) {
    throw customerError(400, ERROR_CODES.ACCOUNT_MANAGER_INVALID, "المسؤول عن المتابعة يجب أن يكون أدمن فعّالًا.");
  }
}

/** Admin customer search: verified, active client accounts only; masked contact data. */
async function searchCustomerAccounts({ q }) {
  const raw = toAsciiDigits(q).trim();
  if (raw.length < 3) return [];
  const digits = raw.replace(/\D/g, "");
  const emailLike = raw.includes("@") ? raw.toLowerCase() : null;
  const params = [raw.toUpperCase(), emailLike, digits.length >= 6 ? digits : null, `${raw}%`, CUSTOMER_SEARCH_LIMIT];
  const { rows } = await pool.query(
    `SELECT id, account_id, first_name, father_name, family_name, email, phone
       FROM users
      WHERE role = 'client' AND is_active = TRUE AND email_verified = TRUE
        AND (
          upper(account_id) = $1
          OR ($2::text IS NOT NULL AND lower(email) = $2)
          OR ($3::text IS NOT NULL AND (
                regexp_replace(phone, '\\D', '', 'g') LIKE '%' || $3
             OR regexp_replace(whatsapp, '\\D', '', 'g') LIKE '%' || $3))
          OR first_name ILIKE $4
          OR family_name ILIKE $4
        )
      ORDER BY id DESC
      LIMIT $5`,
    params,
  );
  return rows.map((r) => ({
    id: String(r.id),
    accountId: r.account_id,
    fullName: fullName(r),
    maskedEmail: maskEmail(r.email),
    maskedPhone: maskPhone(normalizePhoneE164(r.phone) || r.phone),
  }));
}

/**
 * Admin hint for the new-account path: does a verified client account already use this phone?
 * Returns a boolean only — never the account itself (the Admin decides to switch to "existing").
 */
async function phoneMatchesExistingClient(phoneRaw) {
  const phone = normalizePhoneE164(phoneRaw);
  if (!phone) throw customerError(400, ERROR_CODES.PHONE_INVALID, "رقم الهاتف غير صالح.");
  const digits = phone.slice(1);
  const { rows } = await pool.query(
    `SELECT 1 FROM users
      WHERE role = 'client' AND is_active = TRUE
        AND (regexp_replace(phone, '\\D', '', 'g') IN ($1, '00' || $1)
          OR regexp_replace(whatsapp, '\\D', '', 'g') IN ($1, '00' || $1))
      LIMIT 1`,
    [digits],
  );
  return { phone, matchesExistingAccount: rows.length > 0 };
}

async function listAccountManagers() {
  const { rows } = await pool.query(
    `SELECT id, role, first_name, father_name, family_name
       FROM users
      WHERE role IN ('admin', 'super_admin') AND is_active = TRUE
      ORDER BY role DESC, first_name ASC, id ASC
      LIMIT 200`,
  );
  return rows.map((r) => ({ id: String(r.id), role: r.role, fullName: fullName(r) }));
}

// ---------------------------------------------------------------------------
// Invitations (one-time claim links)
// ---------------------------------------------------------------------------

async function createInvitationInTransaction(client, { orderId, purpose, phone = null, evidence = null, actorUserId, actorRole }) {
  const revoked = await client.query(
    `UPDATE order_customer_invitations
        SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
      WHERE order_id = $1 AND status = 'pending'
      RETURNING id`,
    [Number(orderId)],
  );
  for (const r of revoked.rows) {
    await appendEvent(client, {
      orderId,
      action: "invitation_revoked",
      actorUserId,
      actorRole: staffRole(actorRole),
      detail: { invitationId: String(r.id), reason: "regenerated" },
    });
  }
  const token = generateClaimToken();
  const ttlHours = INVITATION_TTL_HOURS[purpose];
  const { rows } = await client.query(
    `INSERT INTO order_customer_invitations
       (order_id, purpose, token_hash, intended_phone_e164, request_evidence, expires_at, created_by_admin_id)
     VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(hours => $6), $7)
     RETURNING id, expires_at`,
    [Number(orderId), purpose, sha256Hex(token), phone, evidence, ttlHours, Number(actorUserId)],
  );
  await appendEvent(client, {
    orderId,
    action: "invitation_created",
    actorUserId,
    actorRole: staffRole(actorRole),
    detail: { invitationId: String(rows[0].id), purpose, ttlHours },
  });
  return { token, claimUrl: buildClaimUrl(token), expiresAt: rows[0].expires_at };
}

// ---------------------------------------------------------------------------
// Create-time linkage (inside the canonical order creation transaction)
// ---------------------------------------------------------------------------

/**
 * Links the customer to a freshly inserted Admin order. Runs inside the caller's transaction.
 * Returns `{ invitation }` for new_account (plaintext link shown ONCE to the Admin), else `{}`.
 */
async function attachCustomerInTransaction(client, { orderRow, actorUserId, actorRole, customer }) {
  if (!customer) return {};
  const orderId = Number(orderRow.id);
  const managerId = customer.accountManagerAdminId || Number(actorUserId);
  await assertAccountManager(client, managerId);

  let customerUserId = null;
  let guestContactId = null;
  let invitation = null;

  if (customer.mode === "existing") {
    await assertEligibleCustomerAccount(client, customer.customerUserId);
    customerUserId = Number(customer.customerUserId);
  } else if (customer.mode === "guest") {
    const g = customer.guest;
    const { rows } = await client.query(
      `INSERT INTO guest_contacts
         (reference_name, phone_e164, contact_channel, whatsapp_only, consent_status, note,
          created_by_admin_id, retain_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + make_interval(days => $8))
       RETURNING id`,
      [g.referenceName, g.phone, g.contactChannel, g.whatsappOnly, g.consentStatus, g.note, Number(actorUserId), GUEST_RETENTION_DAYS],
    );
    guestContactId = Number(rows[0].id);
  }

  await client.query(
    `UPDATE orders
        SET customer_mode = $2,
            customer_user_id = $3,
            guest_contact_id = $4,
            account_manager_admin_id = $5,
            order_channel = $6,
            customer_pricing_status = $7,
            customer_price_amount = $8,
            customer_price_currency = $9,
            updated_at = NOW()
      WHERE id = $1`,
    [
      orderId,
      customer.mode,
      customerUserId,
      guestContactId,
      managerId,
      customer.channel,
      customer.pricing.status,
      customer.pricing.amount,
      customer.pricing.currency,
    ],
  );

  await appendEvent(client, {
    orderId,
    action: "customer_mode_set",
    actorUserId,
    actorRole: staffRole(actorRole),
    detail: {
      mode: customer.mode,
      channel: customer.channel,
      accountManagerAdminId: String(managerId),
      ...(customerUserId ? { customerUserId: String(customerUserId) } : {}),
      ...(guestContactId ? { guestContactId: String(guestContactId) } : {}),
      pricingStatus: customer.pricing.status,
    },
  });

  if (customer.mode === "new_account") {
    invitation = await createInvitationInTransaction(client, {
      orderId,
      purpose: "new_account",
      phone: customer.phone,
      actorUserId,
      actorRole,
    });
  }
  return invitation ? { invitation } : {};
}

// ---------------------------------------------------------------------------
// Admin reads / actions on an existing order
// ---------------------------------------------------------------------------

async function loadAdminOrderForUpdate(client, orderId) {
  const { rows } = await client.query(
    `SELECT id, order_code, source_type, order_status, customer_mode, customer_user_id, guest_contact_id,
            customer_account_linked_at, account_manager_admin_id, customer_pricing_status,
            customer_price_amount, customer_price_currency
       FROM orders WHERE id = $1 FOR UPDATE`,
    [Number(orderId)],
  );
  const o = rows[0];
  if (!o || !["admin_created", "super_admin_created"].includes(o.source_type)) {
    throw customerError(404, ERROR_CODES.NOT_FOUND, "الطلب غير موجود.");
  }
  return o;
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }
}

function mapPricing(row) {
  return {
    status: row.customer_pricing_status || null,
    amount: row.customer_price_amount != null ? String(row.customer_price_amount) : null,
    currency: row.customer_price_currency || null,
  };
}

/** Full customer panel for the Admin order view (masked guest phone). */
async function getAdminOrderCustomer(orderId) {
  const { rows } = await pool.query(
    `SELECT o.id, o.order_code, o.source_type, o.order_status, o.customer_mode, o.customer_user_id,
            o.guest_contact_id, o.customer_account_linked_at, o.account_manager_admin_id, o.order_channel,
            o.customer_pricing_status, o.customer_price_amount, o.customer_price_currency,
            o.created_by_user_id, o.due_at, o.duration_value, o.duration_unit,
            cat.name AS service_name, cat.name_en AS service_name_en,
            cu.account_id AS cu_account_id, cu.first_name AS cu_first_name, cu.father_name AS cu_father_name,
            cu.family_name AS cu_family_name, cu.email AS cu_email,
            am.first_name AS am_first_name, am.father_name AS am_father_name, am.family_name AS am_family_name,
            cb.first_name AS cb_first_name, cb.father_name AS cb_father_name, cb.family_name AS cb_family_name,
            g.reference_name AS g_reference_name, g.phone_e164 AS g_phone, g.contact_channel AS g_channel,
            g.whatsapp_only AS g_whatsapp_only, g.consent_status AS g_consent, g.note AS g_note,
            g.redacted_at AS g_redacted_at, g.retain_until AS g_retain_until
       FROM orders o
       LEFT JOIN users cu ON cu.id = o.customer_user_id
       LEFT JOIN users am ON am.id = o.account_manager_admin_id
       LEFT JOIN users cb ON cb.id = o.created_by_user_id
       LEFT JOIN guest_contacts g ON g.id = o.guest_contact_id
       LEFT JOIN categories cat ON cat.id = o.category_id
      WHERE o.id = $1
      LIMIT 1`,
    [Number(orderId)],
  );
  const o = rows[0];
  if (!o || !["admin_created", "super_admin_created"].includes(o.source_type)) {
    throw customerError(404, ERROR_CODES.NOT_FOUND, "الطلب غير موجود.");
  }
  const [{ rows: invRows }, { rows: evRows }] = await Promise.all([
    pool.query(
      `SELECT id, purpose, status, expires_at, created_at, claimed_at
         FROM order_customer_invitations
        WHERE order_id = $1
        ORDER BY id DESC
        LIMIT 1`,
      [Number(orderId)],
    ),
    pool.query(
      `SELECT e.id, e.action, e.actor_role, e.detail, e.created_at,
              u.first_name, u.father_name, u.family_name
         FROM order_customer_events e
         LEFT JOIN users u ON u.id = e.actor_user_id
        WHERE e.order_id = $1
        ORDER BY e.id DESC
        LIMIT 30`,
      [Number(orderId)],
    ),
  ]);
  const inv = invRows[0];
  const invitationLive = inv && inv.status === "pending" && new Date(inv.expires_at).getTime() > Date.now();
  return {
    orderId: String(o.id),
    orderCode: o.order_code,
    orderStatus: o.order_status,
    mode: o.customer_mode || null,
    channel: o.order_channel || null,
    serviceName: o.service_name || null,
    serviceNameEn: o.service_name_en || null,
    dueAt: o.due_at || null,
    durationValue: o.duration_value != null ? Number(o.duration_value) : null,
    durationUnit: o.duration_unit || null,
    createdBy: { id: String(o.created_by_user_id), fullName: fullName(o, "cb_") },
    accountManager: o.account_manager_admin_id
      ? { id: String(o.account_manager_admin_id), fullName: fullName(o, "am_") }
      : null,
    pricing: mapPricing(o),
    account: o.customer_user_id
      ? {
          id: String(o.customer_user_id),
          accountId: o.cu_account_id,
          fullName: fullName(o, "cu_"),
          maskedEmail: maskEmail(o.cu_email),
          linkedAt: o.customer_account_linked_at || null,
        }
      : null,
    guest: o.guest_contact_id
      ? {
          id: String(o.guest_contact_id),
          referenceName: o.g_reference_name || null,
          hasPhone: Boolean(o.g_phone),
          maskedPhone: o.g_phone ? maskPhone(o.g_phone) : null,
          contactChannel: o.g_channel,
          whatsappOnly: Boolean(o.g_whatsapp_only),
          consentStatus: o.g_consent,
          note: o.g_note || null,
          redacted: o.g_redacted_at != null,
          retainUntil: o.g_retain_until || null,
          convertedToAccount: Boolean(o.customer_user_id),
        }
      : null,
    invitation: inv
      ? {
          id: String(inv.id),
          purpose: inv.purpose,
          status: inv.status === "pending" && !invitationLive ? "expired" : inv.status,
          expiresAt: inv.expires_at,
          createdAt: inv.created_at,
          claimedAt: inv.claimed_at || null,
        }
      : null,
    awaitingActivation: o.customer_mode === "new_account" && !o.customer_user_id,
    events: evRows.map((e) => ({
      id: String(e.id),
      action: e.action,
      actorRole: e.actor_role,
      actorName: fullName(e),
      detail: e.detail || {},
      createdAt: e.created_at,
    })),
  };
}

/** Full guest phone for external communication. Audited every time. */
async function revealGuestContact({ orderId, actorUserId, actorRole }) {
  return withTransaction(async (client) => {
    const o = await loadAdminOrderForUpdate(client, orderId);
    if (!o.guest_contact_id) throw customerError(409, ERROR_CODES.ACTION_NOT_ALLOWED, "هذا الطلب ليس طلب ضيف.");
    const { rows } = await client.query(
      `SELECT phone_e164, redacted_at FROM guest_contacts WHERE id = $1`,
      [Number(o.guest_contact_id)],
    );
    await appendEvent(client, { orderId, action: "guest_contact_revealed", actorUserId, actorRole: staffRole(actorRole) });
    return { phone: rows[0]?.redacted_at ? null : rows[0]?.phone_e164 || null };
  });
}

async function setAccountManager({ orderId, accountManagerAdminId, actorUserId, actorRole }) {
  const nextId = parseIdOrNull(accountManagerAdminId);
  if (!nextId || Number.isNaN(nextId)) {
    throw customerError(400, ERROR_CODES.ACCOUNT_MANAGER_INVALID, "المسؤول عن المتابعة غير صالح.");
  }
  await withTransaction(async (client) => {
    const o = await loadAdminOrderForUpdate(client, orderId);
    if (!o.customer_mode) throw customerError(409, ERROR_CODES.ACTION_NOT_ALLOWED, "هذا الطلب لا يرتبط بعميل.");
    await assertAccountManager(client, nextId);
    if (Number(o.account_manager_admin_id) === nextId) return;
    await client.query(`UPDATE orders SET account_manager_admin_id = $2, updated_at = NOW() WHERE id = $1`, [o.id, nextId]);
    await appendEvent(client, {
      orderId,
      action: "account_manager_changed",
      actorUserId,
      actorRole: staffRole(actorRole),
      detail: { from: o.account_manager_admin_id ? String(o.account_manager_admin_id) : null, to: String(nextId) },
    });
  });
  return getAdminOrderCustomer(orderId);
}

async function setCustomerPricing({ orderId, priceAmount, priceCurrency, actorUserId, actorRole }) {
  const pricing = parsePrice(priceAmount, priceCurrency);
  await withTransaction(async (client) => {
    const o = await loadAdminOrderForUpdate(client, orderId);
    if (!o.customer_mode) throw customerError(409, ERROR_CODES.ACTION_NOT_ALLOWED, "هذا الطلب لا يرتبط بعميل.");
    if (["completed", "cancelled"].includes(String(o.order_status))) {
      throw customerError(409, ERROR_CODES.ACTION_NOT_ALLOWED, "لا يمكن تعديل سعر طلب مغلق.");
    }
    await client.query(
      `UPDATE orders
          SET customer_pricing_status = $2, customer_price_amount = $3, customer_price_currency = $4, updated_at = NOW()
        WHERE id = $1`,
      [o.id, pricing.status, pricing.amount, pricing.currency],
    );
    await appendEvent(client, {
      orderId,
      action: "customer_pricing_set",
      actorUserId,
      actorRole: staffRole(actorRole),
      detail: { before: mapPricing(o), after: pricing },
    });
  });
  return getAdminOrderCustomer(orderId);
}

/** New-account path: (re)issue the activation link while the order is still unclaimed. */
async function regenerateActivationLink({ orderId, actorUserId, actorRole }) {
  return withTransaction(async (client) => {
    const o = await loadAdminOrderForUpdate(client, orderId);
    if (o.customer_mode !== "new_account" || o.customer_user_id) {
      throw customerError(409, ERROR_CODES.ACTION_NOT_ALLOWED, "لا يوجد حساب بانتظار التفعيل لهذا الطلب.");
    }
    const { rows } = await client.query(
      `SELECT intended_phone_e164 FROM order_customer_invitations WHERE order_id = $1 ORDER BY id DESC LIMIT 1`,
      [o.id],
    );
    return createInvitationInTransaction(client, {
      orderId: o.id,
      purpose: "new_account",
      phone: rows[0]?.intended_phone_e164 || null,
      actorUserId,
      actorRole,
    });
  });
}

/**
 * Guest → account: ONLY after the customer explicitly asked. The Admin records how the request was
 * received (evidence). Produces a one-time claim link; nothing is linked until the customer redeems it.
 */
async function createGuestConversionLink({ orderId, evidence, actorUserId, actorRole }) {
  const ev = cleanText(evidence, MAX_EVIDENCE);
  if (!ev || ev.length < 3) {
    throw customerError(400, ERROR_CODES.EVIDENCE_REQUIRED, "سجّل كيف طلب العميل إنشاء الحساب.");
  }
  return withTransaction(async (client) => {
    const o = await loadAdminOrderForUpdate(client, orderId);
    if (o.customer_mode !== "guest" || o.customer_user_id) {
      throw customerError(409, ERROR_CODES.ACTION_NOT_ALLOWED, "هذا الطلب ليس طلب ضيف قابلًا للتحويل.");
    }
    const { rows } = await client.query(`SELECT phone_e164 FROM guest_contacts WHERE id = $1`, [o.guest_contact_id]);
    return createInvitationInTransaction(client, {
      orderId: o.id,
      purpose: "guest_conversion",
      phone: rows[0]?.phone_e164 || null,
      evidence: ev,
      actorUserId,
      actorRole,
    });
  });
}

async function revokeInvitation({ orderId, actorUserId, actorRole }) {
  await withTransaction(async (client) => {
    const o = await loadAdminOrderForUpdate(client, orderId);
    const { rows } = await client.query(
      `UPDATE order_customer_invitations
          SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
        WHERE order_id = $1 AND status = 'pending'
        RETURNING id`,
      [o.id],
    );
    if (!rows.length) throw customerError(409, ERROR_CODES.ACTION_NOT_ALLOWED, "لا يوجد رابط فعّال لإلغائه.");
    await appendEvent(client, {
      orderId,
      action: "invitation_revoked",
      actorUserId,
      actorRole: staffRole(actorRole),
      detail: { invitationId: String(rows[0].id), reason: "admin_revoked" },
    });
  });
  return getAdminOrderCustomer(orderId);
}

// ---------------------------------------------------------------------------
// Public preview + customer claim
// ---------------------------------------------------------------------------

function claimInvalidError() {
  return customerError(404, ERROR_CODES.CLAIM_INVALID, "رابط الطلب غير صالح أو منتهي الصلاحية.");
}

/** Public: minimal, non-identifying preview (order number + service). Never customer data. */
async function previewClaim(token) {
  if (!isWellFormedClaimToken(token)) throw claimInvalidError();
  const { rows } = await pool.query(
    `SELECT i.status, i.expires_at, i.purpose, o.order_code, o.customer_user_id,
            c.name AS category_name, c.name_en AS category_name_en
       FROM order_customer_invitations i
       JOIN orders o ON o.id = i.order_id
       LEFT JOIN categories c ON c.id = o.category_id
      WHERE i.token_hash = $1
      LIMIT 1`,
    [sha256Hex(token)],
  );
  const r = rows[0];
  if (!r || r.status !== "pending" || new Date(r.expires_at).getTime() <= Date.now() || r.customer_user_id) {
    throw claimInvalidError();
  }
  return {
    orderCode: r.order_code,
    serviceName: r.category_name || null,
    serviceNameEn: r.category_name_en || null,
    purpose: r.purpose,
    expiresAt: r.expires_at,
  };
}

/** Authenticated client redeems the link: the SAME order is linked to the verified account. */
async function claimOrder({ token, userId, notify = true }) {
  if (!isWellFormedClaimToken(token)) throw claimInvalidError();
  const result = await withTransaction(async (client) => {
    const { rows: userRows } = await client.query(
      `SELECT id, role, is_active, email_verified FROM users WHERE id = $1 LIMIT 1`,
      [Number(userId)],
    );
    const u = userRows[0];
    if (!u || u.role !== "client" || u.is_active !== true || u.email_verified !== true) {
      throw customerError(403, ERROR_CODES.CLAIM_ROLE, "يجب تسجيل الدخول بحساب عميل مفعّل لاستلام الطلب.");
    }
    const { rows: invRows } = await client.query(
      `SELECT id, order_id, purpose, status, expires_at
         FROM order_customer_invitations
        WHERE token_hash = $1
        FOR UPDATE`,
      [sha256Hex(token)],
    );
    const inv = invRows[0];
    if (!inv || inv.status !== "pending" || new Date(inv.expires_at).getTime() <= Date.now()) {
      throw claimInvalidError();
    }
    const o = await loadAdminOrderForUpdate(client, inv.order_id);
    const expectedMode = inv.purpose === "new_account" ? "new_account" : "guest";
    if (o.customer_mode !== expectedMode) throw claimInvalidError();
    if (o.customer_user_id) {
      throw customerError(409, ERROR_CODES.CLAIM_ALREADY_LINKED, "هذا الطلب مرتبط بحساب بالفعل.");
    }
    await client.query(
      `UPDATE orders SET customer_user_id = $2, customer_account_linked_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [o.id, Number(u.id)],
    );
    await client.query(
      `UPDATE order_customer_invitations
          SET status = 'claimed', claimed_by_user_id = $2, claimed_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [inv.id, Number(u.id)],
    );
    await appendEvent(client, {
      orderId: o.id,
      action: inv.purpose === "new_account" ? "account_claimed" : "guest_converted",
      actorUserId: u.id,
      actorRole: "client",
      detail: { invitationId: String(inv.id), customerUserId: String(u.id) },
    });
    return { orderId: String(o.id), orderCode: o.order_code, accountManagerAdminId: o.account_manager_admin_id, purpose: inv.purpose };
  });

  if (notify && result.accountManagerAdminId) {
    try {
      const notificationService = require("./notificationService");
      await notificationService.createIfNotExists(
        {
          recipientUserId: Number(result.accountManagerAdminId),
          recipientRole: "admin",
          actorUserId: Number(userId),
          type: "order.customer.account_linked",
          title: "تم ربط الطلب بحساب العميل",
          message: `قام العميل بتفعيل حسابه وربط الطلب ${result.orderCode}.`,
          entityType: "order",
          entityId: Number(result.orderId),
          link: `/dashboard/admin/orders?orderId=${encodeURIComponent(result.orderId)}`,
          priority: "medium",
          metadata: { orderId: result.orderId, purpose: result.purpose },
        },
        `order_customer_linked_${result.orderId}`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[notifications]", err?.message || err);
    }
  }
  return { orderId: result.orderId, orderCode: result.orderCode };
}

// ---------------------------------------------------------------------------
// Customer visibility (linked Admin-managed orders)
// ---------------------------------------------------------------------------

const CUSTOMER_STATUS_PROJECTION = Object.freeze({
  // Admin orders go to the TEAM's review, not the customer's: show it as work in progress.
  pending_client_review: "in_progress",
  open_for_bids: "published",
  open_for_freelancers: "published",
  assigned: "in_progress",
  ready_for_work: "in_progress",
});

/**
 * Customer-facing projection of an Admin-managed order. NEVER exposes orders.budget (freelancer
 * compensation), bids, freelancer identity, internal notes or guest contact data.
 */
function projectManagedOrderForCustomer(order, row) {
  if (!order) return null;
  const status = String(order.orderStatus || "");
  const completed = status === "completed";
  const priced = row?.customer_pricing_status === "priced";
  const files = Array.isArray(order.files)
    ? order.files
        .filter((f) => f.purpose === "brief" || (completed && f.purpose === "delivery"))
        .map((f) => ({
          id: f.id,
          orderId: f.orderId,
          originalName: f.originalName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          uploadedAt: f.uploadedAt,
          purpose: f.purpose,
          unavailable: Boolean(f.unavailable),
        }))
    : [];
  const projectedStatus = CUSTOMER_STATUS_PROJECTION[status] || status;
  return {
    id: order.id,
    orderCode: order.orderCode,
    title: order.title,
    description: order.description,
    titleEn: order.titleEn ?? null,
    descriptionEn: order.descriptionEn ?? null,
    categoryId: order.categoryId,
    subcategoryId: order.subcategoryId,
    subSubcategoryId: order.subSubcategoryId,
    category: order.category || null,
    subcategory: order.subcategory || null,
    subSubcategory: order.subSubcategory || null,
    extraCategories: [],
    extraCategoryIds: [],
    preferredSkills: [],
    projectType: "fixed",
    budget: priced ? Number(row.customer_price_amount) : null,
    currencyCode: priced ? row.customer_price_currency : null,
    customerPricingStatus: row?.customer_pricing_status || null,
    bidBudgetMin: null,
    bidBudgetMax: null,
    durationValue: order.durationValue,
    durationUnit: order.durationUnit,
    sourceType: order.sourceType,
    orderStatus: projectedStatus,
    clientDisplayStatus: projectedStatus,
    clientDisplayStatusLabelAr: null,
    paymentRequired: false,
    paymentStatus: "not_required",
    requiresPayment: false,
    canPayNow: false,
    requiresAdminReview: false,
    acceptsPriceBids: false,
    isPublished: order.isPublished,
    isOpenForPool: false,
    isArchived: order.isArchived,
    hasAssignedFreelancer: Boolean(order.assignedFreelancerId),
    bidsCount: 0,
    bidUsers: [],
    files,
    dueAt: order.dueAt,
    startedAt: order.startedAt,
    submittedAt: completed ? order.submittedAt : null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    clientRevisionNote: null,
    revisionRequestedBy: null,
    serviceForm: order.serviceForm || null,
    // S3: the customer's own commercial terms only (no freelancer pay / margin).
    quote: order.customerQuote || null,
    managedByAdmin: true,
    customerActionsAllowed: false,
    linkedAt: row?.customer_account_linked_at || null,
  };
}

async function loadCustomerLinkRows(orderIds, clientMaybe) {
  const ids = (orderIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return new Map();
  const { rows } = await (clientMaybe || pool).query(
    `SELECT id, customer_user_id, customer_mode, customer_pricing_status, customer_price_amount,
            customer_price_currency, customer_account_linked_at
       FROM orders WHERE id = ANY($1::bigint[])`,
    [ids],
  );
  return new Map(rows.map((r) => [String(r.id), r]));
}

/** Admin list badges: one batched query for the page. */
async function loadAdminListCustomerSummaries(orderIds) {
  const ids = (orderIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return new Map();
  const { rows } = await pool.query(
    `SELECT o.id, o.customer_mode, o.order_channel, o.customer_user_id, o.customer_pricing_status,
            o.account_manager_admin_id, g.reference_name AS guest_reference_name
       FROM orders o
       LEFT JOIN guest_contacts g ON g.id = o.guest_contact_id
      WHERE o.id = ANY($1::bigint[])`,
    [ids],
  );
  return new Map(
    rows.map((r) => [
      String(r.id),
      {
        mode: r.customer_mode || null,
        channel: r.order_channel || null,
        accountLinked: Boolean(r.customer_user_id),
        awaitingActivation: r.customer_mode === "new_account" && !r.customer_user_id,
        pricingStatus: r.customer_pricing_status || null,
        accountManagerAdminId: r.account_manager_admin_id ? String(r.account_manager_admin_id) : null,
        guestReferenceName: r.guest_reference_name || null,
      },
    ]),
  );
}

// ---------------------------------------------------------------------------
// Reporting (aggregate only)
// ---------------------------------------------------------------------------

async function getCustomerModeSummary() {
  const { rows } = await pool.query(
    `SELECT
        COUNT(*)::int AS admin_orders,
        COUNT(*) FILTER (WHERE customer_mode IS NULL)::int AS internal_orders,
        COUNT(*) FILTER (WHERE customer_mode = 'existing')::int AS mode_existing,
        COUNT(*) FILTER (WHERE customer_mode = 'new_account')::int AS mode_new_account,
        COUNT(*) FILTER (WHERE customer_mode = 'new_account' AND customer_user_id IS NOT NULL)::int AS new_account_activated,
        COUNT(*) FILTER (WHERE customer_mode = 'guest')::int AS mode_guest,
        COUNT(*) FILTER (WHERE customer_mode = 'guest' AND customer_user_id IS NOT NULL)::int AS guest_converted,
        COUNT(*) FILTER (WHERE customer_pricing_status = 'pending_pricing')::int AS pending_pricing,
        COUNT(*) FILTER (WHERE customer_pricing_status = 'priced')::int AS priced,
        COUNT(*) FILTER (WHERE order_channel = 'whatsapp')::int AS channel_whatsapp,
        COUNT(*) FILTER (WHERE order_channel = 'admin')::int AS channel_admin,
        COUNT(*) FILTER (WHERE order_channel IN ('phone', 'email', 'other'))::int AS channel_other,
        COUNT(*) FILTER (WHERE customer_mode IS NOT NULL AND order_status = 'completed')::int AS customer_completed
       FROM orders
      WHERE source_type IN ('admin_created', 'super_admin_created')`,
  );
  const r = rows[0] || {};
  const { rows: clientRows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM orders WHERE source_type = 'client_created'`,
  );
  const activationRate = r.mode_new_account > 0 ? Math.round((r.new_account_activated / r.mode_new_account) * 1000) / 10 : null;
  return {
    adminOrders: r.admin_orders || 0,
    internalOrders: r.internal_orders || 0,
    clientSelfServiceOrders: clientRows[0]?.n || 0,
    byMode: {
      existing: r.mode_existing || 0,
      newAccount: r.mode_new_account || 0,
      guest: r.mode_guest || 0,
    },
    newAccountActivated: r.new_account_activated || 0,
    activationRatePercent: activationRate,
    guestConverted: r.guest_converted || 0,
    pricing: { pendingPricing: r.pending_pricing || 0, priced: r.priced || 0 },
    byChannel: { whatsapp: r.channel_whatsapp || 0, admin: r.channel_admin || 0, other: r.channel_other || 0 },
    customerOrdersCompleted: r.customer_completed || 0,
  };
}

module.exports = {
  CUSTOMER_MODES,
  ORDER_CHANNELS,
  ADMIN_ORDER_CHANNELS,
  GUEST_CONTACT_CHANNELS,
  ERROR_CODES,
  INVITATION_TTL_HOURS,
  normalizePhoneE164,
  maskPhone,
  maskEmail,
  parseCustomerInput,
  parsePrice,
  isWellFormedClaimToken,
  buildClaimUrl,
  sha256Hex,
  attachCustomerInTransaction,
  searchCustomerAccounts,
  phoneMatchesExistingClient,
  listAccountManagers,
  getAdminOrderCustomer,
  revealGuestContact,
  setAccountManager,
  setCustomerPricing,
  regenerateActivationLink,
  createGuestConversionLink,
  revokeInvitation,
  previewClaim,
  claimOrder,
  projectManagedOrderForCustomer,
  loadCustomerLinkRows,
  loadAdminListCustomerSummaries,
  getCustomerModeSummary,
  customerError,
};
