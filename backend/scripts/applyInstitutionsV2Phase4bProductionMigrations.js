/**
 * Institutions V2 Phase 4B — apply migrations 192/193/194 to Production Neon ONLY.
 * Never prints passwords or full connection URLs.
 *
 * Usage (backend/):
 *   node scripts/applyInstitutionsV2Phase4bProductionMigrations.js
 */
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const {
  classifyDatabaseUrl,
  maskDatabaseTarget,
  KNOWN_PRODUCTION_HOST_MARKERS,
} = require("../src/utils/databaseEnvironmentSafety");

function assertProductionTarget() {
  const c = classifyDatabaseUrl();
  const host = String(c.host || "").toLowerCase();
  const isProd = KNOWN_PRODUCTION_HOST_MARKERS.some((m) =>
    host.includes(String(m).toLowerCase()),
  );
  if (!isProd || !host.includes("wandering-cherry")) {
    throw new Error(
      `REFUSED: expected Production Neon (wandering-cherry). Got host=${c.host || "?"} class=${c.classification}`,
    );
  }
  if (host.includes("solitary-band")) {
    throw new Error("REFUSED: staging host solitary-band");
  }
  return {
    host: c.host,
    database: c.database,
    masked: maskDatabaseTarget(process.env.DATABASE_URL || process.env.DIRECT_URL),
    classification: c.classification,
  };
}

async function migrationApplied(pool, version) {
  const { rows } = await pool.query(
    `SELECT 1 FROM schema_migrations WHERE version = $1 LIMIT 1`,
    [version],
  );
  return Boolean(rows[0]);
}

async function applySqlFile(pool, fileName) {
  const full = path.join(__dirname, "..", "sql", "migrations", fileName);
  const sql = fs.readFileSync(full, "utf8");
  await pool.query(sql);
}

