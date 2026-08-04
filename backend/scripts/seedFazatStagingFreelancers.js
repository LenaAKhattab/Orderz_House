/**
 * Staging/local-only seed for FAZAT rank overlay.
 *
 * Refuses Neon/production-like DATABASE_URL by default.
 * FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT does NOT unlock seed (schema-only).
 *
 * Usage (safe local Postgres):
 *   npm run seed:fazat-staging
 *
 * Optional dedicated remote staging (explicit):
 *   FAZAT_ALLOW_REMOTE_STAGING_DB=1 FAZAT_SEED_CONFIRM=STAGING npm run seed:fazat-staging
 */
require("dotenv").config({ quiet: true });

const { assertSafeFazatDbOrThrow, inspectDatabaseUrl } = require("../src/utils/fazatDbSafety");
const { pool } = require("../src/config/db");
const fazatFreelancerProfileService = require("../src/services/fazatFreelancerProfileService");
const { PARTNER_CODE } = require("../src/config/fazatIntegration");

async function pickFreelancers(count) {
  const pinned = [
    process.env.FAZAT_SEED_UNAPPROVED_ID,
    process.env.FAZAT_SEED_APPROVED_ID,
    process.env.FAZAT_SEED_TRUSTED_ID,
  ]
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (pinned.length === 3) {
    const { rows } = await pool.query(
      `SELECT id, email, account_id, first_name, family_name, role, is_active
       FROM users WHERE id = ANY($1::bigint[]) AND role = 'freelancer'`,
      [pinned],
    );
    if (rows.length !== 3) {
      throw new Error("Pinned FAZAT_SEED_*_ID values must be three active freelancers.");
    }
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    return pinned.map((id) => byId.get(id));
  }

  const { rows } = await pool.query(
    `SELECT id, email, account_id, first_name, family_name, role, is_active
     FROM users
     WHERE role = 'freelancer' AND is_active = TRUE
     ORDER BY id ASC
     LIMIT $1`,
    [count],
  );
  if (rows.length < count) {
    throw new Error(`Need at least ${count} active freelancers to seed FAZAT ranks.`);
  }
  return rows;
}

(async () => {
  const inspect = inspectDatabaseUrl();
  console.log(
    JSON.stringify(
      {
        phase: "seed:fazat-staging",
        host: inspect.host,
        dbName: inspect.dbName,
        safe: inspect.safeForMigrationOrSeed,
        reason: inspect.reason,
      },
      null,
      2,
    ),
  );

  assertSafeFazatDbOrThrow("seed:fazat-staging");

  await pool.query(
    `INSERT INTO integration_partners (code, name, enabled)
     VALUES ($1, 'FAZ3AT', TRUE)
     ON CONFLICT (code) DO UPDATE SET enabled = TRUE, updated_at = NOW()`,
    [PARTNER_CODE],
  );

  const [u, a, t] = await pickFreelancers(3);
  const ranks = [
    { row: u, rank: "UNAPPROVED" },
    { row: a, rank: "APPROVED" },
    { row: t, rank: "TRUSTED" },
  ];

  const out = [];
  for (const item of ranks) {
    const profile = await fazatFreelancerProfileService.upsertRank({
      freelancerId: item.row.id,
      rank: item.rank,
      notesInternal: `fazat staging seed ${item.rank}`,
    });
    out.push({
      email: item.row.email,
      freelancerId: String(item.row.id),
      publicCode: profile.publicCode,
      rank: profile.rank,
      isAssignable: profile.isAssignable,
    });
  }

  console.log(JSON.stringify({ ok: true, partnerCode: PARTNER_CODE, seeded: out }, null, 2));
  await pool.end();
})().catch(async (err) => {
  console.error("[seed:fazat-staging] FAIL", err && err.message ? err.message : err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
