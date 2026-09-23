/**
 * Apply Migration 196 (legacy_work_areas) on STAGING only + integrity verification.
 * Also applies 195 first if missing (earlier additive Legacy campaign workspace).
 * Never Production. No PII logged.
 *
 * Usage (from backend/):
 *   node scripts/applyLegacyWorkAreas196Staging.js
 */
const path = require("node:path");
const fs = require("node:fs");

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  assertDatabaseWritable,
  assertStagingWriteProbe,
  printStagingBanner,
} = require("../src/config/stagingQaEnv");
const {
  assertNonProductionDatabase,
  classifyDatabaseUrl,
  maskDatabaseTarget,
  scanSqlForDangerousStatements,
  KNOWN_PRODUCTION_HOST_MARKERS,
} = require("../src/utils/databaseEnvironmentSafety");
const {
  ensureMigrationsTable,
  listAppliedMigrationVersions,
  applyOneMigration,
} = require("./lib/migrationRunnerCore");
const {
  partitionSkillsAndWorkAreas,
  parseDetailedSkillsPrograms,
  normalizeLegacyWorkFields,
} = require("../src/constants/legacyFreelancerWorkFields");

/** Local E.164 helper — avoid importing inviteService (pulls db at load time / circular). */
function composeE164(raw) {
  if (typeof raw === "string" && raw.trim().startsWith("+")) {
    const e164 = String(raw).trim().replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
      throw new Error("VALIDATION_ERROR: invalid E.164");
    }
    return e164;
  }
  throw new Error("VALIDATION_ERROR: phone must be E.164 string");
}

const VERSION_195 = "195_legacy_campaign_workspace";
const FILE_195 = "195_legacy_campaign_workspace.sql";
const VERSION = "196_legacy_work_areas";
const FILE = "196_legacy_work_areas.sql";
const WORK_KEYS = ["content_writing", "design", "programming"];

function refuseProdHost(host) {
  if (KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase()))) {
    throw new Error("Refusing: DATABASE_URL looks like Production.");
  }
  if (host.includes("wandering-cherry")) {
    throw new Error("REFUSED: production host marker wandering-cherry");
  }
  if (!host.includes("solitary-band")) {
    throw new Error("REFUSED: staging host must include solitary-band");
  }
}

function loadMigration(file) {
  const filePath = path.join(__dirname, "..", "sql", "migrations", file);
  const raw = fs.readFileSync(filePath, "utf8");
  const sqlBody = raw
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  const scan = scanSqlForDangerousStatements(sqlBody);
  if (scan.dangerous) {
    throw new Error(`REFUSED: ${file} dangerous findings: ${scan.findings.join(", ")}`);
  }
  return { file, raw, scan };
}

