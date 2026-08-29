/**
 * OZ-Articles-Bildazo-02 — contract + inventory + publish payload tests (mocked Bildazo).
 * Does not call real Bildazo. Does not touch Production DB.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/oz02_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS,
  ARTICLE_PACKAGE_TO_LEVEL,
  writingSourceSatisfiesMode,
  countReferences,
  countWords,
  normalizeWritingMode,
  normalizePackagePlanCode,
  articleLevelForPackagePlan,
} = require("../src/constants/marketplaceArticleBildazoOz02");
const {
  buildSafePublishBody,
} = require("../src/services/bildazoArticlePublishClient");
const {
  flattenLeafCategories,
  fetchBildazoLeafCategories,
  clearBildazoCategoriesCache,
} = require("../src/services/bildazoCategoriesClient");
const {
  assertBildazoInventoryFields,
} = require("../src/utils/marketplaceArticleBildazoInventory");
const {
  buildBildazoPublishPayloadPreview,
  AUTHOR_NOT_LINKED_AR,
} = require("../src/services/bildazoArticlePublishService");
const { isBildazoLeafCategoryId } = require("../src/config/bildazoArticlePublish");

const LEAF_A = "11111111-1111-4111-8111-111111111111";
const LEAF_B = "22222222-2222-4222-8222-222222222222";

describe("OZ-Articles-Bildazo-02 — migration file", () => {
  it("additive migration 183 exists with package defaults and snapshots", () => {
    const file = path.join(
      __dirname,
      "../sql/migrations/183_marketplace_articles_bildazo_inventory_oz02.sql",
    );
    assert.equal(fs.existsSync(file), true);
    const sql = fs.readFileSync(file, "utf8");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS/);
    assert.match(sql, /marketplace_article_package_requirements/);
    assert.match(sql, /STARTER.*600.*2|600.*2/);
    assert.match(sql, /writing_mode/);
    assert.match(sql, /bildazo_category_id/);
    assert.match(sql, /references_text/);
    assert.match(sql, /writing_source/);
    assert.doesNotMatch(sql, /DROP TABLE/i);
  });
});

describe("OZ-Articles-Bildazo-02 — package defaults", () => {
  it("defaults match product contract", () => {
    assert.deepEqual(ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS.STARTER, {
      minWords: 600,
      minReferences: 2,
    });
    assert.deepEqual(ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS.SILVER, {
      minWords: 1200,
      minReferences: 4,
    });
    assert.deepEqual(ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS.PRO, {
      minWords: 1800,
      minReferences: 6,
    });
    assert.deepEqual(ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS.ELITE, {
      minWords: 2400,
      minReferences: 8,
    });
  });

  it("maps target plan to article level and normalizes codes", () => {
    assert.equal(normalizePackagePlanCode("silver"), "SILVER");
    assert.equal(normalizePackagePlanCode("STARTER"), "STARTER");
    assert.equal(articleLevelForPackagePlan("STARTER"), 1);
    assert.equal(articleLevelForPackagePlan("SILVER"), 2);
    assert.equal(articleLevelForPackagePlan("PRO"), 3);
    assert.equal(articleLevelForPackagePlan("ELITE"), 5);
    assert.equal(ARTICLE_PACKAGE_TO_LEVEL.ELITE, 5);
  });
});

describe("OZ-Articles-Bildazo-02 — plan-derived create requirements", () => {
  it("service derives words/refs/level from targetPlanCode without requiring per-article fields", async () => {
    const svc = require("../src/services/marketplaceArticlesService");
    const pkg = require("../src/services/marketplaceArticlePackageRequirementsService");
    const original = pkg.getRequirementForPlan;
    pkg.getRequirementForPlan = async (planCode) => {
      const code = String(planCode).toUpperCase();
      return {
        planCode: code,
        minWords: ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[code].minWords,
        minReferences: ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[code].minReferences,
      };
    };
    try {
      const derived = await svc.resolveArticleRequirementsFromPayload({
        targetPlanCode: "PRO",
      });
      assert.equal(derived.derivedFromPlan, true);
      assert.equal(derived.planCode, "PRO");
      assert.equal(derived.articleLevel, 3);
      assert.equal(derived.requiredWordCount, 1800);
      assert.equal(derived.requiredReferencesCount, 6);
      assert.equal(derived.tierCode, "pro");
    } finally {
      pkg.getRequirementForPlan = original;
    }
  });

  it("assignment snapshot SQL freezes words/refs from article at select time", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceArticleApplicationsService.js"),
      "utf8",
    );
    assert.match(src, /required_word_count_snapshot/);
    assert.match(src, /required_references_count_snapshot/);
    assert.match(src, /writing_mode_snapshot/);
    assert.match(src, /title_snapshot/);
    assert.match(src, /description_snapshot/);
    assert.match(src, /COALESCE\(\$10, required_word_count_snapshot\)/);
  });

  it("create validators accept targetPlanCode without requiredWordCount", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/validators/marketplaceArticlesValidators.js"),
      "utf8",
    );
    assert.match(src, /targetPlanCode/);
    assert.match(src, /targetPlanCode or articleLevel is required/);
    assert.match(src, /body\("requiredWordCount"\)\s*\n\s*\.optional/);
  });
});

describe("OZ-Articles-Bildazo-02 — writing mode validation", () => {
  it("enforces ai/manual/either against writingSource", () => {
    assert.equal(writingSourceSatisfiesMode("AI_ASSISTED", "ai"), true);
    assert.equal(writingSourceSatisfiesMode("HUMAN_WRITTEN", "ai"), false);
    assert.equal(writingSourceSatisfiesMode("HUMAN_WRITTEN", "manual"), true);
    assert.equal(writingSourceSatisfiesMode("AI_ASSISTED", "manual"), false);
    assert.equal(writingSourceSatisfiesMode("HUMAN_WRITTEN", "either"), true);
    assert.equal(writingSourceSatisfiesMode("AI_ASSISTED", "either"), true);
    assert.equal(normalizeWritingMode("AI"), "ai");
  });

  it("counts words and references", () => {
    assert.equal(countWords("one two three"), 3);
    assert.equal(countReferences("a\nb\nc"), 3);
    assert.equal(countReferences("1. a\n2. b"), 2);
  });
});

describe("OZ-Articles-Bildazo-02 — inventory category assert", () => {
  it("requires valid leaf UUID + writingMode when required", () => {
    assert.throws(
      () => assertBildazoInventoryFields({ writingMode: "ai" }, { required: true }),
      (err) => err.publicCode === "INVALID_BILDAZO_CATEGORY",
    );
    assert.throws(
      () =>
        assertBildazoInventoryFields(
          { bildazoCategoryId: LEAF_A },
          { required: true },
        ),
      (err) => err.publicCode === "INVALID_WRITING_MODE",
    );
    const ok = assertBildazoInventoryFields(
      {
        bildazoCategoryId: LEAF_A,
        bildazoCategoryName: "تقنية",
        writingMode: "manual",
      },
      { required: true },
    );
    assert.equal(ok.bildazoCategoryId, LEAF_A);
    assert.equal(ok.writingMode, "manual");
    assert.equal(isBildazoLeafCategoryId(LEAF_A), true);
  });
});

describe("OZ-Articles-Bildazo-02 — Bildazo categories client", () => {
  it("flattens leaf categories from nested tree", () => {
    const leaves = flattenLeafCategories([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        nameAr: "جذر",
        children: [
          { id: LEAF_A, nameAr: "ورقة أ", slug: "leaf-a", children: [] },
          { id: LEAF_B, nameAr: "ورقة ب", slug: "leaf-b", isLeaf: true },
        ],
      },
    ]);
    assert.equal(leaves.length, 2);
    assert.equal(leaves[0].id, LEAF_A);
    assert.match(leaves[0].path, /جذر/);
  });

  it("fetches categories via mocked S2S endpoint", async () => {
    clearBildazoCategoriesCache();
    const result = await fetchBildazoLeafCategories({
      skipCache: true,
      getConfig: () => ({
        baseUrl: "https://bildazo.test",
        secret: "test-secret-not-logged",
        timeoutMs: 5000,
      }),
      fetchImpl: async (url, opts) => {
        assert.match(String(url), /\/categories/);
        assert.equal(opts.method, "GET");
        assert.ok(opts.headers["X-OrderzHouse-Integration-Secret"]);
        return {
          status: 200,
          json: async () => ({
            categories: [{ id: LEAF_A, nameAr: "ورقة", slug: "leaf", isLeaf: true }],
          }),
        };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.items[0].id, LEAF_A);
  });

  it("blocks when endpoint missing (404)", async () => {
    clearBildazoCategoriesCache();
    const result = await fetchBildazoLeafCategories({
      skipCache: true,
      getConfig: () => ({
        baseUrl: "https://bildazo.test",
        secret: "x",
        timeoutMs: 5000,
      }),
      fetchImpl: async () => ({ status: 404, json: async () => ({}) }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.errorCode, "BILDAZO_CATEGORIES_ENDPOINT_MISSING");
  });
});

describe("OZ-Articles-Bildazo-02 — publish payload contract", () => {
  it("builds allowlisted payload without references/tags/password/source", () => {
    const body = buildSafePublishBody({
      orderzArticleId: "99",
      orderzFreelancerId: "7",
      bildazoUserId: LEAF_A,
      bildazoPublicId: "pub-1",
      title: "عنوان مقال كافٍ",
      content: "x".repeat(120),
      categoryId: LEAF_B,
      acceptedAt: "2026-01-01T00:00:00.000Z",
      reviewerNotes: "ok",
      writingSource: "HUMAN_WRITTEN",
      coverImageUrl: "https://cdn.example/cover.jpg",
      references: "must-not-send",
      referencesText: "must-not-send",
      password: "nope",
      tags: ["a"],
      excerpt: "no",
      source: "orderzhouse",
    });
    assert.equal(body.orderzArticleId, "99");
    assert.equal(body.categoryId, LEAF_B);
    assert.equal(body.writingSource, "HUMAN_WRITTEN");
    assert.equal(body.coverImageUrl, "https://cdn.example/cover.jpg");
    assert.equal(Object.prototype.hasOwnProperty.call(body, "references"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "referencesText"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "password"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "tags"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "excerpt"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "source"), false);
  });

  it("preview uses stable article id and omits references from payload", () => {
    const preview = buildBildazoPublishPayloadPreview({
      application: {
        freelancer_user_id: 7,
        required_word_count_snapshot: 600,
        required_references_count_snapshot: 2,
        writing_mode_snapshot: "manual",
        bildazo_category_name_snapshot: "تقنية",
        approved_at: "2026-01-02T00:00:00.000Z",
      },
      article: { id: 55 },
      manuscript: {
        title: "عنوان نهائي كافٍ",
        content: "word ".repeat(650),
        referencesText: "ref1\nref2",
        writingSource: "HUMAN_WRITTEN",
      },
      link: {
        status: "linked",
        bildazo_user_id: LEAF_A,
        bildazo_public_id: "pub",
      },
      categoryId: LEAF_B,
    });
    assert.equal(preview.payload.orderzArticleId, "55");
    assert.equal(preview.payload.categoryId, LEAF_B);
    assert.equal(preview.meta.referencesInPayload, false);
    assert.equal(preview.meta.referencesStoredInternally, true);
    assert.equal(preview.meta.authorLinked, true);
    assert.match(AUTHOR_NOT_LINKED_AR, /بلدازو/);
  });

  it("routes expose categories + package requirements + preview", () => {
    const articlesRoutes = fs.readFileSync(
      path.join(__dirname, "../src/routes/superAdminMarketplaceArticlesRoutes.js"),
      "utf8",
    );
    const appRoutes = fs.readFileSync(
      path.join(__dirname, "../src/routes/superAdminMarketplaceArticleApplicationsRoutes.js"),
      "utf8",
    );
    assert.match(articlesRoutes, /bildazo-categories/);
    assert.match(articlesRoutes, /package-requirements/);
    assert.match(articlesRoutes, /requireSuperAdmin/);
    assert.match(appRoutes, /bildazo-publish-preview/);
  });
});
