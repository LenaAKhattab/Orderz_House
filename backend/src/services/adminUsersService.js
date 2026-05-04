const { pool } = require("../config/db");
const subscriptionsService = require("./subscriptionsService");

function mapFreelancerRegistrationProfile(row) {
  if (!row) return null;
  const cats = Array.isArray(row.freelancer_categories) ? row.freelancer_categories : [];
  return {
    id: String(row.id),
    accountId: row.account_id,
    firstName: row.first_name,
    fatherName: row.father_name,
    familyName: row.family_name,
    email: row.email,
    country: row.country,
    phone: row.phone,
    whatsapp: row.whatsapp,
    gender: row.gender,
    termsAccepted: Boolean(row.terms_accepted),
    freelancerCategories: cats,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildDisplayName(firstName, fatherName, familyName) {
  return [firstName, fatherName, familyName]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ");
}

function eligibilityReasonAr(reason) {
  const r = String(reason || "").trim();
  const map = {
    no_subscription: "لا يوجد اشتراك حالي",
    payment_not_completed: "الدفع غير مكتمل",
    company_activation_pending: "في انتظار موافقة الشركة",
    expired: "اشتراك منتهٍ",
    invalid_status: "اشتراك غير نشط",
    status_inactive: "اشتراك غير نشط",
    status_cancelled: "اشتراك ملغى",
  };
  return map[r] || "يتطلب اشتراك نشط";
}

function subscriptionSummaryFromMapped(mappedSub) {
  if (!mappedSub) return null;
  return {
    status: mappedSub.status || null,
    activationStatus: mappedSub.activationStatus || null,
    paymentStatus: mappedSub.paymentStatus || null,
    isCurrent: mappedSub.isCurrent === true,
  };
}

/**
 * Admin assignment picker: freelancers (legacy role or RBAC), search, eligibility metadata.
 *
 * @param {object} opts
 * @param {string} [opts.search]
 * @param {string} [opts.q] legacy alias for search
 * @param {number} [opts.limit] default 50, max 100
 * @param {boolean} [opts.eligibleOnly] only users who can be assigned right now
 * @param {boolean} [opts.onlyActiveSubscription] legacy alias for eligibleOnly
 * @param {string} [opts.status] `all` | `active` | `inactive` — filter account `is_active`
 */
async function searchFreelancers({
  search = "",
  q = "",
  limit = 50,
  eligibleOnly = false,
  onlyActiveSubscription = false,
  status = "all",
} = {}) {
  const queryText = String(search || q || "").trim();
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const wantEligibleOnly = Boolean(eligibleOnly) || String(onlyActiveSubscription || "").toLowerCase() === "true";
  const statusFilter = String(status || "all").trim().toLowerCase();
  const fetchLimit = wantEligibleOnly ? Math.min(lim * 10, 500) : lim;

  let useRbac = true;
  try {
    await pool.query(`SELECT 1 FROM user_roles LIMIT 1`);
  } catch (e) {
    if (e && e.code === "42P01") useRbac = false;
    else throw e;
  }

  const roleClause = useRbac
    ? `(
        u.role = 'freelancer'
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          INNER JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id AND r.name = 'freelancer'
        )
      )`
    : `u.role = 'freelancer'`;

  const values = [];
  const where = [roleClause];
  let i = 1;

  if (statusFilter === "active") {
    where.push(`u.is_active = TRUE`);
  } else if (statusFilter === "inactive") {
    where.push(`u.is_active = FALSE`);
  }

  if (queryText) {
    const like = `%${queryText.toLowerCase()}%`;
    values.push(like);
    const p = `$${i}`;
    i += 1;
    const idSearch = /^\d+$/.test(queryText) ? ` OR CAST(u.id AS TEXT) LIKE ${p}` : "";
    where.push(`(
      lower(u.email) LIKE ${p}
      OR lower(COALESCE(u.first_name, '')) LIKE ${p}
      OR lower(COALESCE(u.father_name, '')) LIKE ${p}
      OR lower(COALESCE(u.family_name, '')) LIKE ${p}
      OR lower(COALESCE(u.account_id::text, '')) LIKE ${p}
      ${idSearch}
    )`);
  }

  values.push(fetchLimit);

  const { rows: userRows } = await pool.query(
    `SELECT u.id, u.account_id, u.first_name, u.father_name, u.family_name, u.email, u.is_active,
            COALESCE(u.email_verified, TRUE) AS email_verified,
            u.role AS legacy_role,
            ${
              useRbac
                ? `EXISTS (
              SELECT 1 FROM user_roles ur
              INNER JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = u.id AND r.name = 'freelancer'
            ) AS has_freelancer_rbac,`
                : `FALSE AS has_freelancer_rbac,`
            }
            u.avatar_url
     FROM users u
     WHERE ${where.join(" AND ")}
     ORDER BY u.is_active DESC, u.id DESC
     LIMIT $${i}`,
    values,
  );

  if (!userRows.length) return [];

  const ids = userRows.map((r) => Number(r.id));
  const { rows: subRows } = await pool.query(
    `SELECT fs.*,
            p.name AS plan_name,
            p.title AS plan_title,
            p.duration_days AS plan_duration_days,
            p.price_jod AS plan_price_jod
     FROM freelancer_subscriptions fs
     JOIN plans p ON p.id = fs.plan_id
     WHERE fs.freelancer_user_id = ANY($1::bigint[])
       AND fs.is_current = TRUE`,
    [ids],
  );
  const subByFreelancer = new Map();
  for (const row of subRows) {
    const fid = Number(row.freelancer_user_id);
    if (!subByFreelancer.has(fid)) subByFreelancer.set(fid, row);
  }

  const out = [];
  for (const u of userRows) {
    const legacy = String(u.legacy_role || "").trim() === "freelancer";
    const isFreelancer = legacy || Boolean(u.has_freelancer_rbac);
    const mappedSub = subByFreelancer.has(Number(u.id))
      ? subscriptionsService.mapSubscription(subByFreelancer.get(Number(u.id)))
      : null;
    const eligibility = subscriptionsService.evaluateFreelancerTakeOrdersEligibility(mappedSub);

    const emailVerified = Boolean(u.email_verified);
    const isActive = Boolean(u.is_active);
    let ineligibleReason = null;
    if (!isFreelancer) ineligibleReason = "ليس حساب مستقل";
    else if (!isActive) ineligibleReason = "الحساب معطل";
    else if (!emailVerified) ineligibleReason = "البريد غير موثّق";
    else if (!eligibility.eligible) ineligibleReason = eligibilityReasonAr(eligibility.reason);

    const assignable = isFreelancer && isActive && emailVerified && eligibility.eligible;
    const displayName = buildDisplayName(u.first_name, u.father_name, u.family_name);

    out.push({
      id: String(u.id),
      accountId: u.account_id != null ? String(u.account_id) : null,
      displayName: displayName || String(u.email || ""),
      fullName: displayName,
      /** @deprecated use displayName — kept for older admin UIs */
      name: displayName || String(u.email || ""),
      firstName: u.first_name,
      fatherName: u.father_name,
      familyName: u.family_name,
      email: u.email,
      status: isActive ? "active" : "inactive",
      emailVerified,
      subscription: subscriptionSummaryFromMapped(mappedSub),
      assignable,
      ineligibleReason: assignable ? null : ineligibleReason,
      avatarUrl: u.avatar_url || null,
    });
  }

  if (wantEligibleOnly) {
    return out.filter((x) => x.assignable).slice(0, lim);
  }
  return out.slice(0, lim);
}

async function getFreelancerRegistrationProfileForAdmin(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return null;
  const { rows } = await pool.query(
    `SELECT id, account_id, first_name, father_name, family_name, email, role, country, phone, whatsapp, gender,
            terms_accepted, freelancer_categories, is_active, created_at, updated_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.role !== "freelancer") {
    const err = new Error("Profile is only available for freelancer accounts.");
    err.statusCode = 400;
    throw err;
  }
  return mapFreelancerRegistrationProfile(row);
}

module.exports = {
  searchFreelancers,
  getFreelancerRegistrationProfileForAdmin,
};
