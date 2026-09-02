/**
 * Provision Android PreRelease QA freelancers on Production (explicit operator request).
 *
 * Creates / updates ONLY:
 *   - qa.android.starter@orderzhouse.com  → marketplace STARTER (active)
 *   - qa.android.silver@orderzhouse.com   → marketplace SILVER (active)
 *
 * Usage (from backend/):
 *   ALLOW_PRODUCTION_OPERATIONAL_SCRIPT=1 ^
 *   CONFIRM_PRODUCTION_OPERATIONAL_SCRIPT=orderzhouse-production ^
 *   node scripts/provisionAndroidQaFreelancers.js
 *
 * Password via env (never logged):
 *   ANDROID_QA_PASSWORD=...
 */
const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { assertOperationalScriptAllowed } = require("../src/utils/databaseEnvironmentSafety");
try {
  assertOperationalScriptAllowed("provisionAndroidQaFreelancers.js");
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}

const bcrypt = require("bcrypt");
const { pool } = require("../src/config/db");
const { ensureUserRole } = require("../src/services/rbacService");
const marketplaceMembershipPlansService = require("../src/services/marketplaceMembershipPlansService");
const marketplaceMembershipsService = require("../src/services/marketplaceMembershipsService");
const subscriptionsService = require("../src/services/subscriptionsService");

const BCRYPT_ROUNDS = 12;
const ACCOUNT_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const ACCOUNTS = [
  {
    email: "qa.android.starter@orderzhouse.com",
    tierCode: "starter",
    legacyPlanName: "orderzhouse_free",
    firstName: "اختبار",
    fatherName: "اندرويد",
    familyName: "ستارتر",
    phone: "+962790008801",
  },
  {
    email: "qa.android.silver@orderzhouse.com",
    tierCode: "silver",
    legacyPlanName: "orderzhouse_50_jod",
    firstName: "اختبار",
    fatherName: "اندرويد",
    familyName: "سيلفر",
    phone: "+962790008802",
  },
];

function generateAccountIdCandidate() {
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    out += ACCOUNT_ID_CHARS[crypto.randomInt(0, ACCOUNT_ID_CHARS.length)];
  }
  return out;
}

async function generateUniqueAccountId() {
  for (let i = 0; i < 50; i += 1) {
    const id = generateAccountIdCandidate();
    const { rowCount } = await pool.query("SELECT 1 FROM users WHERE account_id = $1", [id]);
    if (rowCount === 0) return id;
  }
  throw new Error("Could not allocate account_id.");
}

async function upsertFreelancer({ email, firstName, fatherName, familyName, phone, passwordHash }) {
  const normalizedEmail = email.trim().toLowerCase();
  const { rows: existing } = await pool.query(
    `SELECT id, email, role, account_id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [normalizedEmail],
  );

  if (existing[0]) {
    const user = existing[0];
    await pool.query(
      `UPDATE users SET
         role = 'freelancer',
         first_name = $2,
         father_name = $3,
         family_name = $4,
         password_hash = $5,
         phone = $6,
         whatsapp = $6,
         country = 'JO',
         gender = 'ذكر',
         terms_accepted = TRUE,
         email_verified = TRUE,
         is_active = TRUE,
         freelancer_categories = COALESCE(freelancer_categories, ARRAY['content_writing']::text[]),
         updated_at = NOW()
       WHERE id = $1`,
      [user.id, firstName, fatherName, familyName, passwordHash, phone],
    );
    await ensureUserRole({ userId: user.id, roleName: "freelancer" });
    return { id: String(user.id), email: normalizedEmail, accountId: user.account_id, created: false };
  }

  const accountId = await generateUniqueAccountId();
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, first_name, father_name, family_name, email, password_hash, role,
       country, phone, whatsapp, gender, terms_accepted, freelancer_categories,
       email_verified, is_active
     ) VALUES ($1,$2,$3,$4,$5,$6,'freelancer','JO',$7,$7,'ذكر',TRUE,ARRAY['content_writing']::text[],TRUE,TRUE)
     RETURNING id, email, account_id`,
    [accountId, firstName, fatherName, familyName, normalizedEmail, passwordHash, phone],
  );
  const user = rows[0];
  await ensureUserRole({ userId: user.id, roleName: "freelancer" });
  return { id: String(user.id), email: user.email, accountId: user.account_id, created: true };
}

