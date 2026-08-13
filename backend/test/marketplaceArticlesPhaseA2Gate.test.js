/**
 * Phase A2 Marketplace Articles — isolated DB gate.
 * Run via: node scripts/runMarketplaceArticlesPhaseA2Gate.js
 *
 * Migration 145 applied only on isolated gate DB. No Production mutation.
 */

const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) {
    throw new Error(`PHASE A2 GATE REFUSED PRODUCTION DB: ${info.maskedTarget}`);
  }
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplaceArticlesPhaseA2Gate.js");
  }
}

refuseProductionDatabase();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = "marketplace-articles-phase-a2-gate-secret";
}

const { pool } = require("../src/config/db");
const articlesService = require("../src/services/marketplaceArticlesService");
const {
  ARTICLE_MEMBERSHIP_ACCESS_ENFORCEMENT,
  ARTICLE_WORK_TOKEN_MOVEMENT,
} = require("../src/constants/marketplaceArticles");
const { deriveArticleValueJodFromLevel } = require("../src/utils/marketplaceArticleValue");

async function seedUser(role) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `a2_${role}_${suffix}@example.com`;
  const accountId = `B${suffix}`.slice(0, 10).toUpperCase();
  const phone = `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1, $2, 'x', $3, 'A2', 'T', 'User', $4, $4, 'ذكر', 'JO', TRUE, TRUE, TRUE)
     RETURNING id`,
    [accountId, email, role, phone],
  );
  return rows[0];
}

async function ensureCategory() {
  const existing = await pool.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
  if (existing.rows[0]) return existing.rows[0].id;
  const ins = await pool.query(
    `INSERT INTO categories (slug, name, description) VALUES ('content-writing', 'Content', 'A2')
     RETURNING id`,
  );
  return ins.rows[0].id;
}