async function snapshotSkillsCounts(client) {
  const { rows } = await client.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE onboarding_source = 'LEGACY_INVITE'
      )::int AS legacy_users,
      COUNT(*) FILTER (
        WHERE onboarding_source = 'LEGACY_INVITE'
          AND skills IS NOT NULL
          AND cardinality(skills) > 0
      )::int AS legacy_with_skills,
      COUNT(*) FILTER (
        WHERE onboarding_source = 'LEGACY_INVITE'
          AND skills IS NOT NULL
          AND skills && $1::text[]
      )::int AS legacy_skills_contain_work_keys,
      COUNT(*) FILTER (
        WHERE onboarding_source = 'LEGACY_INVITE'
          AND skills IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM unnest(skills) s
            WHERE s NOT IN ('content_writing', 'design', 'programming')
          )
      )::int AS legacy_with_detailed_skills,
      COUNT(*) FILTER (
        WHERE onboarding_source = 'LEGACY_INVITE'
          AND skills IS NOT NULL
          AND skills && $1::text[]
          AND EXISTS (
            SELECT 1 FROM unnest(skills) s
            WHERE s NOT IN ('content_writing', 'design', 'programming')
          )
      )::int AS legacy_mixed_skills_and_work_keys
    FROM users
    `,
    [WORK_KEYS],
  );
  // Clarify detailed-only count
  const detailedOnly = await client.query(
    `
    SELECT COUNT(*)::int AS n
      FROM users
     WHERE onboarding_source = 'LEGACY_INVITE'
       AND skills IS NOT NULL
       AND cardinality(skills) > 0
       AND NOT (skills && $1::text[])
    `,
    [WORK_KEYS],
  );
  const workOnly = await client.query(
    `
    SELECT COUNT(*)::int AS n
      FROM users
     WHERE onboarding_source = 'LEGACY_INVITE'
       AND skills IS NOT NULL
       AND skills && $1::text[]
       AND NOT EXISTS (
         SELECT 1 FROM unnest(skills) s
         WHERE s NOT IN ('content_writing', 'design', 'programming')
       )
    `,
    [WORK_KEYS],
  );
  const r = rows[0] || {};
  return {
    legacyUsers: Number(r.legacy_users || 0),
    legacyWithSkills: Number(r.legacy_with_skills || 0),
    legacySkillsContainWorkKeys: Number(r.legacy_skills_contain_work_keys || 0),
    legacyWithDetailedSkills: Number(r.legacy_with_detailed_skills || 0),
    legacyMixed: Number(r.legacy_mixed_skills_and_work_keys || 0),
    legacyWorkKeysOnlyInSkills: Number(workOnly.rows[0]?.n || 0),
    legacyDetailedOnlyInSkills: Number(detailedOnly.rows[0]?.n || 0),
  };
}

async function postMigrationIntegrity(client) {
  const col = await client.query(
    `
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='users' AND column_name='legacy_work_areas'
    ) AS ok
    `,
  );
  const counts = await client.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE onboarding_source = 'LEGACY_INVITE'
          AND legacy_work_areas IS NOT NULL
          AND cardinality(legacy_work_areas) > 0
      )::int AS with_work_areas,
      COUNT(*) FILTER (
        WHERE onboarding_source = 'LEGACY_INVITE'
          AND skills IS NOT NULL
          AND skills && $1::text[]
      )::int AS skills_still_contain_work_keys,
      COUNT(*) FILTER (
        WHERE onboarding_source = 'LEGACY_INVITE'
          AND skills IS NOT NULL
          AND cardinality(skills) > 0
          AND EXISTS (
            SELECT 1 FROM unnest(skills) s
            WHERE s NOT IN ('content_writing', 'design', 'programming')
          )
      )::int AS with_detailed_skills,
      COUNT(*) FILTER (
        WHERE onboarding_source = 'LEGACY_INVITE'
          AND legacy_work_areas IS NOT NULL
          AND skills IS NOT NULL
          AND cardinality(legacy_work_areas) > 0
          AND EXISTS (
            SELECT 1 FROM unnest(skills) s
            WHERE s NOT IN ('content_writing', 'design', 'programming')
          )
      )::int AS with_both_separated
    FROM users
    `,
    [WORK_KEYS],
  );
  return {
    columnExists: col.rows[0]?.ok === true,
    withWorkAreas: Number(counts.rows[0]?.with_work_areas || 0),
    skillsStillContainWorkKeys: Number(counts.rows[0]?.skills_still_contain_work_keys || 0),
    withDetailedSkills: Number(counts.rows[0]?.with_detailed_skills || 0),
    withBothSeparated: Number(counts.rows[0]?.with_both_separated || 0),
  };
}