async function assignLegacyPlanIfPresent(freelancerUserId, planName, actorUserId) {
  const { rows: plans } = await pool.query(
    `SELECT id, name, title FROM plans
     WHERE (name = $1 OR title = $1) AND deleted_at IS NULL AND is_active = TRUE
     LIMIT 1`,
    [planName],
  );
  if (!plans[0]) {
    return { assigned: false, reason: "plan_not_found", planName };
  }
  const assigned = await subscriptionsService.assignPlanToFreelancer({
    actorUserId,
    freelancerUserId: String(freelancerUserId),
    planId: String(plans[0].id),
    notes: "provisionAndroidQaFreelancers.js (Android PreRelease QA)",
  });
  try {
    await subscriptionsService.activateCompanyApprovalForSubscription({
      actorUserId,
      subscriptionId: assigned.subscription.id,
      actorRole: "super_admin",
      overrideReason: "Android PreRelease QA account provisioning",
    });
  } catch (err) {
    return {
      assigned: true,
      planName: plans[0].name,
      subscriptionId: String(assigned.subscription.id),
      companyActivation: "skipped",
      companyActivationError: err?.publicCode || err?.message || "unknown",
    };
  }
  return {
    assigned: true,
    planName: plans[0].name,
    subscriptionId: String(assigned.subscription.id),
    companyActivation: "ok",
  };
}

async function activateMarketplaceTier(freelancerUserId, tierCode, actorUserId) {
  const plan = await marketplaceMembershipPlansService.getMarketplaceMembershipPlanByTierCode(tierCode);
  if (!plan?.id) {
    throw new Error(`Marketplace plan missing for tier=${tierCode}`);
  }

  const current =
    await marketplaceMembershipsService.resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId);
  const currentTier = String(current?.plan?.tierCode || "").toLowerCase();
  const currentStatus = String(current?.status || "").toLowerCase();
  if (currentTier === tierCode && ["active", "grace"].includes(currentStatus)) {
    return {
      tierCode,
      marketplacePlanId: String(plan.id),
      membershipId: String(current.id),
      status: currentStatus,
      reused: true,
    };
  }

  const out = await marketplaceMembershipsService.createAndActivateMarketplaceMembership({
    freelancerUserId: Number(freelancerUserId),
    marketplacePlanId: Number(plan.id),
    source: "admin",
    actorUserId: actorUserId ? Number(actorUserId) : null,
    skipVerification: true,
    notes: `Android PreRelease QA — ${tierCode}`,
    autoRenew: false,
  });
  return {
    tierCode,
    marketplacePlanId: String(plan.id),
    membershipId: String(out.membership?.id || out.id || ""),
    status: out.membership?.status || out.status || "active",
    reused: false,
  };
}

async function main() {
  const password = String(process.env.ANDROID_QA_PASSWORD || "").trim();
  if (!password || password.length < 8) {
    console.error("Set ANDROID_QA_PASSWORD (min 8 chars). Password is never logged.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const { rows: admins } = await pool.query(
    `SELECT id FROM users WHERE role IN ('admin','super_admin') ORDER BY id ASC LIMIT 1`,
  );
  const actorUserId = admins[0]?.id || null;

  const results = [];
  for (const account of ACCOUNTS) {
    const user = await upsertFreelancer({
      email: account.email,
      firstName: account.firstName,
      fatherName: account.fatherName,
      familyName: account.familyName,
      phone: account.phone,
      passwordHash,
    });
    const membership = await activateMarketplaceTier(user.id, account.tierCode, actorUserId);
    const legacy = await assignLegacyPlanIfPresent(user.id, account.legacyPlanName, actorUserId);
    results.push({
      email: user.email,
      userId: user.id,
      accountId: user.accountId,
      created: user.created,
      marketplace: membership,
      legacySubscription: legacy,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        note: "Passwords not printed. QA Android freelancers provisioned.",
        accounts: results,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e?.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
