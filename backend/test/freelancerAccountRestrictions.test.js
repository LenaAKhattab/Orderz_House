/**
 * Super Admin ACCOUNT_REVIEW_HOLD / marketplace restriction regression tests.
 * Static + pure service unit coverage (no Production mutations).
 *
 * Run: node --test test/freelancerAccountRestrictions.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/account_restrictions_placeholder";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  RESTRICTION_TYPES,
  RESTRICTION_STATUSES,
  RESTRICTION_SCOPES,
  BID_MODERATION_STATUS,
  AUDIT_ACTIONS,
  PUBLIC_MESSAGES,
} = require("../src/constants/freelancerAccountRestrictions");

const {
  normalizeScopes,
  scopesInclude,
  clientVisibleBidModerationSql,
  assertMarketplaceActionAllowedOrHeld,
  getActiveFreelancerRestrictions,
  clearSchemaCache,
} = require("../src/services/freelancerAccountRestrictionsService");

describe("ACCOUNT_RESTRICTIONS constants", () => {
  it("defines additive restriction types and statuses", () => {
    assert.equal(RESTRICTION_TYPES.ACCOUNT_REVIEW_HOLD, "ACCOUNT_REVIEW_HOLD");
    assert.equal(RESTRICTION_STATUSES.ACTIVE, "ACTIVE");
    assert.equal(BID_MODERATION_STATUS.HELD, "held");
    assert.equal(AUDIT_ACTIONS.BID_HELD_FOR_REVIEW, "bid_held_for_review");
    assert.equal(AUDIT_ACTIONS.CLAIM_HELD_FOR_REVIEW, "claim_held_for_review");
    assert.equal(AUDIT_ACTIONS.ARTICLE_HELD_FOR_REVIEW, "article_held_for_review");
  });

  it("exposes truthful public messages (no fake client visibility)", () => {
    assert.match(PUBLIC_MESSAGES.BID_HELD_AR, /قيد المراجعة/);
    assert.match(PUBLIC_MESSAGES.BID_HELD_EN, /under review/i);
    assert.doesNotMatch(PUBLIC_MESSAGES.BID_HELD_EN, /client|visible|submitted to/i);
    assert.match(PUBLIC_MESSAGES.CLAIM_HELD_AR, /قيد المراجعة/);
    assert.match(PUBLIC_MESSAGES.ARTICLE_HELD_AR, /قيد المراجعة/);
  });
});

describe("ACCOUNT_RESTRICTIONS scope helpers", () => {
  it("normalizes ALL_MARKETPLACE over granular scopes", () => {
    assert.deepEqual(normalizeScopes(["bids", "ALL_MARKETPLACE", "articles"]), ["ALL_MARKETPLACE"]);
    assert.deepEqual(normalizeScopes(["bids", "direct_claims"]), ["bids", "direct_claims"]);
    assert.deepEqual(normalizeScopes([]), ["ALL_MARKETPLACE"]);
    assert.deepEqual(normalizeScopes(["bogus"]), ["ALL_MARKETPLACE"]);
  });

  it("scopesInclude honors ALL_MARKETPLACE", () => {
    assert.equal(scopesInclude(["ALL_MARKETPLACE"], RESTRICTION_SCOPES.BIDS), true);
    assert.equal(scopesInclude(["bids"], RESTRICTION_SCOPES.BIDS), true);
    assert.equal(scopesInclude(["bids"], RESTRICTION_SCOPES.DIRECT_CLAIMS), false);
  });

  it("clientVisibleBidModerationSql excludes held", () => {
    const sql = clientVisibleBidModerationSql("b");
    assert.match(sql, /published/);
    assert.match(sql, /released/);
    assert.doesNotMatch(sql, /held/);
  });
});

describe("ACCOUNT_RESTRICTIONS migration 201", () => {
  const sqlPath = path.join(
    __dirname,
    "..",
    "sql",
    "migrations",
    "201_freelancer_account_restrictions.sql",
  );
  const sql = fs.readFileSync(sqlPath, "utf8");

  it("is additive and registers schema version", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS freelancer_account_restrictions/);
    assert.match(sql, /freelancer_account_restriction_audit_logs/);
    assert.match(sql, /moderation_status/);
    assert.match(sql, /freelancer_moderation_held_claims/);
    assert.match(sql, /201_freelancer_account_restrictions/);
    assert.doesNotMatch(sql, /DROP TABLE/i);
    assert.doesNotMatch(sql, /UPDATE\s+users\b/i);
    assert.doesNotMatch(sql, /SET\s+is_active/i);
  });
});

describe("ACCOUNT_RESTRICTIONS wiring (static)", () => {
  it("Super Admin routes require Super Admin only", () => {
    const routes = fs.readFileSync(
      path.join(__dirname, "..", "src", "routes", "superAdminAccountRestrictionsRoutes.js"),
      "utf8",
    );
    assert.match(routes, /requireSuperAdmin/);
    assert.match(routes, /\/account-restrictions/);
    assert.match(routes, /held-bids/);
    assert.doesNotMatch(routes, /requireAdmin(?!Write)/);
  });

  it("ordersService holds bids and skips client notify + permanent charge", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ordersService.js"), "utf8");
    assert.match(src, /assertMarketplaceActionAllowedOrHeld/);
    assert.match(src, /held_for_review_reserved|reserveBidCreditsFefo/);
    assert.match(src, /Never notify the client about held moderation bids/);
    assert.match(src, /freelancer_moderation_held_claims/);
    assert.match(src, /assertOrderAssignmentAllowed/);
    assert.match(src, /clientVisibleOnly:\s*true/);
  });

  it("claim hold path does not call first-order activation before return", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ordersService.js"), "utf8");
    const holdIdx = src.indexOf("CLAIM_HELD_FOR_REVIEW");
    assert.ok(holdIdx > 0);
    const slice = src.slice(holdIdx, holdIdx + 1200);
    assert.match(slice, /assigned:\s*false/);
    assert.doesNotMatch(slice, /activateCurrentSubscriptionOnFirstAcceptedOrder/);
  });

  it("article applications hold and skip collection/auto-assign", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "marketplaceArticleApplicationsService.js"),
      "utf8",
    );
    assert.match(src, /ARTICLE_HELD_FOR_REVIEW/);
    assert.match(src, /articleHeldForReview/);
    assert.match(src, /ARTICLE_APPLICATION_HELD_FOR_REVIEW/);
  });

  it("fair ranking excludes held moderation applications", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "articleFairDistributionAdapterService.js"),
      "utf8",
    );
    assert.match(src, /moderation_status IS NULL OR a\.moderation_status IN \('published', 'released'\)/);
  });

  it("stripe bid selection blocks held bids", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "stripeCheckoutService.js"),
      "utf8",
    );
    assert.match(src, /BID_HELD_FOR_REVIEW/);
    assert.match(src, /assertOrderAssignmentAllowed/);
  });

  it("app mounts Super Admin account restriction routes", () => {
    const app = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
    assert.match(app, /superAdminAccountRestrictionsRoutes/);
  });
});

describe("assertMarketplaceActionAllowedOrHeld (mocked schema)", () => {
  const originalQuery = require("../src/config/db").pool.query;
  let queries;

  beforeEach(() => {
    clearSchemaCache();
    queries = [];
    require("../src/config/db").pool.query = async (sql, params) => {
      queries.push({ sql: String(sql), params });
      if (String(sql).includes("to_regclass")) {
        return { rows: [{ t: "freelancer_account_restrictions" }] };
      }
      if (String(sql).includes("UPDATE freelancer_account_restrictions")) {
        return { rows: [], rowCount: 0 };
      }
      if (String(sql).includes("FROM freelancer_account_restrictions")) {
        const scopes = params?.[3] || null;
        // simulate via captured filter — return active bids hold when user 42
        if (Number(params?.[0]) === 42) {
          return {
            rows: [
              {
                id: 9,
                user_id: 42,
                restriction_type: "ACCOUNT_REVIEW_HOLD",
                status: "ACTIVE",
                scopes: ["bids"],
                internal_reason: "internal QA hold reason",
                internal_note: null,
                created_by_admin_id: 1,
                created_at: new Date().toISOString(),
                starts_at: new Date(Date.now() - 1000).toISOString(),
                expires_at: null,
                revoked_at: null,
                revoked_by_admin_id: null,
                revoke_reason: null,
                metadata: null,
              },
            ],
          };
        }
        if (Number(params?.[0]) === 77) {
          return {
            rows: [
              {
                id: 11,
                user_id: 77,
                restriction_type: "ACCOUNT_REVIEW_HOLD",
                status: "ACTIVE",
                scopes: ["ALL_MARKETPLACE"],
                internal_reason: "full hold",
                internal_note: null,
                created_by_admin_id: 1,
                created_at: new Date().toISOString(),
                starts_at: new Date(Date.now() - 1000).toISOString(),
                expires_at: null,
                revoked_at: null,
                revoked_by_admin_id: null,
                revoke_reason: null,
                metadata: null,
              },
            ],
          };
        }
        return { rows: [] };
      }
      return { rows: [] };
    };
  });

  afterEach(() => {
    require("../src/config/db").pool.query = originalQuery;
    clearSchemaCache();
  });

  it("A/B: normal freelancer not held; restricted bids held", async () => {
    const normal = await assertMarketplaceActionAllowedOrHeld(10, RESTRICTION_SCOPES.BIDS);
    assert.equal(normal.held, false);

    const held = await assertMarketplaceActionAllowedOrHeld(42, RESTRICTION_SCOPES.BIDS);
    assert.equal(held.held, true);
    assert.equal(held.primaryRestriction.internalReason, "internal QA hold reason");

    const claimOk = await assertMarketplaceActionAllowedOrHeld(42, RESTRICTION_SCOPES.DIRECT_CLAIMS);
    assert.equal(claimOk.held, false, "bids-only restriction must not hold claims");
  });

  it("ALL_MARKETPLACE holds articles and claims", async () => {
    const article = await assertMarketplaceActionAllowedOrHeld(77, RESTRICTION_SCOPES.ARTICLES);
    const claim = await assertMarketplaceActionAllowedOrHeld(77, RESTRICTION_SCOPES.DIRECT_CLAIMS);
    assert.equal(article.held, true);
    assert.equal(claim.held, true);
  });

  it("getActiveFreelancerRestrictions returns mapped rows", async () => {
    const rows = await getActiveFreelancerRestrictions(42);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].restrictionType, "ACCOUNT_REVIEW_HOLD");
    assert.deepEqual(rows[0].scopes, ["bids"]);
  });
});

describe("ACCOUNT_RESTRICTIONS frontend i18n present", () => {
  it("ships ar/en locale packs and page route", () => {
    const ar = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../../frontend/src/locales/ar/accountRestrictions.json"),
        "utf8",
      ),
    );
    const en = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../../frontend/src/locales/en/accountRestrictions.json"),
        "utf8",
      ),
    );
    assert.equal(ar.title, "مركز قيود الحسابات");
    assert.equal(en.title, "Account Restrictions");
    assert.ok(ar.privacyNote);
    assert.ok(en.activeHoldBadge);
    const app = fs.readFileSync(path.join(__dirname, "../../frontend/src/App.jsx"), "utf8");
    assert.match(app, /account-restrictions/);
  });
});
