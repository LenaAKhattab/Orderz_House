/**
 * Inspect + optional dry-run/backfill of freelancer_member_id for LEGACY_INVITE users.
 *
 * Default: READ-ONLY inspect (safe on Production).
 * Backfill writes: STAGING only via --apply (refuses Production).
 *
 * Usage (from backend/):
 *   node scripts/inspectLegacyFreelancerMemberIdBackfill.js
 *   node scripts/inspectLegacyFreelancerMemberIdBackfill.js --apply   # staging only
 *
 * Never logs full national IDs.
 */
const {
  maskFreelancerMemberId,
  normalizeNationalId,
  isValidJordanNationalId,
  isSmokeOrInternalLegacyAccount,
} = require("../src/utils/legacyFreelancerMemberId");
const {
  assertNonProductionDatabase,
  classifyDatabaseUrl,
  maskDatabaseTarget,
  KNOWN_PRODUCTION_HOST_MARKERS,
} = require("../src/utils/databaseEnvironmentSafety");

const APPLY = process.argv.includes("--apply");

function extractNationalIdFromJson(valueJson) {
  if (valueJson == null) return null;
  let v = valueJson;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return normalizeNationalId(v);
    }
  }
  if (typeof v === "object" && v !== null && Object.prototype.hasOwnProperty.call(v, "value")) {
    v = v.value;
  }
  return normalizeNationalId(v);
}

async function main() {
  require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });
  const { pool } = require("../src/config/db");
  const classified = classifyDatabaseUrl();
  const host = String(classified.host || "").toLowerCase();
  const isProdHost = KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase()));

  console.log(
    JSON.stringify({
      mode: APPLY ? "apply" : "inspect",
      target: maskDatabaseTarget(classified),
      isProdHost,
    }),
  );

  if (APPLY) {
    assertNonProductionDatabase("legacy freelancer_member_id backfill");
    if (isProdHost) {
      throw new Error("Refusing --apply against Production host.");
    }
  }

  // Column presence
  const { rows: hasCol } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'freelancer_member_id'
     ) AS ok`,
  );
  if (!hasCol[0]?.ok) {
    console.log(
      JSON.stringify({
        status: "COLUMN_MISSING",
        message: "freelancer_member_id not present — apply migration 189 first (staging only).",
        backfillNeeded: false,
      }),
    );
    await pool.end();
    return;
  }

  const { rows: legacyUsers } = await pool.query(
    `SELECT u.id, u.email, u.freelancer_member_id, u.onboarding_source,
            r.internal_reference, r.metadata,
            a.value_json AS national_id_json
       FROM users u
       LEFT JOIN legacy_freelancer_invite_redemptions r ON r.user_id = u.id
       LEFT JOIN legacy_freelancer_invite_answers a
         ON a.user_id = u.id AND a.field_key = 'national_id'
      WHERE u.onboarding_source = 'LEGACY_INVITE'
      ORDER BY u.id ASC`,
  );

  const candidates = [];
  const skippedSmoke = [];
  const alreadySet = [];
  const invalidOrMissing = [];

  for (const row of legacyUsers) {
    const smoke = isSmokeOrInternalLegacyAccount({
      email: row.email,
      internalReference: row.internal_reference,
      metadata: row.metadata,
    });
    if (smoke) {
      skippedSmoke.push({ userId: String(row.id), reason: "SMOKE_OR_INTERNAL" });
      continue;
    }
    const nid = extractNationalIdFromJson(row.national_id_json);
    if (row.freelancer_member_id) {
      alreadySet.push({
        userId: String(row.id),
        masked: maskFreelancerMemberId(row.freelancer_member_id),
      });
      continue;
    }
    if (!isValidJordanNationalId(nid)) {
      invalidOrMissing.push({ userId: String(row.id), hasAnswer: nid != null });
      continue;
    }
    candidates.push({ userId: Number(row.id), nationalId: nid });
  }

  const summary = {
    legacyUserCount: legacyUsers.length,
    alreadySet: alreadySet.length,
    skippedSmoke: skippedSmoke.length,
    invalidOrMissing: invalidOrMissing.length,
    candidates: candidates.length,
    backfillNeeded: candidates.length > 0,
  };
  console.log(JSON.stringify({ summary, skippedSmokeSample: skippedSmoke.slice(0, 5) }));

  if (!APPLY) {
    console.log(
      JSON.stringify({
        status: candidates.length === 0 ? "NO_BACKFILL_NEEDED" : "BACKFILL_CANDIDATES_FOUND_DRY_RUN",
        note: "Full national IDs not printed. Re-run with --apply on staging only to write.",
      }),
    );
    await pool.end();
    return;
  }

  let updated = 0;
  for (const c of candidates) {
    const { rowCount } = await pool.query(
      `UPDATE users
          SET freelancer_member_id = $2
        WHERE id = $1
          AND onboarding_source = 'LEGACY_INVITE'
          AND freelancer_member_id IS NULL`,
      [c.userId, c.nationalId],
    );
    if (rowCount) updated += 1;
  }

  console.log(JSON.stringify({ status: "BACKFILL_APPLIED", updated, maskedSample: candidates.slice(0, 3).map((c) => maskFreelancerMemberId(c.nationalId)) }));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err.message || err);
  try {
    const { pool } = require("../src/config/db");
    await pool.end();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