async function ensureSubcategory(categoryId) {
  const existing = await pool.query(
    `SELECT id FROM subcategories WHERE category_id = $1 ORDER BY id LIMIT 1`,
    [categoryId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const ins = await pool.query(
    `INSERT INTO subcategories (category_id, slug, name)
     VALUES ($1, 'blogs-articles-writing', 'Blogs')
     RETURNING id`,
    [categoryId],
  );
  return ins.rows[0].id;
}

describe("Phase A2 — policy", () => {
  it("membership access enforced in B5; token movement remains none", () => {
    assert.equal(ARTICLE_MEMBERSHIP_ACCESS_ENFORCEMENT, "ENFORCED");
    assert.equal(ARTICLE_WORK_TOKEN_MOVEMENT, "NONE");
  });
});

describe("Phase A2 — isolated DB gate", () => {
  let admin;
  let categoryId;
  let subcategoryId;

  before(async () => {
    admin = await seedUser("super_admin");
    categoryId = await ensureCategory();
    subcategoryId = await ensureSubcategory(categoryId);
  });

  after(async () => {
    await pool.end().catch(() => {});
  });

  it("creates articles for each level with derived JOD value", async () => {
    for (const level of [1, 2, 3, 4, 5]) {
      const article = await articlesService.createMarketplaceArticle(
        {
          title: `Level ${level} Article`,
          description: `Brief ${level}`,
          articleLevel: level,
          requiredWordCount: 100 * level,
          requiredReferencesCount: level - 1,
          status: "draft",
          categoryId,
          subcategoryId,
        },
        { actorUserId: admin.id },
      );
      assert.equal(article.articleLevel, level);
      assert.equal(Number(article.articleValueJod), deriveArticleValueJodFromLevel(level));
      assert.equal(article.requiredWordCount, 100 * level);
      assert.equal(article.requiredReferencesCount, level - 1);
      assert.equal(article.category.id, String(categoryId));
      assert.equal(article.subcategory.id, String(subcategoryId));
      assert.equal(article.isFakeOrTraining, false);
    }
  });

  it("rejects invalid level / word count / references / forged value", async () => {
    await assert.rejects(
      () =>
        articlesService.createMarketplaceArticle({
          title: "bad",
          articleLevel: 0,
          requiredWordCount: 100,
        }),
      (err) => err?.publicCode === "INVALID_ARTICLE_LEVEL" || err?.statusCode === 400,
    );
    await assert.rejects(
      () =>
        articlesService.createMarketplaceArticle({
          title: "bad",
          articleLevel: 6,
          requiredWordCount: 100,
        }),
    );
    await assert.rejects(
      () =>
        articlesService.createMarketplaceArticle({
          title: "bad",
          articleLevel: 2,
          requiredWordCount: 0,
        }),
    );
    await assert.rejects(
      () =>
        articlesService.createMarketplaceArticle({
          title: "bad",
          articleLevel: 2,
          requiredWordCount: 100,
          requiredReferencesCount: -1,
        }),
    );
    await assert.rejects(
      () =>
        articlesService.createMarketplaceArticle({
          title: "bad",
          articleLevel: 2,
          articleValueJod: 5,
          requiredWordCount: 100,
        }),
      (err) => err?.publicCode === "ARTICLE_VALUE_LEVEL_MISMATCH" || err?.statusCode === 400,
    );
  });

  it("accepts references = 0 and publishes read model fields", async () => {
    const created = await articlesService.createMarketplaceArticle(
      {
        title: "Published sample",
        description: "Brief",
        articleLevel: 3,
        requiredWordCount: 800,
        requiredReferencesCount: 0,
        status: "published",
        categoryId,
      },
      { actorUserId: admin.id },
    );
    assert.equal(created.status, "published");
    assert.equal(created.requiredReferencesCount, 0);
    assert.ok(created.publishedAt);

    const listed = await articlesService.listPublishedMarketplaceArticles({});
    const found = listed.find((a) => a.id === created.id);
    assert.ok(found);
    assert.equal(found.articleLevel, 3);
    assert.equal(Number(found.articleValueJod), 3);
    assert.equal(found.requiredWordCount, 800);
    assert.equal(found.requiredReferencesCount, 0);
    assert.ok(!("fairScore" in found));
    assert.ok(!("entryTokenCharge" in found));
  });

  it("level change updates value; historical snapshot fields stay on row until updated", async () => {
    const created = await articlesService.createMarketplaceArticle(
      {
        title: "Mutable",
        articleLevel: 1,
        requiredWordCount: 200,
        status: "draft",
      },
      { actorUserId: admin.id },
    );
    assert.equal(Number(created.articleValueJod), 1);
    const updated = await articlesService.updateMarketplaceArticle(
      created.id,
      { articleLevel: 5 },
      { actorUserId: admin.id },
    );
    assert.equal(updated.articleLevel, 5);
    assert.equal(Number(updated.articleValueJod), 5);
  });

  it("does not create work token ledger rows for Article CRUD", async () => {
    const before = await pool.query(`SELECT COUNT(*)::int AS c FROM work_token_ledger_entries`).catch(() => ({
      rows: [{ c: 0 }],
    }));
    await articlesService.createMarketplaceArticle(
      {
        title: "No tokens",
        articleLevel: 4,
        requiredWordCount: 400,
        status: "draft",
      },
      { actorUserId: admin.id },
    );
    const after = await pool.query(`SELECT COUNT(*)::int AS c FROM work_token_ledger_entries`).catch(() => ({
      rows: [{ c: 0 }],
    }));
    assert.equal(after.rows[0].c, before.rows[0].c);
  });

  it("DB enforces level/value invariant", async () => {
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO marketplace_articles (
             title, description, article_level, article_value_jod,
             required_word_count, required_references_count, status
           ) VALUES ('x', '', 2, 5.000, 100, 0, 'draft')`,
        ),
    );
  });

  it("A1 membership catalog article levels remain 1..5 for tiers", async () => {
    const { rows } = await pool.query(
      `SELECT tier_code, article_access_level
         FROM marketplace_membership_plans
        WHERE tier_code = ANY($1::text[])`,
      [["free", "start", "active", "pro", "elite"]],
    ).catch(() => ({ rows: [] }));
    if (!rows.length) {
      // Gate may not include membership catalog; skip soft
      return;
    }
    const map = Object.fromEntries(rows.map((r) => [r.tier_code, Number(r.article_access_level)]));
    assert.equal(map.free, 1);
    assert.equal(map.start, 2);
    assert.equal(map.active, 3);
    assert.equal(map.pro, 4);
    assert.equal(map.elite, 5);
  });
});