(async () => {
  const target = assertProductionTarget();
  console.log(
    JSON.stringify({
      phase: "4B",
      target: target.masked,
      host: target.host,
      database: target.database,
      classification: target.classification,
    }),
  );

  const { pool } = require("../src/config/db");

  // Campaign 2 before (institution_id may not exist yet)
  let campBefore = [];
  {
    const hasInstCol = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'legacy_freelancer_invite_campaigns'
          AND column_name = 'institution_id'
        LIMIT 1`,
    );
    if (hasInstCol.rows[0]) {
      const r = await pool.query(
        `SELECT id, slug, is_active, max_redemptions, used_count, expires_at,
                institution_id IS NULL AS institution_null,
                length(secure_token_hash) AS token_hash_len
           FROM legacy_freelancer_invite_campaigns
          WHERE id = 2`,
      );
      campBefore = r.rows;
    } else {
      const r = await pool.query(
        `SELECT id, slug, is_active, max_redemptions, used_count, expires_at,
                TRUE AS institution_null,
                length(secure_token_hash) AS token_hash_len
           FROM legacy_freelancer_invite_campaigns
          WHERE id = 2`,
      );
      campBefore = r.rows;
    }
  }
  console.log("campaign2_before", JSON.stringify(campBefore[0] || null));

  const versions = [
    ["192_legacy_campaign_institution", "192_legacy_campaign_institution.sql"],
    ["193_orders_institution_id", "193_orders_institution_id.sql"],
    ["194_marketplace_articles_institution", "194_marketplace_articles_institution.sql"],
  ];

  for (const [version] of versions) {
    const applied = await migrationApplied(pool, version);
    console.log(`precheck ${version}: ${applied ? "ALREADY_APPLIED" : "PENDING"}`);
  }

  // 192
  if (!(await migrationApplied(pool, "192_legacy_campaign_institution"))) {
    await applySqlFile(pool, "192_legacy_campaign_institution.sql");
    console.log("applied 192");
  } else {
    console.log("skip 192 already applied");
  }
  {
    const { rows } = await pool.query(
      `SELECT column_name, is_nullable, data_type
         FROM information_schema.columns
        WHERE table_name = 'legacy_freelancer_invite_campaigns'
          AND column_name = 'institution_id'`,
    );
    console.log("verify_192_column", JSON.stringify(rows[0] || null));
    const { rows: idx } = await pool.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'legacy_freelancer_invite_campaigns'
          AND indexname = 'lfic_institution_id_idx'`,
    );
    console.log("verify_192_index", Boolean(idx[0]));
  }

  // 193 with backfill reporting
  let backfill = { examined: null, backfilled: null, ambiguousLeftNull: null };
  if (!(await migrationApplied(pool, "193_orders_institution_id"))) {
    // Pre-counts cannot reference orders.institution_id (column not yet present).
    const { rows: examinedRows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM orders
        WHERE visibility_scope = 'institution'
          AND institutional_storage_id IS NOT NULL`,
    );
    const { rows: sole } = await pool.query(
      `SELECT COUNT(*)::int AS c
         FROM orders o
         JOIN (
           SELECT si.storage_id
             FROM institutional_storage_institutions si
            GROUP BY si.storage_id
           HAVING COUNT(*) = 1
         ) s ON s.storage_id = o.institutional_storage_id
        WHERE o.visibility_scope = 'institution'`,
    );
    const { rows: ambiguous } = await pool.query(
      `SELECT COUNT(*)::int AS c
         FROM orders o
         JOIN (
           SELECT si.storage_id
             FROM institutional_storage_institutions si
            GROUP BY si.storage_id
           HAVING COUNT(*) > 1
         ) s ON s.storage_id = o.institutional_storage_id
        WHERE o.visibility_scope = 'institution'`,
    );
    backfill.examined = Number(examinedRows[0]?.c || 0);
    const eligible = Number(sole[0]?.c || 0);
    backfill.ambiguousLeftNull = Number(ambiguous[0]?.c || 0);

    await applySqlFile(pool, "193_orders_institution_id.sql");

    const { rows: filled } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM orders
        WHERE visibility_scope = 'institution'
          AND institution_id IS NOT NULL`,
    );
    backfill.backfilled = Number(filled[0]?.c || 0);
    console.log(
      "applied 193",
      JSON.stringify({ ...backfill, eligibleSoleStorage: eligible }),
    );
  } else {
    console.log("skip 193 already applied");
  }
  {
    const { rows } = await pool.query(
      `SELECT column_name, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'institution_id'`,
    );
    console.log("verify_193_column", JSON.stringify(rows[0] || null));
  }

  // 194
  if (!(await migrationApplied(pool, "194_marketplace_articles_institution"))) {
    const { rows: beforePublic } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_articles`,
    ).catch(() => ({ rows: [{ c: null }] }));
    await applySqlFile(pool, "194_marketplace_articles_institution.sql");
    const { rows: scopes } = await pool.query(
      `SELECT visibility_scope, COUNT(*)::int AS c
         FROM marketplace_articles
        GROUP BY visibility_scope
        ORDER BY visibility_scope`,
    );
    console.log(
      "applied 194",
      JSON.stringify({ articlesBefore: beforePublic[0]?.c, scopes }),
    );
  } else {
    console.log("skip 194 already applied");
  }
  {
    const { rows } = await pool.query(
      `SELECT column_name, column_default, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'marketplace_articles'
          AND column_name IN ('institution_id', 'visibility_scope')
        ORDER BY column_name`,
    );
    console.log("verify_194_columns", JSON.stringify(rows));
    const { rows: instScoped } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_articles
        WHERE visibility_scope = 'institution'`,
    );
    console.log("verify_194_no_accidental_institution_scope", Number(instScoped[0]?.c || 0));
  }

  // Campaign 2 after
  const { rows: campAfter } = await pool.query(
    `SELECT id, slug, is_active, max_redemptions, used_count, expires_at,
            institution_id IS NULL AS institution_null,
            length(secure_token_hash) AS token_hash_len
       FROM legacy_freelancer_invite_campaigns
      WHERE id = 2`,
  );
  console.log("campaign2_after", JSON.stringify(campAfter[0] || null));

  const { rows: recorded } = await pool.query(
    `SELECT version FROM schema_migrations
      WHERE version IN (
        '192_legacy_campaign_institution',
        '193_orders_institution_id',
        '194_marketplace_articles_institution'
      )
      ORDER BY version`,
  );
  console.log("recorded_migrations", recorded.map((r) => r.version));

  const before = campBefore[0] || {};
  const after = campAfter[0] || {};
  const campOk =
    String(after.id) === "2" &&
    after.slug === "legacy-freelancers-2026" &&
    after.is_active === true &&
    Number(after.max_redemptions) === Number(before.max_redemptions) &&
    Number(after.used_count) === Number(before.used_count) &&
    Number(after.token_hash_len) === Number(before.token_hash_len) &&
    after.institution_null === true;

  console.log(
    JSON.stringify({
      status: campOk ? "MIGRATIONS_OK_CAMPAIGN2_PRESERVED" : "MIGRATIONS_OK_CAMPAIGN2_CHECK_FAILED",
      backfill193: backfill,
      campaign2Preserved: campOk,
    }),
  );

  await pool.end();
  if (!campOk) process.exit(2);
})().catch((e) => {
  console.error("FAILED", e && e.message ? e.message : e);
  process.exit(1);
});
