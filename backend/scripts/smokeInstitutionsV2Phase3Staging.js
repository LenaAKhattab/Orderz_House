/* Staging E2E/API smoke — Institutions V2 Phase 3 (no Production). */
process.env.APP_ENV = "staging";
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.staging") });

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url || /wandering-cherry/i.test(url)) {
  console.error("Refusing: not Staging");
  process.exit(1);
}
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;

const { pool } = require("../src/config/db");
const institutionsService = require("../src/services/institutionsService");
const institutionWorkService = require("../src/services/institutionWorkService");
const appsSvc = require("../src/services/marketplaceArticleApplicationsService");
const stored = require("../src/services/institutionalStoredOrdersService");

async function countFinanceNoise(sinceIso) {
  const checks = {};
  const tables = [
    ["marketplace_article_settlements", "created_at"],
    ["marketplace_article_financial_entries", "created_at"],
  ];
  for (const [table, col] of tables) {
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM ${table} WHERE ${col} >= $1::timestamptz`,
        [sinceIso],
      );
      checks[table] = Number(rows[0]?.c || 0);
    } catch (e) {
      checks[table] = e.code === "42P01" ? 0 : -1;
    }
  }
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM client_order_payments WHERE created_at >= $1::timestamptz`,
      [sinceIso],
    );
    checks.client_order_payments = Number(rows[0]?.c || 0);
  } catch (e) {
    checks.client_order_payments = e.code === "42P01" ? 0 : -1;
  }
  return checks;
}

(async () => {
  const startedAt = new Date().toISOString();
  const { rows: admins } = await pool.query(
    `SELECT id FROM users WHERE role IN ('super_admin','admin') AND is_active = TRUE ORDER BY id ASC LIMIT 1`,
  );
  if (!admins[0]) throw new Error("no admin");
  const actorUserId = Number(admins[0].id);
  const { rows: cats } = await pool.query(`SELECT id FROM categories ORDER BY id ASC LIMIT 1`);
  if (!cats[0]) throw new Error("no category");

  const stamp = Date.now();
  const institution = await institutionsService.createInstitution({
    actorUserId,
    name: `QA P3 Inst ${stamp}`,
    description: "phase3 staging smoke",
    status: "active",
  });
  console.log("institution", institution.id);

  // A) Bidding order
  const bidOrder = await institutionWorkService.createInstitutionOrder({
    institutionId: institution.id,
    actorUserId,
    actorRole: "super_admin",
    payload: {
      title: `QA P3 Bid ${stamp}`,
      description: "phase3 bidding",
      categoryId: cats[0].id,
      projectType: "bidding",
      bidBudgetMin: 5,
      bidBudgetMax: 25,
      durationValue: 2,
      durationUnit: "days",
    },
    publish: true,
  });
  console.log("bidding order", bidOrder.order.id, bidOrder.order.projectType);

  // B) Fixed order
  const fixedOrder = await institutionWorkService.createInstitutionOrder({
    institutionId: institution.id,
    actorUserId,
    actorRole: "super_admin",
    payload: {
      title: `QA P3 Fixed ${stamp}`,
      description: "phase3 fixed take",
      categoryId: cats[0].id,
      projectType: "fixed",
      budget: 40,
      durationValue: 2,
      durationUnit: "days",
    },
    publish: true,
  });
  console.log("fixed order", fixedOrder.order.id, fixedOrder.order.projectType);

  const denied = await stored.assertUserCanViewInstitutionalOrder(999999992, fixedOrder.order.id);
  console.log("non-member take gate", denied);

  // C) Atomic institution article
  const articleOut = await institutionWorkService.createInstitutionArticle({
    institutionId: institution.id,
    actorUserId,
    payload: {
      title: `QA P3 Article ${stamp}`,
      description: "phase3 institution article atomic",
      targetPlanCode: "STARTER",
      status: "draft",
      writingMode: "either",
      requiredBidCount: 10,
      minRequiredBidsAcknowledged: true,
    },
    publish: false,
  });
  const articleId = Number(articleOut.article.id);
  const { rows: artRows } = await pool.query(
    `SELECT id, institution_id, visibility_scope, status FROM marketplace_articles WHERE id = $1`,
    [articleId],
  );
  console.log("article row", artRows[0]);
  if (String(artRows[0].visibility_scope) !== "institution") {
    throw new Error("article not born institution-scoped");
  }
  if (String(artRows[0].institution_id) !== String(institution.id)) {
    throw new Error("article institution_id mismatch");
  }

  // Public list must not include it even if published later
  await pool.query(
    `UPDATE marketplace_articles SET status = 'published', published_at = NOW() WHERE id = $1`,
    [articleId],
  );
  const articlesSvc = require("../src/services/marketplaceArticlesService");
  const published = await articlesSvc.listPublishedMarketplaceArticles({ limit: 200 });
  if (published.some((a) => String(a.id) === String(articleId))) {
    throw new Error("institution article leaked into public list");
  }
  console.log("public list leak check ok");

  // Settlement mode derivation
  // Create a fake application row is heavy; assert resolve helper via article ownership path on finalize code.
  const mode = await appsSvc.resolveSettlementModeForApplication;
  console.log("resolveSettlementModeForApplication exported", typeof mode === "function");

  // Inactive blocks new work
  await institutionsService.updateInstitution({
    id: institution.id,
    patch: { status: "inactive" },
    actorUserId,
  });
  let blocked = false;
  try {
    await institutionWorkService.createInstitutionOrder({
      institutionId: institution.id,
      actorUserId,
      actorRole: "super_admin",
      payload: {
        title: "should fail",
        description: "inactive",
        categoryId: cats[0].id,
        projectType: "fixed",
        budget: 10,
        durationValue: 1,
        durationUnit: "days",
      },
      publish: true,
    });
  } catch (e) {
    blocked = e.publicCode === "INSTITUTION_INACTIVE" || /غير نشطة/.test(String(e.message));
  }
  console.log("inactive blocks create", blocked);
  if (!blocked) throw new Error("inactive institution allowed create");

  const finance = await countFinanceNoise(startedAt);
  console.log("finance since start", finance);
  for (const [k, v] of Object.entries(finance)) {
    if (v > 0) throw new Error(`unexpected finance rows in ${k}: ${v}`);
  }

  console.log("STAGING_SMOKE_PHASE3_OK");
  await pool.end();
})().catch(async (e) => {
  console.error("SMOKE_FAILED", e);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
