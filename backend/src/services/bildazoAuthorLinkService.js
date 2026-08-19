/**
 * OrderzHouse-side Bildazo writer link requests.
 * Does not store passwords. Does not call Bildazo from the browser.
 * Live S2S runs only when BILDAZO_AUTHOR_SYNC_ENABLED=true (Phase 1B).
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { isBildazoAuthorGateEnabled } = require("../config/bildazoAuthorGate");
const { isBildazoAuthorSyncEnabled } = require("../config/bildazoAuthorSync");
const {
  ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
  ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_COPY_AR,
  BILDAZO_AUTHOR_LINK_FLOWS,
  BILDAZO_PENDING_UPDATE_STATUSES,
  BILDAZO_AUTHOR_LINK_REQUIRED_AR,
  BILDAZO_AUTHOR_LINK_ERROR_CODES,
} = require("../constants/bildazoAuthorLink");
const {
  bildazoAuthorLinkSchemaReady,
} = require("../utils/bildazoAuthorLinkSchema");
const defaultBildazoSyncClient = require("./bildazoAuthorIntegrationClient");

const LOCAL_LINKED_STATUS = "linked";
const LOCAL_REVIEW_STATUS = "needs_manual_review";
const LOCAL_FAILED_STATUS = "failed";
const SYNC_LINKED_OK = new Set(["created", "linked", "already_linked"]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{7,14}$/;
const ISO2_RE = /^[A-Za-z]{2}$/;
const URL_RE = /^https?:\/\/.+/i;

function rejectSensitiveNonPasswordFields(body = {}) {
  const keys = Object.keys(body || {});
  const hit = keys.find((k) => String(k).toLowerCase().replace(/_/g, "") === "passwordhash");
  if (hit) {
    throw createAppError("لا يتم تخزين كلمة مرور Bildazo في OrderzHouse.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_PASSWORD_NOT_ALLOWED,
    });
  }
}

function validateBildazoPassword(password, confirm) {
  const p = String(password || "");
  if (p.length < 8) {
    throw createAppError("كلمة المرور يجب أن تكون 8 أحرف على الأقل وتتضمن حرفًا ورقمًا.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  if (p.length > 72) {
    throw createAppError("كلمة المرور طويلة جدًا.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  if (!/[A-Za-z\u0600-\u06FF]/.test(p) || !/\d/.test(p)) {
    throw createAppError("كلمة المرور يجب أن تحتوي على حرف واحد ورقم واحد على الأقل.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  if (confirm != null && String(confirm) !== p) {
    throw createAppError("تأكيد كلمة المرور غير مطابق.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  return p;
}

function normalizeEmail(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return s || null;
}

function normalizeOptionalText(raw, max) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function emailsMatch(a, b) {
  const x = normalizeEmail(a);
  const y = normalizeEmail(b);
  return Boolean(x && y && x === y);
}

function mapLinkRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    freelancerUserId: String(row.freelancer_user_id),
    linkFlow: row.link_flow,
    status: row.status,
    orderzVerifiedEmail: row.orderz_verified_email,
    fullName: row.full_name || null,
    phoneE164: row.phone_e164 || null,
    countryIso: row.country_iso || null,
    bio: row.bio || null,
    existingBildazoEmail: row.existing_bildazo_email || null,
    existingBildazoPublicId: row.existing_bildazo_public_id || null,
    existingBildazoProfileUrl: row.existing_bildazo_profile_url || null,
    emailMatchesOrderz: Boolean(row.email_matches_orderz),
    acceptedTermsVersion: row.accepted_terms_version,
    acceptedAt: row.accepted_at,
    source: row.source || "orderzhouse",
    bildazoUserId: row.bildazo_user_id || null,
    bildazoPublicId: row.bildazo_public_id || null,
    bildazoProfileUrl: row.bildazo_profile_url || null,
    linkedAt: row.linked_at || null,
    linkedByUserId: row.linked_by_user_id != null ? String(row.linked_by_user_id) : null,
    manualReviewReason: row.manual_review_reason || null,
    lastError: row.last_error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function canApplyToArticlesFromLink({ gateEnabled, status }) {
  if (!gateEnabled) return true;
  return status === "linked";
}

function resolveExistingAccountStatus({ existingEmail, orderzEmail }) {
  if (existingEmail && !emailsMatch(existingEmail, orderzEmail)) {
    return {
      status: "pending_external_verification",
      emailMatchesOrderz: false,
    };
  }
  return {
    status: "pending_existing_account",
    emailMatchesOrderz: Boolean(existingEmail && emailsMatch(existingEmail, orderzEmail)),
  };
}

function buildTermsSnapshot({
  freelancerUserId,
  linkFlow,
  orderzVerifiedEmail,
  existingBildazoEmail,
  existingBildazoPublicId,
  existingBildazoProfileUrl,
}) {
  return {
    version: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
    copyAr: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_COPY_AR,
    legalReview: "provisional_product_copy",
    userId: String(freelancerUserId),
    linkFlow,
    orderzVerifiedEmail,
    existingBildazoEmail: existingBildazoEmail || null,
    existingBildazoPublicId: existingBildazoPublicId || null,
    existingBildazoProfileUrl: existingBildazoProfileUrl || null,
    acceptedAt: new Date().toISOString(),
  };
}

function validateRequestBody(body, { orderzEmail }) {
  rejectSensitiveNonPasswordFields(body);
  const linkFlow = String(body?.linkFlow || "").trim();
  if (!BILDAZO_AUTHOR_LINK_FLOWS.includes(linkFlow)) {
    throw createAppError("اختر طريقة الربط: حساب جديد أو حساب موجود.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  // new_account: never persist frontend email. Server uses the authenticated OrderzHouse address.
  const acknowledged =
    body?.acceptedTermsAcknowledged === true ||
    body?.acceptedTermsAcknowledged === "true" ||
    body?.acceptedTermsAcknowledged === 1;
  if (!acknowledged) {
    throw createAppError("يجب الموافقة على شروط ربط حساب الكاتب.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  const termsVersion = String(body?.acceptedTermsVersion || "").trim();
  if (termsVersion !== ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION) {
    throw createAppError("إصدار الشروط غير مطابق. حدّث الصفحة ثم أعد المحاولة.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }

  const fullName = normalizeOptionalText(body?.fullName, 200);
  const phoneE164 = normalizeOptionalText(body?.phoneE164, 20);
  const countryIsoRaw = normalizeOptionalText(body?.countryIso, 2);
  const countryIso = countryIsoRaw ? countryIsoRaw.toUpperCase() : null;
  const bio = normalizeOptionalText(body?.bio, 2000);

  if (phoneE164 && !E164_RE.test(phoneE164)) {
    throw createAppError("رقم الهاتف يجب أن يكون بصيغة دولية مثل +9627XXXXXXX.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  if (countryIso && !ISO2_RE.test(countryIso)) {
    throw createAppError("رمز الدولة يجب أن يكون حرفين ISO.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }

  if (linkFlow === "new_account") {
    if (!fullName || fullName.length < 3) {
      throw createAppError("الاسم الكامل مطلوب لإنشاء حساب الكاتب.", 400, {
        exposeToClient: true,
        publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
      });
    }
    const dateOfBirth = normalizeOptionalText(body?.dateOfBirth, 10);
    const passwordRaw = body?.password;
    const password =
      passwordRaw == null || passwordRaw === ""
        ? null
        : validateBildazoPassword(passwordRaw, body?.passwordConfirm ?? body?.confirmPassword);
    return {
      linkFlow,
      fullName,
      phoneE164,
      countryIso,
      bio,
      dateOfBirth,
      password,
      existingBildazoEmail: null,
      existingBildazoPublicId: null,
      existingBildazoProfileUrl: null,
      status: "pending_new_account",
      emailMatchesOrderz: false,
    };
  }

  const existingBildazoEmail = normalizeEmail(body?.existingBildazoEmail);
  const existingBildazoPublicId = normalizeOptionalText(body?.existingBildazoPublicId, 120);
  const existingBildazoProfileUrl = normalizeOptionalText(body?.existingBildazoProfileUrl, 500);
  const passwordRaw = body?.password;
  const password =
    passwordRaw == null || passwordRaw === ""
      ? null
      : validateBildazoPassword(passwordRaw, body?.passwordConfirm ?? body?.confirmPassword);

  if (password) {
    if (!existingBildazoEmail || !EMAIL_RE.test(existingBildazoEmail)) {
      throw createAppError("أدخل بريد حساب Bildazo وكلمة المرور.", 400, {
        exposeToClient: true,
        publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
      });
    }
    return {
      linkFlow,
      fullName,
      phoneE164,
      countryIso,
      bio,
      dateOfBirth: null,
      password,
      existingBildazoEmail,
      existingBildazoPublicId: null,
      existingBildazoProfileUrl: null,
      status: "pending_existing_account",
      emailMatchesOrderz: emailsMatch(existingBildazoEmail, orderzEmail),
    };
  }
  if (existingBildazoEmail && !EMAIL_RE.test(existingBildazoEmail)) {
    throw createAppError("بريد حساب Bildazo غير صالح.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  if (existingBildazoProfileUrl && !URL_RE.test(existingBildazoProfileUrl)) {
    throw createAppError("رابط الملف الشخصي يجب أن يبدأ بـ http أو https.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  if (!existingBildazoEmail && !existingBildazoPublicId && !existingBildazoProfileUrl) {
    throw createAppError("أدخل بريد حساب Bildazo أو الرقم العام أو رابط الملف الشخصي.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  const resolved = resolveExistingAccountStatus({
    existingEmail: existingBildazoEmail,
    orderzEmail,
  });
  return {
    linkFlow,
    fullName,
    phoneE164,
    countryIso,
    bio,
    dateOfBirth: null,
    password: null,
    existingBildazoEmail,
    existingBildazoPublicId,
    existingBildazoProfileUrl,
    status: resolved.status,
    emailMatchesOrderz: resolved.emailMatchesOrderz,
  };
}

async function loadFreelancerUser(freelancerUserId, db) {
  const id = Number(freelancerUserId);
  if (!Number.isInteger(id) || id < 1) {
    throw createAppError("مستخدم غير صالح.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  const { rows } = await db.query(
    `SELECT id, email, email_verified, role, first_name, father_name, family_name, phone, country, bio
       FROM users
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row || String(row.role) !== "freelancer") {
    throw createAppError("هذا المسار للمستقلين فقط.", 403, {
      exposeToClient: true,
      publicCode: "FORBIDDEN",
    });
  }
  return row;
}

function suggestedFullName(userRow) {
  return [userRow.first_name, userRow.father_name, userRow.family_name]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(" ");
}

async function getLinkRow(freelancerUserId, db) {
  const { rows } = await db.query(
    `SELECT * FROM freelancer_bildazo_author_links WHERE freelancer_user_id = $1 LIMIT 1`,
    [Number(freelancerUserId)],
  );
  return rows[0] || null;
}

function toPublicMe({ userRow, linkRow, schemaReady, gateEnabled }) {
  const mapped = mapLinkRow(linkRow);
  const status = mapped?.status || "not_started";
  return {
    status,
    linkFlow: mapped?.linkFlow || null,
    orderzVerifiedEmail: userRow.email,
    emailVerified: userRow.email_verified !== false,
    suggestedFullName: suggestedFullName(userRow),
    suggestedPhone: userRow.phone || null,
    suggestedCountryIso: userRow.country || null,
    termsVersion: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
    termsCopyAr: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_COPY_AR,
    gateEnabled,
    schemaReady: Boolean(schemaReady),
    canApplyToArticles: canApplyToArticlesFromLink({ gateEnabled, status }),
    submitted: mapped
      ? {
          fullName: mapped.fullName,
          phoneE164: mapped.phoneE164,
          countryIso: mapped.countryIso,
          bio: mapped.bio,
          existingBildazoEmail: mapped.existingBildazoEmail,
          existingBildazoPublicId: mapped.existingBildazoPublicId,
          existingBildazoProfileUrl: mapped.existingBildazoProfileUrl,
          emailMatchesOrderz: mapped.emailMatchesOrderz,
          acceptedAt: mapped.acceptedAt,
        }
      : null,
    linked:
      status === "linked"
        ? {
            bildazoUserId: mapped.bildazoUserId,
            bildazoPublicId: mapped.bildazoPublicId,
            bildazoProfileUrl: mapped.bildazoProfileUrl,
            linkedAt: mapped.linkedAt,
          }
        : null,
    messageKey:
      status === LOCAL_LINKED_STATUS
        ? "linked"
        : status === "pending_new_account"
          ? "pending_new_account"
          : status === LOCAL_REVIEW_STATUS
            ? "needs_manual_review"
            : status === LOCAL_FAILED_STATUS
              ? "failed"
              : status === "pending_external_verification"
                ? "pending_external_verification"
                : status.startsWith("pending")
                  ? "pending_existing_account"
                  : "not_started",
  };
}

function shouldAttemptBildazoSync(parsed) {
  if (!isBildazoAuthorSyncEnabled()) return false;
  if (parsed.password) return true;
  if (parsed.linkFlow === "new_account") return true;
  if (
    parsed.linkFlow === "existing_account" &&
    parsed.emailMatchesOrderz &&
    parsed.existingBildazoEmail
  ) {
    return true;
  }
  return false;
}

function hasBildazoIdentity(sync) {
  return Boolean(sync?.bildazoUserId || sync?.bildazoPublicId || sync?.profileUrl);
}

function safeStoredError(sync) {
  if (sync?.errorCode === "BILDAZO_SYNC_INVALID_CREDENTIALS") {
    return "Invalid email or password";
  }
  const msg = String(sync?.safeMessage || "").trim();
  if (!msg) {
    if (sync?.errorCode === "BILDAZO_SYNC_CONFIG_MISSING") return "Bildazo sync is not configured";
    if (sync?.errorCode === "BILDAZO_SYNC_TIMEOUT") return "Bildazo request timed out";
    return "Bildazo request failed";
  }
  return msg.slice(0, 240);
}

async function persistBildazoSyncOutcome(db, freelancerUserId, currentRow, sync) {
  if (!sync || sync.disabled) return currentRow;

  if (SYNC_LINKED_OK.has(sync.status) && hasBildazoIdentity(sync)) {
    const updated = await db.query(
      `UPDATE freelancer_bildazo_author_links
          SET status = $2,
              bildazo_user_id = $3,
              bildazo_public_id = $4,
              bildazo_profile_url = $5,
              linked_at = NOW(),
              linked_by_user_id = NULL,
              last_error = NULL,
              manual_review_reason = NULL,
              updated_at = NOW()
        WHERE freelancer_user_id = $1
          AND status <> 'linked'
        RETURNING *`,
      [
        Number(freelancerUserId),
        LOCAL_LINKED_STATUS,
        sync.bildazoUserId,
        sync.bildazoPublicId,
        sync.profileUrl,
      ],
    );
    return updated.rows[0] || currentRow;
  }

  if (SYNC_LINKED_OK.has(sync.status) && !hasBildazoIdentity(sync)) {
    const updated = await db.query(
      `UPDATE freelancer_bildazo_author_links
          SET status = $2,
              last_error = $3,
              updated_at = NOW()
        WHERE freelancer_user_id = $1
          AND status <> 'linked'
        RETURNING *`,
      [
        Number(freelancerUserId),
        LOCAL_FAILED_STATUS,
        "Bildazo response missing identity",
      ],
    );
    return updated.rows[0] || currentRow;
  }

  if (sync.status === LOCAL_REVIEW_STATUS) {
    const reason = safeStoredError(sync);
    const updated = await db.query(
      `UPDATE freelancer_bildazo_author_links
          SET status = $2,
              last_error = $3,
              manual_review_reason = $4,
              updated_at = NOW()
        WHERE freelancer_user_id = $1
          AND status <> 'linked'
        RETURNING *`,
      [Number(freelancerUserId), LOCAL_REVIEW_STATUS, reason, reason],
    );
    return updated.rows[0] || currentRow;
  }

  const updated = await db.query(
    `UPDATE freelancer_bildazo_author_links
        SET status = $2,
            last_error = $3,
            updated_at = NOW()
      WHERE freelancer_user_id = $1
        AND status <> 'linked'
      RETURNING *`,
    [Number(freelancerUserId), LOCAL_FAILED_STATUS, safeStoredError(sync)],
  );
  return updated.rows[0] || currentRow;
}

async function getMyBildazoAuthorLink(freelancerUserId, { db = pool } = {}) {
  const userRow = await loadFreelancerUser(freelancerUserId, db);
  const gateEnabled = isBildazoAuthorGateEnabled();
  const schemaReady = await bildazoAuthorLinkSchemaReady(db);
  if (!schemaReady) {
    return toPublicMe({ userRow, linkRow: null, schemaReady: false, gateEnabled });
  }
  const linkRow = await getLinkRow(freelancerUserId, db);
  return toPublicMe({ userRow, linkRow, schemaReady: true, gateEnabled });
}

async function submitBildazoAuthorLinkRequest(
  freelancerUserId,
  body,
  { db = pool, syncClient = defaultBildazoSyncClient } = {},
) {
  const userRow = await loadFreelancerUser(freelancerUserId, db);
  if (userRow.email_verified === false) {
    throw createAppError("يجب تأكيد بريد OrderzHouse قبل طلب ربط Bildazo.", 409, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_EMAIL_UNVERIFIED,
    });
  }
  const schemaReady = await bildazoAuthorLinkSchemaReady(db);
  if (!schemaReady) {
    throw createAppError("طلب ربط Bildazo غير متاح حالياً.", 503, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_GATE_SCHEMA_MISSING,
    });
  }

  const parsed = validateRequestBody(body || {}, { orderzEmail: userRow.email });
  const existing = await getLinkRow(freelancerUserId, db);
  if (existing && existing.status === "linked") {
    return {
      alreadyLinked: true,
      link: toPublicMe({
        userRow,
        linkRow: existing,
        schemaReady: true,
        gateEnabled: isBildazoAuthorGateEnabled(),
      }),
    };
  }
  if (existing && existing.status === "blocked") {
    throw createAppError("طلب الربط موقوف. تواصل مع الدعم.", 409, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  if (existing && !BILDAZO_PENDING_UPDATE_STATUSES.includes(existing.status)) {
    throw createAppError("لا يمكن تعديل حالة الربط الحالية من هذه الصفحة.", 409, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }

  const snapshot = buildTermsSnapshot({
    freelancerUserId,
    linkFlow: parsed.linkFlow,
    orderzVerifiedEmail: userRow.email,
    existingBildazoEmail: parsed.existingBildazoEmail,
    existingBildazoPublicId: parsed.existingBildazoPublicId,
    existingBildazoProfileUrl: parsed.existingBildazoProfileUrl,
  });

  const params = [
    Number(freelancerUserId),
    parsed.linkFlow,
    parsed.status,
    userRow.email,
    parsed.fullName,
    parsed.phoneE164,
    parsed.countryIso,
    parsed.bio,
    parsed.existingBildazoEmail,
    parsed.existingBildazoPublicId,
    parsed.existingBildazoProfileUrl,
    parsed.emailMatchesOrderz,
    ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
    JSON.stringify(snapshot),
  ];

  let row;
  if (!existing) {
    const inserted = await db.query(
      `INSERT INTO freelancer_bildazo_author_links (
         freelancer_user_id, link_flow, status, orderz_verified_email,
         full_name, phone_e164, country_iso, bio,
         existing_bildazo_email, existing_bildazo_public_id, existing_bildazo_profile_url,
         email_matches_orderz, accepted_terms_version, accepted_terms_snapshot, accepted_at, source
       ) VALUES (
         $1,$2,$3,$4,
         $5,$6,$7,$8,
         $9,$10,$11,
         $12,$13,$14::jsonb, NOW(), 'orderzhouse'
       )
       RETURNING *`,
      params,
    );
    row = inserted.rows[0];
  } else {
    const updated = await db.query(
      `UPDATE freelancer_bildazo_author_links
          SET link_flow = $2,
              status = $3,
              orderz_verified_email = $4,
              full_name = $5,
              phone_e164 = $6,
              country_iso = $7,
              bio = $8,
              existing_bildazo_email = $9,
              existing_bildazo_public_id = $10,
              existing_bildazo_profile_url = $11,
              email_matches_orderz = $12,
              accepted_terms_version = $13,
              accepted_terms_snapshot = $14::jsonb,
              accepted_at = NOW(),
              last_error = NULL,
              updated_at = NOW()
        WHERE freelancer_user_id = $1
          AND status <> 'linked'
        RETURNING *`,
      params,
    );
    row = updated.rows[0] || existing;
  }

  if (shouldAttemptBildazoSync(parsed)) {
    const fullName = parsed.fullName || suggestedFullName(userRow);
    if (!fullName || fullName.length < 3) {
      const skipped = await db.query(
        `UPDATE freelancer_bildazo_author_links
            SET status = $2,
                last_error = $3,
                updated_at = NOW()
          WHERE freelancer_user_id = $1
            AND status <> 'linked'
          RETURNING *`,
        [
          Number(freelancerUserId),
          parsed.linkFlow === "new_account" ? LOCAL_FAILED_STATUS : parsed.status,
          "fullName is required for Bildazo sync",
        ],
      );
      row = skipped.rows[0] || row;
    } else {
      let sync;
      try {
        if (parsed.linkFlow === "new_account" && parsed.password && typeof syncClient.createAndLinkBildazoAuthor === "function") {
          sync = await syncClient.createAndLinkBildazoAuthor({
            orderzFreelancerId: String(userRow.id),
            email: userRow.email,
            fullName,
            phoneE164: parsed.phoneE164,
            countryIso: parsed.countryIso,
            bio: parsed.bio,
            dateOfBirth: parsed.dateOfBirth,
            password: parsed.password,
            acceptedTermsVersion: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
            acceptedAt: row?.accepted_at,
          });
        } else if (
          parsed.linkFlow === "existing_account" &&
          parsed.password &&
          typeof syncClient.linkExistingBildazoAuthorWithCredentials === "function"
        ) {
          sync = await syncClient.linkExistingBildazoAuthorWithCredentials({
            orderzFreelancerId: String(userRow.id),
            email: parsed.existingBildazoEmail,
            password: parsed.password,
            fullName,
          });
        } else {
          sync = await syncClient.linkOrCreateBildazoAuthor({
            orderzFreelancerId: String(userRow.id),
            email: userRow.email,
            fullName,
            phoneE164: parsed.phoneE164,
            countryIso: parsed.countryIso,
            bio: parsed.bio,
            acceptedTermsVersion: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
            acceptedAt: row?.accepted_at,
          });
        }
      } finally {
        parsed.password = null;
        if (body && typeof body === "object") {
          delete body.password;
          delete body.passwordConfirm;
          delete body.confirmPassword;
        }
      }
      row = (await persistBildazoSyncOutcome(db, freelancerUserId, row, sync)) || row;
    }
  }

  return {
    alreadyLinked: false,
    link: toPublicMe({
      userRow,
      linkRow: row,
      schemaReady: true,
      gateEnabled: isBildazoAuthorGateEnabled(),
    }),
  };
}

async function assertBildazoAuthorLinkedForArticleApply(freelancerUserId, { db = pool } = {}) {
  if (!isBildazoAuthorGateEnabled()) return { required: false, linked: false };
  const schemaReady = await bildazoAuthorLinkSchemaReady(db);
  if (!schemaReady) {
    throw createAppError(BILDAZO_AUTHOR_LINK_REQUIRED_AR, 409, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_REQUIRED,
    });
  }
  const row = await getLinkRow(freelancerUserId, db);
  if (!row || row.status !== "linked") {
    throw createAppError(BILDAZO_AUTHOR_LINK_REQUIRED_AR, 409, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_REQUIRED,
    });
  }
  return { required: true, linked: true };
}

async function getBildazoLinkStatusForEligibility(freelancerUserId, { db = pool } = {}) {
  const gateEnabled = isBildazoAuthorGateEnabled();
  if (!gateEnabled) {
    return { gateEnabled: false, status: null, canApplyToArticles: true };
  }
  const schemaReady = await bildazoAuthorLinkSchemaReady(db);
  if (!schemaReady) {
    return { gateEnabled: true, status: "not_started", canApplyToArticles: false };
  }
  const row = await getLinkRow(freelancerUserId, db);
  const status = row?.status || "not_started";
  return {
    gateEnabled: true,
    status,
    canApplyToArticles: status === "linked",
  };
}

module.exports = {
  getMyBildazoAuthorLink,
  submitBildazoAuthorLinkRequest,
  assertBildazoAuthorLinkedForArticleApply,
  getBildazoLinkStatusForEligibility,
  validateRequestBody,
  resolveExistingAccountStatus,
  canApplyToArticlesFromLink,
  mapLinkRow,
  emailsMatch,
  shouldAttemptBildazoSync,
};
