const crypto = require("crypto");
const { pool } = require("../config/db");
const {
  normalizeReferralCode,
  isReferralCodeShape,
  isEligibleReferralRole,
  resolveAttributionSource,
} = require("../domain/referralPolicy");
const { readCookieToken, buildAttributionCookie, COOKIE_NAME } = require("./referralCookie");
const { getCurrentPolicy, ensureReferralCode } = require("./referralPolicyService");
const notificationService = require("./notificationService");

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

async function findActiveCode(code, client = pool) {
  const normalized = normalizeReferralCode(code);
  if (!isReferralCodeShape(normalized)) return null;
  const { rows } = await client.query(
    `SELECT c.*, u.role, u.phone, u.is_active, u.first_name, u.family_name
       FROM referral_codes c
       JOIN users u ON u.id = c.user_id
      WHERE upper(c.code) = $1
      LIMIT 1`,
    [normalized],
  );
  return rows[0] || null;
}

async function recordVisit(codeRow, { visitId, utmSource, utmMedium, utmCampaign }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO referral_visits (
       referral_code_id, referrer_user_id, anonymous_visit_id, utm_source, utm_medium, utm_campaign
     ) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (referral_code_id, anonymous_visit_id)
     DO UPDATE SET hit_count = referral_visits.hit_count + 1
     RETURNING id, anonymous_visit_id`,
    [
      codeRow.id,
      codeRow.user_id,
      visitId,
      utmSource || null,
      utmMedium || null,
      utmCampaign || null,
    ],
  );
  return rows[0];
}

async function captureVisit({ code, cookieToken, utmSource, utmMedium, utmCampaign }) {
  const codeRow = await findActiveCode(code);
  if (!codeRow || codeRow.is_active === false || !isEligibleReferralRole(codeRow.role)) {
    return { ok: false, reason: "invalid_code" };
  }
  const existing = readCookieToken(cookieToken);
  const now = Date.now();
  const preserved = resolveAttributionSource({ cookie: existing, manualCode: null, now });
  const visitId = preserved?.visitId || crypto.randomUUID();
  await recordVisit(codeRow, { visitId, utmSource, utmMedium, utmCampaign });
  const policy = await getCurrentPolicy();
  if (preserved) {
    return { ok: true, preserved: true, programEnabled: Boolean(policy?.enabled) };
  }
  if (!policy?.enabled) {
    return { ok: true, preserved: false, programEnabled: false, cookie: null };
  }
  return {
    ok: true,
    preserved: false,
    programEnabled: true,
    cookie: buildAttributionCookie(codeRow.code, visitId, now),
  };
}

async function attachOnRegistration({ userId, role, phone, fullName, manualCode, cookieToken }, client = pool) {
  if (!isEligibleReferralRole(role)) return { attached: false, reason: "role_excluded" };
  const policy = await getCurrentPolicy(client);
  if (!policy?.enabled) return { attached: false, reason: "program_disabled" };
  const choice = resolveAttributionSource({
    cookie: readCookieToken(cookieToken),
    manualCode,
    now: Date.now(),
  });
  if (!choice) return { attached: false, reason: "no_attribution" };
  const codeRow = await findActiveCode(choice.code, client);
  if (!codeRow || codeRow.is_active === false || !isEligibleReferralRole(codeRow.role)) {
    return { attached: false, reason: "invalid_code" };
  }
  if (Number(codeRow.user_id) === Number(userId)) {
    return { attached: false, reason: "self_referral" };
  }
  if (normalizePhone(phone) && normalizePhone(phone) === normalizePhone(codeRow.phone)) {
    await client.query(
      `INSERT INTO referral_review_flags (referrer_user_id, referred_user_id, reason)
       VALUES ($1, $2, 'matching_phone')`,
      [codeRow.user_id, userId],
    );
    return { attached: false, reason: "self_referral_phone" };
  }
  const referrerName = `${codeRow.first_name || ""} ${codeRow.family_name || ""}`.replace(/\s+/g, " ").trim();
  if (fullName && referrerName && fullName === referrerName) {
    await client.query(
      `INSERT INTO referral_review_flags (referrer_user_id, referred_user_id, reason)
       VALUES ($1, $2, 'matching_name')`,
      [codeRow.user_id, userId],
    );
  }
  try {
    const inserted = await client.query(
      `INSERT INTO user_referrals (
         referrer_user_id, referred_user_id, referral_code_id, policy_version_id, attribution_source
       ) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (referred_user_id) DO NOTHING
       RETURNING id`,
      [codeRow.user_id, userId, codeRow.id, policy.id, choice.source],
    );
    if (!inserted.rows[0]) return { attached: false, reason: "already_referred" };
    if (choice.visitId) {
      await client.query(
        `UPDATE referral_visits
            SET converted_at = COALESCE(converted_at, NOW()),
                converted_user_id = COALESCE(converted_user_id, $3)
          WHERE referral_code_id = $1 AND anonymous_visit_id = $2`,
        [codeRow.id, choice.visitId, userId],
      );
    }
    try {
      await notificationService.createNotification({
        recipientUserId: Number(codeRow.user_id),
        recipientRole: codeRow.role,
        actorUserId: null,
        type: "referral.registration",
        title: "تسجيل إحالة جديد",
        message: "انضم مستخدم جديد عبر رابط الإحالة الخاص بك.",
        entityType: "referral",
        entityId: Number(inserted.rows[0].id),
        link: "/dashboard/referrals",
        priority: "medium",
        metadata: { titleEn: "New referral registration", messageEn: "A new user joined through your referral link." },
        dedupeKey: `referral_registration_${userId}`,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ component: "referral", event: "registration_notify_failed", message: error?.message }));
    }
    return {
      attached: true,
      referralId: Number(inserted.rows[0].id),
      policyVersionId: policy.id,
      source: choice.source,
    };
  } catch (error) {
    if (error?.code === "23514") return { attached: false, reason: "self_referral" };
    throw error;
  }
}

async function getOwnReferralLink(userId, role) {
  const row = await ensureReferralCode(userId, role);
  if (!row) return null;
  const policy = await getCurrentPolicy();
  return {
    code: row.code,
    path: `/ref/${row.code}`,
    programEnabled: Boolean(policy?.enabled),
  };
}

module.exports = {
  COOKIE_NAME,
  findActiveCode,
  captureVisit,
  attachOnRegistration,
  getOwnReferralLink,
};
