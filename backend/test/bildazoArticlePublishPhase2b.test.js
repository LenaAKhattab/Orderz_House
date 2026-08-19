/**
 * Phase 2B — publish accepted Mini Articles to Bildazo after OrderzHouse approval.
 * Does not connect to production. Does not call Bildazo production.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/bildazo_placeholder";
delete process.env.BILDAZO_ARTICLE_PUBLISH_ENABLED;
delete process.env.BILDAZO_API_BASE_URL;
delete process.env.BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET;
delete process.env.BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID;
delete process.env.BILDAZO_ARTICLE_CATEGORY_MAP;

const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
if (classifyDatabaseUrl(process.env.DATABASE_URL).isProduction) {
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/bildazo_placeholder";
}

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { BILDAZO_ARTICLE_PUBLISH_ERROR_CODES } = require("../src/constants/bildazoArticlePublish");
const {
  isBildazoArticlePublishEnabled,
  resolveBildazoCategoryId,
} = require("../src/config/bildazoArticlePublish");
const { clearBildazoArticlePublishSchemaCache } = require("../src/utils/bildazoArticlePublishSchema");
const { clearBildazoAuthorLinkSchemaCache } = require("../src/utils/bildazoAuthorLinkSchema");
const { clearMarketplaceArticleSubmissionsSchemaCache } = require("../src/utils/marketplaceArticleSubmissionsSchema");
const {
  publishAcceptedArticleToBildazo,
  buildSafePublishBody,
  joinPublishUrl,
} = require("../src/services/bildazoArticlePublishClient");
const {
  publishAfterArticleAcceptance,
} = require("../src/services/bildazoArticlePublishService");

const LEAF_CATEGORY = "11111111-1111-4111-8111-111111111111";
const BILDAZO_USER = "22222222-2222-4222-8222-222222222222";

const APPLICATION = {
  id: 9,
  article_id: 3,
  freelancer_user_id: 11,
  status: "approved",
  proposal_message: "Full accepted article body for Bildazo.",
  approved_at: "2026-08-19T08:00:00.000Z",
};

const ARTICLE = {
  title: "How to write",
  description: "Campaign brief",
  category_id: 4,
  subcategory_id: 12,
};

const LINKED = {
  freelancer_user_id: 11,
  status: "linked",
  bildazo_user_id: BILDAZO_USER,
  bildazo_public_id: "7POFLXBMB",
};

function jsonResponse(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function createMemoryDb({
  application = APPLICATION,
  article = ARTICLE,
  link = LINKED,
  manuscript = {
    id: 1,
    application_id: 9,
    article_id: 3,
    freelancer_user_id: 11,
    title: "Final manuscript title",
    content: "This is the freelancer final written article after review.",
    status: "submitted",
    reviewer_notes: "Looks good",
  },
} = {}) {
  const records = [];
  let nextId = 1;
  const now = () => new Date().toISOString();

  async function query(sql, params = []) {
    const s = String(sql);
    if (s.includes("to_regclass('public.bildazo_article_publish_records')")) {
      return { rows: [{ tbl: "bildazo_article_publish_records" }] };
    }
    if (s.includes("to_regclass('public.freelancer_bildazo_author_links')")) {
      return { rows: [{ tbl: "freelancer_bildazo_author_links" }] };
    }
    if (s.includes("to_regclass('public.marketplace_article_submissions')")) {
      return { rows: [{ tbl: manuscript ? "marketplace_article_submissions" : null }] };
    }
    if (s.includes("FROM marketplace_article_submissions WHERE application_id")) {
      return {
        rows: manuscript && Number(manuscript.application_id) === Number(params[0]) ? [manuscript] : [],
      };
    }
    if (s.includes("FROM marketplace_article_applications a") && s.includes("JOIN marketplace_articles")) {
      if (!application) return { rows: [] };
      return {
        rows: [
          {
            ...application,
            campaign_title: article.title,
            campaign_description: article.description,
            campaign_category_id: article.category_id,
            campaign_subcategory_id: article.subcategory_id,
          },
        ],
      };
    }
    if (s.includes("FROM freelancer_bildazo_author_links")) {
      return { rows: link ? [link] : [] };
    }
    if (s.includes("FROM bildazo_article_publish_records WHERE orderz_application_id")) {
      return {
        rows: records.filter((r) => Number(r.orderz_application_id) === Number(params[0])),
      };
    }
    if (s.includes("INSERT INTO bildazo_article_publish_records")) {
      const existing = records.find((r) => Number(r.orderz_application_id) === Number(params[1]));
      if (existing) return { rows: [] };
      const row = {
        id: nextId++,
        orderz_article_id: params[0],
        orderz_application_id: params[1],
        freelancer_user_id: params[2],
        bildazo_user_id: params[3],
        bildazo_public_id: params[4],
        status: params[5],
        bildazo_category_id: params[6],
        last_error: params[7],
        last_response_code: params[8],
        publish_attempt_count: Number(params[9]) || 0,
        bildazo_article_id: null,
        bildazo_article_url: null,
        bildazo_article_status: null,
        requested_at: now(),
        published_at: null,
        created_at: now(),
        updated_at: now(),
      };
      records.push(row);
      return { rows: [row] };
    }
    if (s.includes("UPDATE bildazo_article_publish_records") && s.includes("freelancer_user_id")) {
      const row = records.find((r) => Number(r.orderz_application_id) === Number(params[0]));
      if (!row || row.status === "published" || row.status === "already_imported") {
        return { rows: row ? [row] : [] };
      }
      row.freelancer_user_id = params[1];
      row.bildazo_user_id = params[2];
      row.bildazo_public_id = params[3];
      row.status = params[4];
      row.bildazo_category_id = params[5];
      row.last_error = params[6];
      row.last_response_code = params[7];
      row.publish_attempt_count += Number(params[8]) || 0;
      row.updated_at = now();
      return { rows: [row] };
    }
    if (s.includes("UPDATE bildazo_article_publish_records") && s.includes("bildazo_article_id")) {
      const row = records.find((r) => Number(r.orderz_application_id) === Number(params[0]));
      if (!row || row.status === "published" || row.status === "already_imported") {
        return { rows: row ? [row] : [] };
      }
      row.status = params[1];
      if (params[2]) row.bildazo_article_id = params[2];
      if (params[3]) row.bildazo_article_url = params[3];
      if (params[4]) row.bildazo_article_status = params[4];
      row.last_error = params[5];
      row.last_response_code = params[6];
      if (params[7]) row.published_at = params[7];
      row.updated_at = now();
      return { rows: [row] };
    }
    return { rows: [] };
  }

  return { query, records };
}

describe("Phase 2B article publish client", () => {
  it("builds allowlisted body only and never includes password/role", () => {
    const body = buildSafePublishBody({
      orderzArticleId: "9",
      orderzFreelancerId: "11",
      bildazoUserId: BILDAZO_USER,
      bildazoPublicId: "7POFLXBMB",
      title: "T",
      content: "C",
      categoryId: LEAF_CATEGORY,
      acceptedAt: "2026-08-19T08:00:00.000Z",
      reviewerNotes: "ok",
      password: "secret",
      passwordHash: "hash",
      role: "admin",
      authorId: "nope",
    });
    assert.equal(body.source, "orderzhouse");
    assert.equal(body.orderzArticleId, "9");
    assert.equal(body.categoryId, LEAF_CATEGORY);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "password"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "role"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "authorId"), false);
    assert.equal(joinPublishUrl("http://127.0.0.1:4001"), "http://127.0.0.1:4001/api/integrations/orderzhouse/articles/publish");
  });

  it("does not call HTTP when publish is disabled", async () => {
    let called = false;
    const result = await publishAcceptedArticleToBildazo(
      { orderzArticleId: "9", title: "T", content: "C" },
      {
        getConfig: () => ({
          enabled: false,
          baseUrl: "http://127.0.0.1:4001",
          secret: "test",
          timeoutMs: 1000,
        }),
        fetchImpl: async () => {
          called = true;
          return jsonResponse(500, {});
        },
      },
    );
    assert.equal(called, false);
    assert.equal(result.disabled, true);
    assert.equal(result.called, false);
  });
});

describe("Phase 2B category mapping", () => {
  it("never treats OrderzHouse numeric ids as Bildazo UUIDs", () => {
    const resolved = resolveBildazoCategoryId(
      { categoryId: 4, subcategoryId: 12 },
      { defaultCategoryId: "", categoryMap: {} },
    );
    assert.equal(resolved, null);
  });

  it("uses default leaf UUID for local QA only", () => {
    const resolved = resolveBildazoCategoryId(
      { categoryId: 4, subcategoryId: 12 },
      { defaultCategoryId: LEAF_CATEGORY, categoryMap: {} },
    );
    assert.equal(resolved, LEAF_CATEGORY);
  });
});

describe("Phase 2B publish after acceptance", () => {
  beforeEach(() => {
    clearBildazoArticlePublishSchemaCache();
    clearBildazoAuthorLinkSchemaCache();
    clearMarketplaceArticleSubmissionsSchemaCache();
    delete process.env.BILDAZO_ARTICLE_PUBLISH_ENABLED;
    delete process.env.BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID;
  });

  afterEach(() => {
    delete process.env.BILDAZO_ARTICLE_PUBLISH_ENABLED;
    delete process.env.BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID;
    delete process.env.BILDAZO_API_BASE_URL;
    delete process.env.BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET;
  });

  it("defaults publish flag off", () => {
    assert.equal(isBildazoArticlePublishEnabled(), false);
  });

  it("disabled: stores skipped and does not call Bildazo", async () => {
    process.env.BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID = LEAF_CATEGORY;
    const db = createMemoryDb();
    let called = 0;
    const result = await publishAfterArticleAcceptance(
      { applicationId: 9 },
      {
        db,
        getConfig: () => ({
          enabled: false,
          baseUrl: "http://127.0.0.1:4001",
          secret: "test",
          timeoutMs: 1000,
          defaultCategoryId: LEAF_CATEGORY,
          categoryMap: {},
        }),
        publishFn: async () => {
          called += 1;
          throw new Error("should not call");
        },
      },
    );
    assert.equal(called, 0);
    assert.equal(result.disabled, true);
    assert.equal(result.record.status, "skipped");
    assert.equal(db.records.length, 1);
  });

  it("enabled linked author with category sends S2S and stores approved ids", async () => {
    const db = createMemoryDb();
    const bodies = [];
    const result = await publishAfterArticleAcceptance(
      { applicationId: 9 },
      {
        db,
        getConfig: () => ({
          enabled: true,
          baseUrl: "http://127.0.0.1:4001",
          secret: "test-secret",
          timeoutMs: 1000,
          defaultCategoryId: LEAF_CATEGORY,
          categoryMap: {},
        }),
        publishFn: async (payload) => {
          bodies.push(payload);
          return {
            ok: true,
            called: true,
            status: "approved",
            bildazoArticleId: "art-1",
            articleUrl: "http://127.0.0.1:4001/articles/art-1",
            articleStatus: "APPROVED",
            httpStatus: 200,
            errorCode: null,
          };
        },
      },
    );
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].orderzArticleId, "9");
    assert.equal(bodies[0].orderzFreelancerId, "11");
    assert.equal(bodies[0].bildazoUserId, BILDAZO_USER);
    assert.equal(bodies[0].categoryId, LEAF_CATEGORY);
    assert.equal(bodies[0].title, "Final manuscript title");
    assert.equal(bodies[0].content, "This is the freelancer final written article after review.");
    assert.notEqual(bodies[0].content, APPLICATION.proposal_message);
    assert.notEqual(bodies[0].content, ARTICLE.description);
    assert.notEqual(bodies[0].title, ARTICLE.title);
    assert.equal(Object.prototype.hasOwnProperty.call(bodies[0], "password"), false);
    assert.equal(result.record.status, "published");
    assert.equal(result.record.bildazoArticleId, "art-1");
    assert.equal(result.record.bildazoArticleUrl, "http://127.0.0.1:4001/articles/art-1");
    assert.equal(db.records.length, 1);
  });

  it("already_imported is idempotent and does not overwrite success with failed", async () => {
    const db = createMemoryDb();
    const deps = {
      db,
      getConfig: () => ({
        enabled: true,
        defaultCategoryId: LEAF_CATEGORY,
        categoryMap: {},
      }),
      publishFn: async () => ({
        ok: true,
        called: true,
        status: "already_imported",
        bildazoArticleId: "art-1",
        articleUrl: "http://127.0.0.1:4001/articles/art-1",
        articleStatus: "APPROVED",
        httpStatus: 200,
      }),
    };
    await publishAfterArticleAcceptance({ applicationId: 9 }, deps);
    deps.publishFn = async () => ({
      ok: false,
      called: true,
      status: null,
      errorCode: "BILDAZO_ARTICLE_PUBLISH_NETWORK",
    });
    const second = await publishAfterArticleAcceptance({ applicationId: 9 }, deps);
    assert.equal(second.idempotent, true);
    assert.equal(second.record.status, "already_imported");
    assert.equal(db.records.length, 1);
  });

  it("needs_manual_review stores review status", async () => {
    const db = createMemoryDb();
    const result = await publishAfterArticleAcceptance(
      { applicationId: 9 },
      {
        db,
        getConfig: () => ({ enabled: true, defaultCategoryId: LEAF_CATEGORY, categoryMap: {} }),
        publishFn: async () => ({
          ok: false,
          called: true,
          status: "needs_manual_review",
          httpStatus: 200,
          errorCode: "QUALITY_HOLD",
        }),
      },
    );
    assert.equal(result.record.status, "needs_manual_review");
  });

  it("network error stores failed", async () => {
    const db = createMemoryDb();
    const result = await publishAfterArticleAcceptance(
      { applicationId: 9 },
      {
        db,
        getConfig: () => ({ enabled: true, defaultCategoryId: LEAF_CATEGORY, categoryMap: {} }),
        publishFn: async () => ({
          ok: false,
          called: true,
          status: null,
          errorCode: BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.BILDAZO_ARTICLE_PUBLISH_NETWORK,
          httpStatus: null,
        }),
      },
    );
    assert.equal(result.record.status, "failed");
  });

  it("unlinked author does not call Bildazo", async () => {
    const db = createMemoryDb({ link: { status: "pending_new_account", bildazo_user_id: null } });
    let called = 0;
    const result = await publishAfterArticleAcceptance(
      { applicationId: 9 },
      {
        db,
        getConfig: () => ({ enabled: true, defaultCategoryId: LEAF_CATEGORY, categoryMap: {} }),
        publishFn: async () => {
          called += 1;
          return { called: true };
        },
      },
    );
    assert.equal(called, 0);
    assert.equal(result.record.status, "needs_manual_review");
    assert.equal(result.record.lastError, BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.BILDAZO_AUTHOR_NOT_LINKED);
  });

  it("missing category mapping does not call Bildazo", async () => {
    const db = createMemoryDb();
    let called = 0;
    const result = await publishAfterArticleAcceptance(
      { applicationId: 9 },
      {
        db,
        getConfig: () => ({ enabled: true, defaultCategoryId: "", categoryMap: {} }),
        publishFn: async () => {
          called += 1;
          return { called: true };
        },
      },
    );
    assert.equal(called, 0);
    assert.equal(result.record.status, "needs_manual_review");
    assert.equal(result.record.lastError, BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.INVALID_BILDAZO_CATEGORY_MAPPING);
  });

  it("missing final manuscript does not call Bildazo or use proposal/campaign text", async () => {
    const db = createMemoryDb({ manuscript: null });
    let called = 0;
    const result = await publishAfterArticleAcceptance(
      { applicationId: 9 },
      {
        db,
        getConfig: () => ({ enabled: true, defaultCategoryId: LEAF_CATEGORY, categoryMap: {} }),
        publishFn: async () => {
          called += 1;
          return { called: true };
        },
      },
    );
    assert.equal(called, 0);
    assert.equal(result.record.status, "needs_manual_review");
    assert.equal(result.record.lastError, BILDAZO_ARTICLE_PUBLISH_ERROR_CODES.MISSING_FINAL_ARTICLE_CONTENT);
  });

  it("repeated publish does not create a second local record", async () => {
    const db = createMemoryDb();
    const deps = {
      db,
      getConfig: () => ({ enabled: true, defaultCategoryId: LEAF_CATEGORY, categoryMap: {} }),
      publishFn: async () => ({
        ok: true,
        called: true,
        status: "approved",
        bildazoArticleId: "art-1",
        articleUrl: "http://local/a",
        articleStatus: "APPROVED",
        httpStatus: 200,
      }),
    };
    await publishAfterArticleAcceptance({ applicationId: 9 }, deps);
    await publishAfterArticleAcceptance({ applicationId: 9 }, deps);
    assert.equal(db.records.length, 1);
  });
});

describe("Phase 2B files and safety", () => {
  const root = path.join(__dirname, "..");
  function read(rel) {
    return fs.readFileSync(path.join(root, rel), "utf8");
  }

  it("migration 165 is additive and unique per application", () => {
    const sql = read("sql/migrations/165_bildazo_article_publish_records.sql");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS bildazo_article_publish_records/);
    assert.match(sql, /UNIQUE \(orderz_application_id\)/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
    assert.doesNotMatch(sql, /\bDELETE FROM\b/i);
  });

  it("hooks after COMMIT and does not change settlement consume path", () => {
    const apps = read("src/services/marketplaceArticleApplicationsService.js");
    const settle = read("src/services/marketplaceArticleSettlementService.js");
    const finalizeBlock = apps.slice(apps.indexOf("async function finalizeArticleApplicationApproval"));
    assert.ok(finalizeBlock.includes("COMMIT"));
    assert.ok(
      finalizeBlock.indexOf("COMMIT") < finalizeBlock.indexOf("publishAfterArticleAcceptance"),
    );
    assert.match(settle, /enqueueBildazoPublish/);
    assert.match(settle, /consumeBidCreditReservation/);
    assert.doesNotMatch(settle, /publishAcceptedArticleToBildazo/);
  });

  it("env example has publish flag off and no live secret in Bildazo block", () => {
    const envExample = read(".env.example");
    const bildazoBlock = envExample
      .split("# --- Bildazo author gate")
      .slice(1)
      .join("\n")
      .split("# --- Display-only FX")[0];
    assert.match(bildazoBlock, /BILDAZO_ARTICLE_PUBLISH_ENABLED=false/);
    assert.match(bildazoBlock, /BILDAZO_DEFAULT_ARTICLE_CATEGORY_ID=/);
    assert.doesNotMatch(bildazoBlock, /sk_live|whsec_/i);
  });

  it("retry routes are Super Admin only", () => {
    const routes = read("src/routes/superAdminMarketplaceArticleApplicationsRoutes.js");
    assert.match(routes, /bildazo-publish\/retry/);
    assert.match(routes, /requireSuperAdmin/);
  });
});
