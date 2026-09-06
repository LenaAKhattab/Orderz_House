/**
 * Phase 0C Super Admin manual Bildazo author link — no live Bildazo calls, no production DB writes.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/bildazo_placeholder";
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
if (classifyDatabaseUrl(process.env.DATABASE_URL).isProduction) {
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/bildazo_placeholder";
}

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { BILDAZO_AUTHOR_LINK_ERROR_CODES } = require("../src/constants/bildazoAuthorLink");
const { clearBildazoAuthorLinkSchemaCache } = require("../src/utils/bildazoAuthorLinkSchema");
const {
  listBildazoAuthorLinks,
  manualLinkBildazoAuthor,
  updateBildazoAuthorLinkStatus,
  parseManualLinkBody,
} = require("../src/services/bildazoAuthorLinkAdminService");
const integrationClient = require("../src/services/bildazoAuthorIntegrationClient");

const FREELANCER = {
  freelancer_email: "freelancer@orderzhouse.test",
  freelancer_first_name: "أحمد",
  freelancer_father_name: "علي",
  freelancer_family_name: "حسن",
};

function pendingRow(overrides = {}) {
  return {
    id: 7,
    freelancer_user_id: 11,
    link_flow: "new_account",
    status: "pending_new_account",
    orderz_verified_email: "freelancer@orderzhouse.test",
    full_name: "أحمد علي حسن",
    phone_e164: "+962790000000",
    country_iso: "JO",
    bio: null,
    existing_bildazo_email: null,
    existing_bildazo_public_id: null,
    existing_bildazo_profile_url: null,
    email_matches_orderz: false,
    accepted_terms_version: "2026-08-18-v1",
    accepted_at: new Date(),
    source: "orderzhouse",
    bildazo_user_id: null,
    bildazo_public_id: null,
    bildazo_profile_url: null,
    linked_at: null,
    linked_by_user_id: null,
    manual_review_reason: null,
    last_error: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...FREELANCER,
    ...overrides,
  };
}

function createAdminDb({ schemaReady = true, links = [] } = {}) {
  const rows = links.map((row) => ({ ...row }));
  return {
    query: async (sql, params = []) => {
      const s = String(sql);
      if (s.includes("to_regclass('public.freelancer_bildazo_author_links')")) {
        return { rows: [{ tbl: schemaReady ? "freelancer_bildazo_author_links" : null }] };
      }
      if (s.includes("COUNT(*)")) {
        return { rows: [{ total: rows.length }] };
      }
      if (s.includes("SELECT id FROM freelancer_bildazo_author_links") && s.includes("status = 'linked'")) {
        const hit = rows.find(
          (row) =>
            Number(row.id) !== Number(params[0]) &&
            row.status === "linked" &&
            ((params[1] && row.bildazo_user_id === params[1]) ||
              (params[2] && row.bildazo_public_id === params[2]) ||
              (params[3] && row.bildazo_profile_url === params[3])),
        );
        return { rows: hit ? [{ id: hit.id }] : [] };
      }
      if (s.includes("UPDATE freelancer_bildazo_author_links") && s.includes("status = 'linked'")) {
        const row = rows.find((item) => Number(item.id) === Number(params[0]));
        if (!row || row.status === "blocked") return { rows: [] };
        Object.assign(row, {
          status: "linked",
          bildazo_user_id: params[1],
          bildazo_public_id: params[2],
          bildazo_profile_url: params[3],
          linked_at: row.linked_at || new Date(),
          linked_by_user_id: params[4],
          manual_review_reason: params[5] || row.manual_review_reason,
          last_error: null,
          updated_at: new Date(),
        });
        return { rows: [row] };
      }
      if (s.includes("UPDATE freelancer_bildazo_author_links") && s.includes("status <> 'linked'")) {
        const row = rows.find((item) => Number(item.id) === Number(params[0]));
        if (!row || row.status === "linked") return { rows: [] };
        Object.assign(row, {
          status: params[1],
          manual_review_reason: params[2],
          updated_at: new Date(),
        });
        return { rows: [row] };
      }
      if (s.includes("FROM freelancer_bildazo_author_links l")) {
        if (s.includes("WHERE l.id = $1")) {
          const row = rows.find((item) => Number(item.id) === Number(params[0]));
          return { rows: row ? [row] : [] };
        }
        return { rows };
      }
      return { rows: [] };
    },
  };
}

describe("Super Admin Bildazo author link APIs", () => {
  beforeEach(() => {
    clearBildazoAuthorLinkSchemaCache();
  });

  it("Super Admin can list requests", async () => {
    const db = createAdminDb({ links: [pendingRow()] });
    const result = await listBildazoAuthorLinks({}, { db });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].status, "pending_new_account");
    assert.equal(result.items[0].orderzVerifiedEmail, "freelancer@orderzhouse.test");
    assert.equal(result.items[0].freelancerDisplayName, "أحمد علي حسن");
  });

  it("schema not ready returns safe 503", async () => {
    const db = createAdminDb({ schemaReady: false });
    await assert.rejects(
      () => listBildazoAuthorLinks({}, { db }),
      (err) =>
        err.statusCode === 503 &&
        err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_GATE_SCHEMA_MISSING,
    );
    await assert.rejects(
      () =>
        manualLinkBildazoAuthor(
          7,
          { confirmVerified: true, bildazoPublicId: "w-1" },
          99,
          { db },
        ),
      (err) => err.statusCode === 503,
    );
  });

  it("manual link requires confirmVerified", () => {
    assert.throws(
      () => parseManualLinkBody({ bildazoPublicId: "w-1" }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_CONFIRM_REQUIRED,
    );
  });

  it("manual link stores linked status and identifiers", async () => {
    const db = createAdminDb({ links: [pendingRow()] });
    const result = await manualLinkBildazoAuthor(
      7,
      {
        confirmVerified: true,
        bildazoUserId: "42",
        bildazoPublicId: "writer-42",
        bildazoProfileUrl: "https://bildazo.com/u/writer-42",
        manualReviewReason: "verified in Bildazo admin",
      },
      99,
      { db },
    );
    assert.equal(result.link.status, "linked");
    assert.equal(result.link.bildazoPublicId, "writer-42");
    assert.equal(result.link.bildazoUserId, "42");
    assert.equal(result.link.linkedByUserId, "99");
    assert.ok(result.link.linkedAt);
    const listed = await listBildazoAuthorLinks({ status: "linked" }, { db });
    assert.equal(listed.items[0].status, "linked");
  });

  it("manual link does not accept password/role/admin token fields", () => {
    assert.throws(
      () =>
        parseManualLinkBody({
          confirmVerified: true,
          bildazoPublicId: "w-1",
          password: "secret",
        }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_PASSWORD_NOT_ALLOWED,
    );
    assert.throws(
      () =>
        parseManualLinkBody({
          confirmVerified: true,
          bildazoPublicId: "w-1",
          role: "writer",
        }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_SENSITIVE_FIELD,
    );
    assert.throws(
      () =>
        parseManualLinkBody({
          confirmVerified: true,
          bildazoPublicId: "w-1",
          adminToken: "tok",
        }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_SENSITIVE_FIELD,
    );
  });

  it("blocked row cannot be linked", async () => {
    const db = createAdminDb({ links: [pendingRow({ status: "blocked" })] });
    await assert.rejects(
      () =>
        manualLinkBildazoAuthor(7, { confirmVerified: true, bildazoPublicId: "w-1" }, 99, {
          db,
        }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_BLOCKED,
    );
  });

  it("does not overwrite another freelancer's linked publicId", async () => {
    const db = createAdminDb({
      links: [
        pendingRow({
          id: 1,
          freelancer_user_id: 11,
          status: "linked",
          bildazo_public_id: "taken",
          linked_at: new Date(),
        }),
        pendingRow({ id: 2, freelancer_user_id: 22, status: "pending_existing_account" }),
      ],
    });
    await assert.rejects(
      () =>
        manualLinkBildazoAuthor(2, { confirmVerified: true, bildazoPublicId: "taken" }, 99, {
          db,
        }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_IDENTIFIER_IN_USE,
    );
  });

  it("status endpoint cannot set linked", async () => {
    const db = createAdminDb({ links: [pendingRow()] });
    await assert.rejects(
      () => updateBildazoAuthorLinkStatus(7, { status: "linked" }, 99, { db }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    );
  });

  it("status endpoint can mark needs_manual_review / failed / blocked", async () => {
    const db = createAdminDb({ links: [pendingRow()] });
    const reviewed = await updateBildazoAuthorLinkStatus(
      7,
      { status: "needs_manual_review" },
      99,
      { db },
    );
    assert.equal(reviewed.link.status, "needs_manual_review");
    const failed = await updateBildazoAuthorLinkStatus(
      7,
      { status: "failed", manualReviewReason: "لا يوجد حساب مطابق" },
      99,
      { db },
    );
    assert.equal(failed.link.status, "failed");
  });

  it("rejects non-bildazo.com profile URLs", () => {
    assert.throws(
      () =>
        parseManualLinkBody({
          confirmVerified: true,
          bildazoProfileUrl: "https://evil.example/u/1",
        }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    );
    assert.throws(
      () =>
        parseManualLinkBody({
          confirmVerified: true,
          bildazoProfileUrl: "javascript:alert(1)",
        }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    );
  });
});

describe("Phase 0C guards", () => {
  it("routes are Super Admin only and app mounts them", () => {
    const routes = fs.readFileSync(
      path.join(__dirname, "../src/routes/superAdminBildazoAuthorLinkRoutes.js"),
      "utf8",
    );
    assert.match(routes, /requireAuth/);
    assert.match(routes, /requireSuperAdmin/);
    assert.match(routes, /\/bildazo-author-links\/:id\/manual-link/);
    assert.match(routes, /\/bildazo-author-links\/:id\/status/);
    const app = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
    assert.match(app, /superAdminBildazoAuthorLinkRoutes/);
  });

  it("freelancer validateRequestBody never returns linked; S2S apply is the only freelancer linked path", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/bildazoAuthorLinkService.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /status:\s*['"]linked['"]/);
    assert.match(src, /persistBildazoSyncOutcome/);
    assert.match(src, /shouldAttemptBildazoSync/);
  });

  it("no Bildazo API call is made", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/bildazoAuthorLinkAdminService.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /\bfetch\(|axios\.|http\.request|https\.request/);
    assert.match(src, /PASSWORD_NOT_ALLOWED/);
    assert.doesNotMatch(src, /CREATE TABLE|INSERT INTO users/);
    assert.throws(() => integrationClient.assertNoLiveBildazoCall(), (err) => err.statusCode === 501);
  });
});
