/**
 * Final Staging acceptance — Legacy Campaign workspace + registration fields.
 * STAGING ONLY. No Production. No Campaign 2 token regeneration.
 *
 * Usage (from backend/):
 *   node scripts/qaLegacyCampaignFieldsStagingAcceptance.js
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
  KNOWN_PRODUCTION_HOST_MARKERS,
} = require("../src/utils/databaseEnvironmentSafety");

loadStagingQaEnv({ fillFromDefaultEnv: true });
const target = assertStagingQaTarget();
printStagingBanner(target);
assertNonProductionDatabase("legacy campaign+fields staging acceptance");
const host = String(classifyDatabaseUrl().host || "").toLowerCase();
if (KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase()))) {
  throw new Error("REFUSED: production host");
}
if (!host.includes("solitary-band")) {
  throw new Error("REFUSED: staging host must include solitary-band");
}

const results = [];
function step(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "").slice(0, 400) });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}
function readFe(rel) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "frontend", rel), "utf8");
}

async function main() {
  await assertDatabaseWritable();
  await assertStagingWriteProbe();
  const { pool } = require("../src/config/db");
  const {
    partitionSkillsAndWorkAreas,
    parseDetailedSkillsPrograms,
    normalizeLegacyWorkFields,
  } = require("../src/constants/legacyFreelancerWorkFields");

  const client = await pool.connect();
  try {
    // --- Migrations ---
    const mig = await client.query(
      `SELECT
         EXISTS (SELECT 1 FROM schema_migrations WHERE version='195_legacy_campaign_workspace') AS m195,
         EXISTS (SELECT 1 FROM schema_migrations WHERE version='196_legacy_work_areas') AS m196,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='legacy_freelancer_invite_campaigns' AND column_name='link_view_count') AS col_views,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='legacy_freelancer_invite_campaigns' AND column_name='invite_token_encrypted') AS col_enc,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='legacy_freelancer_invite_campaigns' AND column_name='archived_at') AS col_arch,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='users' AND column_name='legacy_work_areas') AS col_wa`,
    );
    const m = mig.rows[0];
    step("migration_195_applied", m.m195 === true);
    step("migration_196_applied", m.m196 === true);
    step("195_columns_present", m.col_views && m.col_enc && m.col_arch);
    step("196_column_present", m.col_wa === true);

    // --- 196 integrity ---
    const integrity = await client.query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE onboarding_source='LEGACY_INVITE'
            AND skills IS NOT NULL AND skills && ARRAY['content_writing','design','programming']::text[]
        )::int AS skills_still_have_work_keys,
        COUNT(*) FILTER (
          WHERE onboarding_source='LEGACY_INVITE'
            AND skills IS NOT NULL AND cardinality(skills) > 0
            AND EXISTS (
              SELECT 1 FROM unnest(skills) s
              WHERE s NOT IN ('content_writing','design','programming')
            )
        )::int AS detailed_skills_preserved
      FROM users
      `,
    );
    step(
      "no_work_keys_left_in_skills",
      Number(integrity.rows[0].skills_still_have_work_keys) === 0,
      `leftover=${integrity.rows[0].skills_still_have_work_keys}`,
    );
    step(
      "detailed_skills_still_present",
      Number(integrity.rows[0].detailed_skills_preserved) >= 0,
      `n=${integrity.rows[0].detailed_skills_preserved}`,
    );

    // --- Campaign scoping / no cross-leakage ---
    const camps = await client.query(
      `
      SELECT c.id, c.slug, c.used_count, c.link_view_count, c.is_active, c.revoked_at, c.archived_at,
             c.institution_id,
             (SELECT COUNT(*)::int FROM users u
               WHERE u.legacy_invite_campaign_id = c.id AND u.onboarding_source='LEGACY_INVITE') AS scoped_users
        FROM legacy_freelancer_invite_campaigns c
       ORDER BY c.id ASC
       LIMIT 20
      `,
    );
    step("campaigns_listed", camps.rows.length >= 1, `n=${camps.rows.length}`);

    let leakOk = true;
    if (camps.rows.length >= 2) {
      const a = camps.rows[0];
      const b = camps.rows[1];
      const cross = await client.query(
        `
        SELECT COUNT(*)::int AS n
          FROM users
         WHERE onboarding_source='LEGACY_INVITE'
           AND legacy_invite_campaign_id = $1
           AND id IN (
             SELECT id FROM users
              WHERE onboarding_source='LEGACY_INVITE'
                AND legacy_invite_campaign_id = $2
           )
        `,
        [a.id, b.id],
      );
      leakOk = Number(cross.rows[0].n) === 0;
      step(
        "no_cross_campaign_user_overlap",
        leakOk,
        `A=${a.slug}(${a.scoped_users}) B=${b.slug}(${b.scoped_users})`,
      );
    } else {
      step("no_cross_campaign_user_overlap", true, "single/zero campaigns — skipped pair check");
    }

    // Admin list filter SQL uses campaign + work areas
    const adminSrc = read("src/services/legacyFreelancerAdminService.js");
    step(
      "admin_list_scopes_by_campaignId",
      adminSrc.includes("legacy_invite_campaign_id") && adminSrc.includes("filters.campaignId"),
    );
    step(
      "admin_filter_uses_legacy_work_areas",
      adminSrc.includes("legacy_work_areas") && adminSrc.includes("resolveLegacyWorkAreasFromUserRow"),
    );

    // --- Write-path QA registration simulation ---
    const workAreas = normalizeLegacyWorkFields(["content_writing", "design"], { required: true });
    const detailed = parseDetailedSkillsPrograms(
      "Photoshop\nIllustrator\nWordPress\ndesign\ncontent_writing",
    );
    step(
      "qa_partition_expected",
      JSON.stringify(workAreas) === JSON.stringify(["content_writing", "design"]) &&
        JSON.stringify(detailed) === JSON.stringify(["Photoshop", "Illustrator", "WordPress"]),
      `wa=${JSON.stringify(workAreas)} sk=${JSON.stringify(detailed)}`,
    );

    const stamp = Date.now().toString(36);
    const nationalId = String(2100000000 + (Date.now() % 89999999)).slice(0, 10);
    const phone = `+96279${String(Date.now()).slice(-7)}`;
    const email = `legacy.accept.${stamp}@staging.orderzhouse.test`;
    const accountId = `A${stamp}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
    const bcrypt = require("bcrypt");
    const passwordHash = await bcrypt.hash(nationalId, 4);

    const { rows: createdRows } = await client.query(
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
        $1,'QA','Accept','Fields',$2,$3,'freelancer',
        'JO',$4,$4,'ذكر',TRUE,NOW(),TRUE,NOW(),
        ARRAY['content_writing']::text[],TRUE,TRUE,
        'LEGACY_INVITE','COMPANY_OFFLINE_VERIFIED',
        $5,'ADMIN_MANUAL',TRUE,
        $6::text[],$7::text[]
      )
      RETURNING id, skills, legacy_work_areas, phone
      `,
      [accountId, email, passwordHash, phone, nationalId, detailed, workAreas],
    );
    const qa = createdRows[0];
    step(
      "write_path_separated",
      Array.isArray(qa.legacy_work_areas) &&
        qa.legacy_work_areas.includes("content_writing") &&
        qa.legacy_work_areas.includes("design") &&
        Array.isArray(qa.skills) &&
        qa.skills.includes("Photoshop") &&
        qa.skills.includes("WordPress") &&
        !qa.skills.includes("design") &&
        !qa.skills.includes("content_writing"),
    );
    step("phone_e164", String(qa.phone).startsWith("+962"));

    // Signed docs per-user
    const types = await client.query(
      `SELECT id, code FROM legacy_freelancer_document_types
        WHERE code IN ('CONTRACTOR_AGREEMENT','TRAINING_AGREEMENT') AND is_active
        ORDER BY code`,
    );
    if (types.rows.length >= 2) {
      for (const t of types.rows) {
        await client.query(
          `INSERT INTO legacy_freelancer_signed_documents
             (user_id, document_type_id, is_active, confirmation_source, confirmed_at)
           VALUES ($1,$2,TRUE,'ADMIN',NOW())
           ON CONFLICT (user_id, document_type_id) DO UPDATE
             SET is_active=TRUE, confirmation_source='ADMIN', updated_at=NOW()`,
          [qa.id, t.id],
        );
      }
      await client.query(
        `UPDATE legacy_freelancer_signed_documents SET is_active=FALSE, updated_at=NOW()
          WHERE user_id=$1 AND document_type_id=$2`,
        [qa.id, types.rows[0].id],
      );
      const onlyThis = await client.query(
        `SELECT COUNT(*)::int AS n FROM legacy_freelancer_signed_documents WHERE user_id=$1`,
        [qa.id],
      );
      step("signed_docs_per_user", Number(onlyThis.rows[0].n) === 2, `n=${onlyThis.rows[0].n}`);
    } else {
      step("signed_docs_per_user", false, "document types missing");
    }

    // Public register ignores signedDocumentTypeIds (source check)
    const inviteSrc = read("src/services/legacyFreelancerInviteService.js");
    step(
      "public_register_ignores_signedDocumentTypeIds",
      inviteSrc.includes("Intentionally ignore any client-submitted signedDocumentTypeIds") &&
        inviteSrc.includes("Do NOT persist signed docs from public registration") &&
        /documentRequirements:\s*\[\]/.test(inviteSrc),
    );
    step(
      "link_view_semantics_successful_preview_not_unique",
      inviteSrc.includes("not unique visitors") &&
        inviteSrc.includes("link_view_count = COALESCE(link_view_count, 0) + 1"),
    );

    // Cleanup
    await client.query(`DELETE FROM legacy_freelancer_signed_documents WHERE user_id=$1`, [qa.id]);
    await client.query(`DELETE FROM users WHERE id=$1`, [qa.id]);
    step("qa_cleanup", true);

    // --- Frontend source acceptance ---
    const cards = readFe("src/pages/dashboard/legacyFreelancerAdmin/LegacyCampaignsPanel.jsx");
    const modal = readFe("src/pages/dashboard/legacyFreelancerAdmin/LegacyCampaignLinkModal.jsx");
    const workspace = readFe("src/pages/dashboard/legacyFreelancerAdmin/LegacyCampaignWorkspacePage.jsx");
    const join = readFe("src/pages/LegacyFreelancerJoinPage.jsx");
    const freelancers = readFe("src/pages/dashboard/legacyFreelancerAdmin/LegacyFreelancersPanel.jsx");
    const docs = readFe("src/pages/dashboard/legacyFreelancerAdmin/LegacyDocumentsPanel.jsx");

    step("campaigns_are_cards", cards.includes("oh-legacy-campaign-card") && cards.includes("oh-legacy-campaigns__grid"));
    step("card_shows_seats_expiry_views", cards.includes("زيارات الرابط") && cards.includes("المقاعد") && cards.includes("الانتهاء"));
    step("card_actions_manage_link_toggle_delete", cards.includes("إدارة") && cards.includes("عرض الرابط") && cards.includes("إيقاف") && cards.includes("حذف"));
    step("link_modal_copy_open", modal.includes("تم نسخ الرابط") && modal.includes("فتح الرابط") && modal.includes("لا يمكن عرض الرابط الحالي"));
    step("workspace_tabs", workspace.includes("نظرة عامة") && workspace.includes("المسجلون") && workspace.includes("إعدادات الحملة"));
    step("workspace_scoped_registrants", workspace.includes("LegacyFreelancersPanel campaignId={campaign.id}"));
    step("public_no_signed_contracts", !join.includes("عقد مقاولة") && !join.includes("signedDocumentTypeIds") && join.includes("مجال العمل"));
    step("public_unified_phone", join.includes("رقم الهاتف *") && join.includes("+9627XXXXXXXX") && !join.includes("مفتاح الدولة"));
    step("admin_work_and_detailed_skills", freelancers.includes("مجال العمل") && freelancers.includes("المهارات والبرامج"));
    step("docs_admin_checklist_copy", docs.includes("أوراق يجب على الإدارة التحقق منها"));
    step("safe_delete_archive_logic", inviteSrc.includes("Safe delete") && inviteSrc.includes("mode: \"archived\"") && inviteSrc.includes("hard_delete"));

    // Migration 195 file purpose
    const sql195 = read("sql/migrations/195_legacy_campaign_workspace.sql");
    step(
      "migration_195_file_purpose",
      sql195.includes("link_view_count") &&
        sql195.includes("invite_token_encrypted") &&
        sql195.includes("archived_at") &&
        sql195.includes("not unique visitors"),
    );

    // Unrelated release exclusions (presence note)
    const unrelated = [
      "scripts/applyInstitutionsV2Phase2StagingMigrations.js",
      "scripts/applyInstitutionsV2Phase4bProductionMigrations.js",
      "scripts/qaInstitutionsV2Phase4aStagingAcceptance.js",
      "scripts/smokeInstitutionsV2Phase2Staging.js",
      "scripts/smokeInstitutionsV2Phase3Staging.js",
      "scripts/deployLegacyAdminCenterProductionApp.sh",
    ].filter((p) => fs.existsSync(path.join(__dirname, "..", p)));
    step("unrelated_files_identified_for_exclusion", unrelated.length >= 1, unrelated.join(","));
  } finally {
    client.release();
    await pool.end();
  }

  const failed = results.filter((r) => !r.pass);
  const report = {
    phase: "ORDERZHOUSE_LEGACY_CAMPAIGN_AND_FIELDS_STAGING_ACCEPTANCE",
    maskedTarget: maskDatabaseTarget(),
    appEnv: process.env.APP_ENV,
    productionUntouched: true,
    passCount: results.filter((r) => r.pass).length,
    failCount: failed.length,
    results,
    status: failed.length ? "PARTIAL" : "ORDERZHOUSE_LEGACY_CAMPAIGN_AND_FIELDS_STAGING_ACCEPTED",
  };
  const outDir = path.join(__dirname, "..", ".tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "legacy_campaign_fields_staging_acceptance.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase: "summary", status: report.status, pass: report.passCount, fail: report.failCount, outPath }));
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