async function writePathVerification(client, composeE164) {
  const stamp = Date.now().toString(36);
  const email = `legacy.wa196.${stamp}@staging.orderzhouse.test`;
  const phone = composeE164(`+96279${String(Date.now()).slice(-7)}`);
  const workAreas = normalizeLegacyWorkFields(["content_writing", "design"], { required: true });
  const detailed = parseDetailedSkillsPrograms("Photoshop\nIllustrator\ndesign");
  // design stripped from detailed by parser
  const nationalId = String(2000000000 + (Date.now() % 100000000)).slice(0, 10);
  const passwordHash = await require("bcrypt").hash(nationalId, 4);
  const accountId = `W${stamp}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);

  const { rows } = await client.query(
    `
    INSERT INTO users (
      account_id, first_name, father_name, family_name, email, password_hash, role,
      country, phone, whatsapp, gender, terms_accepted, terms_accepted_at,
      privacy_accepted, privacy_accepted_at,
      freelancer_categories, email_verified, is_active,
      onboarding_source, identity_verification_source,
      freelancer_member_id, legacy_entry_method, must_change_password,
      skills, legacy_work_areas
    ) VALUES (
      $1, 'QA', 'Work', 'Areas', $2, $3, 'freelancer',
      'JO', $4, $4, 'ذكر', TRUE, NOW(),
      TRUE, NOW(),
      ARRAY['content_writing']::text[], TRUE, TRUE,
      'LEGACY_INVITE', 'COMPANY_OFFLINE_VERIFIED',
      $5, 'ADMIN_MANUAL', TRUE,
      $6::text[], $7::text[]
    )
    RETURNING id, skills, legacy_work_areas, phone
    `,
    [accountId, email, passwordHash, phone, nationalId, detailed, workAreas],
  );
  const created = rows[0];

  // Update path A: change work areas only
  await client.query(
    `UPDATE users SET legacy_work_areas = $1::text[] WHERE id = $2`,
    [["programming"], created.id],
  );
  const afterWa = await client.query(
    `SELECT skills, legacy_work_areas FROM users WHERE id = $1`,
    [created.id],
  );

  // Update path B: change detailed skills only
  await client.query(
    `UPDATE users SET skills = $1::text[] WHERE id = $2`,
    [["Figma", "Canva"], created.id],
  );
  const afterSkills = await client.query(
    `SELECT skills, legacy_work_areas FROM users WHERE id = $1`,
    [created.id],
  );

  // Profile-style skills replace must not wipe work areas (column isolation)
  const profileSkills = parseDetailedSkillsPrograms("After Effects, Premiere");
  await client.query(`UPDATE users SET skills = $1::text[] WHERE id = $2`, [profileSkills, created.id]);
  const afterProfile = await client.query(
    `SELECT skills, legacy_work_areas FROM users WHERE id = $1`,
    [created.id],
  );

  // Signed docs per-user (if tables exist)
  let signedDocOk = null;
  try {
    const types = await client.query(
      `SELECT id, code FROM legacy_freelancer_document_types
        WHERE code IN ('CONTRACTOR_AGREEMENT', 'TRAINING_AGREEMENT') AND is_active = TRUE
        ORDER BY code`,
    );
    if (types.rows.length >= 1) {
      for (const t of types.rows) {
        await client.query(
          `
          INSERT INTO legacy_freelancer_signed_documents
            (user_id, document_type_id, is_active, confirmation_source, confirmed_at)
          VALUES ($1, $2, TRUE, 'ADMIN', NOW())
          ON CONFLICT (user_id, document_type_id)
          DO UPDATE SET is_active = TRUE, confirmation_source = 'ADMIN', updated_at = NOW()
          `,
          [created.id, t.id],
        );
      }
      await client.query(
        `UPDATE legacy_freelancer_signed_documents
            SET is_active = FALSE, updated_at = NOW()
          WHERE user_id = $1 AND document_type_id = $2`,
        [created.id, types.rows[0].id],
      );
      const sd = await client.query(
        `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active,
                COUNT(*)::int AS total
           FROM legacy_freelancer_signed_documents WHERE user_id = $1`,
        [created.id],
      );
      signedDocOk = {
        typesTouched: types.rows.length,
        active: Number(sd.rows[0].active),
        total: Number(sd.rows[0].total),
        unmarkedOne: Number(sd.rows[0].active) === types.rows.length - 1 || types.rows.length === 1,
      };
    }
  } catch (e) {
    signedDocOk = { error: e.code || e.message };
  }

  // Cleanup QA row (and signed docs cascade/delete)
  try {
    await client.query(`DELETE FROM legacy_freelancer_signed_documents WHERE user_id = $1`, [
      created.id,
    ]);
  } catch (_) {
    /* optional */
  }
  await client.query(`DELETE FROM users WHERE id = $1`, [created.id]);

  return {
    writeSeparated:
      Array.isArray(created.legacy_work_areas) &&
      created.legacy_work_areas.includes("content_writing") &&
      created.legacy_work_areas.includes("design") &&
      Array.isArray(created.skills) &&
      created.skills.includes("Photoshop") &&
      created.skills.includes("Illustrator") &&
      !created.skills.includes("design"),
    phoneE164: String(created.phone || "").startsWith("+962"),
    workAreaUpdatePreservesSkills:
      JSON.stringify(afterWa.rows[0].skills) === JSON.stringify(created.skills) &&
      JSON.stringify(afterWa.rows[0].legacy_work_areas) === JSON.stringify(["programming"]),
    skillsUpdatePreservesWorkAreas:
      JSON.stringify(afterSkills.rows[0].legacy_work_areas) === JSON.stringify(["programming"]) &&
      JSON.stringify(afterSkills.rows[0].skills) === JSON.stringify(["Figma", "Canva"]),
    profileSkillsPreservesWorkAreas:
      JSON.stringify(afterProfile.rows[0].legacy_work_areas) === JSON.stringify(["programming"]) &&
      JSON.stringify(afterProfile.rows[0].skills) === JSON.stringify(["After Effects", "Premiere"]),
    signedDocOk,
    cleanedUp: true,
  };
}

async function applyIfNeeded(client, { version, file, raw }) {
  const applied = await listAppliedMigrationVersions(client);
  if (applied.includes(version)) {
    return { result: "ALREADY_APPLIED", version };
  }
  await applyOneMigration(client, { file, version, raw });
  return { result: "APPLIED", version };
}

async function main() {
  loadStagingQaEnv({ fillFromDefaultEnv: true });
  const target = assertStagingQaTarget();
  printStagingBanner(target);
  assertNonProductionDatabase("apply legacy work areas 196 on staging");
  const host = String(classifyDatabaseUrl().host || "").toLowerCase();
  refuseProdHost(host);

  const report = {
    phase: "ORDERZHOUSE_LEGACY_WORK_AREAS_STAGING",
    maskedTarget: maskDatabaseTarget(),
    solitaryBand: true,
    wanderingCherry: false,
    appEnv: process.env.APP_ENV,
  };
  console.log(JSON.stringify({ phase: "target", maskedTarget: report.maskedTarget, appEnv: report.appEnv }));

  // Unit sanity (no DB)
  const part = partitionSkillsAndWorkAreas([
    "content_writing",
    "Photoshop",
    "design",
    "Illustrator",
  ]);
  console.log(
    JSON.stringify({
      phase: "unit_partition",
      workAreas: part.workAreas,
      detailedSkills: part.detailedSkills,
      phone: composeE164("+962791234567"),
    }),
  );

  const mig195 = loadMigration(FILE_195);
  const mig196 = loadMigration(FILE);
  console.log(
    JSON.stringify({
      phase: "migration_review",
      m195: { safe: true, findings: mig195.scan.findings || [] },
      m196: { safe: true, findings: mig196.scan.findings || [] },
    }),
  );

  await assertDatabaseWritable();
  await assertStagingWriteProbe();

  const { pool } = require("../src/config/db");
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    let applied = await listAppliedMigrationVersions(client);
    const legacyMigs = applied
      .filter((v) => /^19[0-6]_/.test(String(v)) || String(v).includes("legacy"))
      .sort();
    console.log(
      JSON.stringify({
        phase: "preflight_migrations",
        has195: applied.includes(VERSION_195),
        has196: applied.includes(VERSION),
        has190: applied.includes("190_legacy_freelancer_admin_center"),
        has191: applied.includes("191_legacy_admin_package_semantics"),
        has192: applied.includes("192_legacy_campaign_institution"),
        legacyRelated: legacyMigs.slice(-20),
      }),
    );

    if (!applied.includes("190_legacy_freelancer_admin_center")) {
      throw new Error("REFUSED: prerequisite 190_legacy_freelancer_admin_center not applied");
    }

    // Pre-migration snapshot — only if column may not exist yet; skills always readable
    const before = await snapshotSkillsCounts(client);
    console.log(JSON.stringify({ phase: "pre_migration_counts", ...before }));
    report.preMigration = before;

    // Apply 195 if missing (earlier additive; required by campaign workspace code)
    const r195 = await applyIfNeeded(client, {
      version: VERSION_195,
      file: FILE_195,
      raw: mig195.raw,
    });
    console.log(JSON.stringify({ phase: "migrate_195", ...r195 }));
    report.migration195 = r195;

    applied = await listAppliedMigrationVersions(client);
    if (!applied.includes(VERSION_195)) {
      throw new Error("VERIFY_FAILED: 195 not recorded after apply");
    }

    // Apply 196
    const had196 = applied.includes(VERSION);
    let rowsMigratedEstimate = before.legacySkillsContainWorkKeys;
    const r196 = await applyIfNeeded(client, {
      version: VERSION,
      file: FILE,
      raw: mig196.raw,
    });
    console.log(JSON.stringify({ phase: "migrate_196", ...r196, rowsMigratedEstimate }));
    report.migration196 = { ...r196, rowsMigratedEstimate };

    const after = await postMigrationIntegrity(client);
    console.log(JSON.stringify({ phase: "post_migration_integrity", ...after }));
    report.postMigration = after;

    if (!after.columnExists) throw new Error("VERIFY_FAILED: legacy_work_areas column missing");
    if (after.skillsStillContainWorkKeys !== 0) {
      throw new Error(
        `VERIFY_FAILED: ${after.skillsStillContainWorkKeys} legacy users still have work keys in skills`,
      );
    }

    // Scenario checks A–E using synthetic in-transaction patterns on counts + unit helpers
    const scenarioA = partitionSkillsAndWorkAreas(["content_writing"]);
    const scenarioB = partitionSkillsAndWorkAreas([
      "content_writing",
      "Photoshop",
      "Illustrator",
    ]);
    const scenarioC = partitionSkillsAndWorkAreas([
      "content_writing",
      "design",
      "Photoshop",
    ]);
    const scenarioD = partitionSkillsAndWorkAreas(["Photoshop", "Word"]);
    const scenarioE = partitionSkillsAndWorkAreas([]);
    console.log(
      JSON.stringify({
        phase: "scenario_partition_check",
        A: scenarioA,
        B: scenarioB,
        C: scenarioC,
        D: scenarioD,
        E: scenarioE,
      }),
    );

    const writes = await writePathVerification(client, composeE164);
    console.log(JSON.stringify({ phase: "write_update_signed_phone", ...writes }));
    report.writePath = writes;

    if (!writes.writeSeparated) throw new Error("VERIFY_FAILED: write path cross-write");
    if (!writes.workAreaUpdatePreservesSkills) throw new Error("VERIFY_FAILED: work area update wiped skills");
    if (!writes.skillsUpdatePreservesWorkAreas) throw new Error("VERIFY_FAILED: skills update wiped work areas");
    if (!writes.profileSkillsPreservesWorkAreas) {
      throw new Error("VERIFY_FAILED: profile skills edit wiped work areas");
    }
    if (!writes.phoneE164) throw new Error("VERIFY_FAILED: phone not E.164");

    // Admin filter SQL shape (static)
    const adminSrc = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "legacyFreelancerAdminService.js"),
      "utf8",
    );
    const adminFilterOk = adminSrc.includes("legacy_work_areas") && adminSrc.includes("resolveLegacyWorkAreasFromUserRow");
    const joinSrc = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "pages", "LegacyFreelancerJoinPage.jsx"),
      "utf8",
    );
    const phoneUiOk =
      /رقم الهاتف \*/.test(joinSrc) &&
      !/phoneCountryCode|مفتاح الدولة/.test(joinSrc) &&
      !/عقد مقاولة|signedDocumentTypeIds/.test(joinSrc);

    report.adminUi = { filterUsesLegacyWorkAreas: adminFilterOk };
    report.publicUi = { unifiedPhoneNoContracts: phoneUiOk };
    report.productionUntouched = true;
    report.had196Before = had196;
    report.ok =
      after.columnExists &&
      after.skillsStillContainWorkKeys === 0 &&
      writes.writeSeparated &&
      writes.workAreaUpdatePreservesSkills &&
      writes.skillsUpdatePreservesWorkAreas &&
      adminFilterOk &&
      phoneUiOk;

    console.log(JSON.stringify({ phase: "summary", ok: report.ok, productionUntouched: true }));
    if (!report.ok) throw new Error("VERIFY_FAILED");

    const outDir = path.join(__dirname, "..", ".tmp");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "legacy_work_areas_196_staging_report.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ phase: "report_written", path: outPath }));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
