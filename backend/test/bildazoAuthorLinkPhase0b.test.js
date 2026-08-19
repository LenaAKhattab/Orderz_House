/**
 * Phase 0B Bildazo author link — no live Bildazo calls, no production DB writes.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/bildazo_placeholder";
delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
delete process.env.BILDAZO_AUTHOR_SYNC_ENABLED;

const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
if (classifyDatabaseUrl(process.env.DATABASE_URL).isProduction) {
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/bildazo_placeholder";
}

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
  BILDAZO_AUTHOR_LINK_REQUIRED_AR,
  BILDAZO_AUTHOR_LINK_ERROR_CODES,
} = require("../src/constants/bildazoAuthorLink");
const { isBildazoAuthorGateEnabled } = require("../src/config/bildazoAuthorGate");
const { clearBildazoAuthorLinkSchemaCache } = require("../src/utils/bildazoAuthorLinkSchema");
const {
  getMyBildazoAuthorLink,
  submitBildazoAuthorLinkRequest,
  assertBildazoAuthorLinkedForArticleApply,
  validateRequestBody,
  resolveExistingAccountStatus,
} = require("../src/services/bildazoAuthorLinkService");
const integrationClient = require("../src/services/bildazoAuthorIntegrationClient");

const USER = {
  id: 11,
  email: "freelancer@orderzhouse.test",
  email_verified: true,
  role: "freelancer",
  first_name: "أحمد",
  father_name: "علي",
  family_name: "حسن",
  phone: "+962790000000",
  country: "JO",
  bio: null,
};

function createMemoryDb({ user = USER, schemaReady = true, link = null } = {}) {
  let row = link ? { ...link } : null;
  let nextId = 1;
  return {
    query: async (sql, params = []) => {
      const s = String(sql);
      if (s.includes("to_regclass('public.freelancer_bildazo_author_links')")) {
        return { rows: [{ tbl: schemaReady ? "freelancer_bildazo_author_links" : null }] };
      }
      if (s.includes("FROM users")) {
        return { rows: user ? [user] : [] };
      }
      if (s.includes("FROM freelancer_bildazo_author_links") && s.includes("SELECT")) {
        return { rows: row ? [row] : [] };
      }
      if (s.includes("INSERT INTO freelancer_bildazo_author_links")) {
        row = {
          id: nextId++,
          freelancer_user_id: params[0],
          link_flow: params[1],
          status: params[2],
          orderz_verified_email: params[3],
          full_name: params[4],
          phone_e164: params[5],
          country_iso: params[6],
          bio: params[7],
          existing_bildazo_email: params[8],
          existing_bildazo_public_id: params[9],
          existing_bildazo_profile_url: params[10],
          email_matches_orderz: params[11],
          accepted_terms_version: params[12],
          accepted_terms_snapshot: params[13],
          accepted_at: new Date(),
          source: "orderzhouse",
          bildazo_user_id: null,
          bildazo_public_id: null,
          bildazo_profile_url: null,
          linked_at: null,
          linked_by_user_id: null,
          created_at: new Date(),
          updated_at: new Date(),
        };
        return { rows: [row] };
      }
      if (s.includes("UPDATE freelancer_bildazo_author_links")) {
        if (!row || row.status === "linked") return { rows: [] };
        if (s.includes("bildazo_user_id")) {
          Object.assign(row, {
            status: params[1],
            bildazo_user_id: params[2],
            bildazo_public_id: params[3],
            bildazo_profile_url: params[4],
            linked_at: new Date(),
            linked_by_user_id: null,
            last_error: null,
            manual_review_reason: null,
            updated_at: new Date(),
          });
          return { rows: [row] };
        }
        if (s.includes("last_error") && !s.includes("link_flow")) {
          Object.assign(row, {
            status: params[1],
            last_error: params[2],
            ...(s.includes("manual_review_reason") ? { manual_review_reason: params[3] } : {}),
            updated_at: new Date(),
          });
          return { rows: [row] };
        }
        Object.assign(row, {
          link_flow: params[1],
          status: params[2],
          orderz_verified_email: params[3],
          full_name: params[4],
          phone_e164: params[5],
          country_iso: params[6],
          bio: params[7],
          existing_bildazo_email: params[8],
          existing_bildazo_public_id: params[9],
          existing_bildazo_profile_url: params[10],
          email_matches_orderz: params[11],
          accepted_terms_version: params[12],
          accepted_terms_snapshot: params[13],
          updated_at: new Date(),
        });
        return { rows: [row] };
      }
      throw new Error(`unexpected sql: ${s.slice(0, 80)}`);
    },
  };
}

function newAccountBody(overrides = {}) {
  return {
    linkFlow: "new_account",
    fullName: "أحمد علي حسن",
    acceptedTermsVersion: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
    acceptedTermsAcknowledged: true,
    ...overrides,
  };
}

function existingBody(overrides = {}) {
  return {
    linkFlow: "existing_account",
    acceptedTermsVersion: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
    acceptedTermsAcknowledged: true,
    ...overrides,
  };
}

describe("bildazo author gate flag", () => {
  it("defaults off", () => {
    delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
    assert.equal(isBildazoAuthorGateEnabled(), false);
  });
  it("enables on true/1", () => {
    process.env.BILDAZO_AUTHOR_GATE_ENABLED = "true";
    assert.equal(isBildazoAuthorGateEnabled(), true);
    process.env.BILDAZO_AUTHOR_GATE_ENABLED = "1";
    assert.equal(isBildazoAuthorGateEnabled(), true);
    delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
  });
});

describe("bildazo author link GET/POST", () => {
  beforeEach(() => {
    clearBildazoAuthorLinkSchemaCache();
    delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
    delete process.env.BILDAZO_AUTHOR_SYNC_ENABLED;
  });

  it("freelancer can fetch empty link state", async () => {
    const db = createMemoryDb();
    const me = await getMyBildazoAuthorLink(11, { db });
    assert.equal(me.status, "not_started");
    assert.equal(me.orderzVerifiedEmail, USER.email);
    assert.equal(me.canApplyToArticles, true);
    assert.equal(me.gateEnabled, false);
  });

  it("freelancer can submit new_account link request", async () => {
    const db = createMemoryDb();
    const result = await submitBildazoAuthorLinkRequest(11, newAccountBody(), { db });
    assert.equal(result.alreadyLinked, false);
    assert.equal(result.link.status, "pending_new_account");
    assert.equal(result.link.linkFlow, "new_account");
    assert.equal(result.link.canApplyToArticles, true);
  });

  it("new_account uses authenticated OrderzHouse email, not frontend email", async () => {
    const db = createMemoryDb();
    const result = await submitBildazoAuthorLinkRequest(
      11,
      newAccountBody({ email: "spoof@evil.test" }),
      { db },
    );
    assert.equal(result.link.orderzVerifiedEmail, "freelancer@orderzhouse.test");
    assert.notEqual(result.link.orderzVerifiedEmail, "spoof@evil.test");
  });

  it("new_account password is accepted only in-memory and never stored on the row", async () => {
    const db = createMemoryDb();
    const result = await submitBildazoAuthorLinkRequest(
      11,
      newAccountBody({ password: "Writer1x", passwordConfirm: "Writer1x" }),
      { db },
    );
    assert.equal(result.link.status, "pending_new_account");
    const stored = await db.query("SELECT * FROM freelancer_bildazo_author_links");
    assert.equal(stored.rows[0].password, undefined);
    assert.equal(stored.rows[0].password_hash, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(stored.rows[0], "password"), false);
  });

  it("passwordHash is still rejected", async () => {
    const db = createMemoryDb();
    await assert.rejects(
      () => submitBildazoAuthorLinkRequest(11, newAccountBody({ passwordHash: "x" }), { db }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_PASSWORD_NOT_ALLOWED,
    );
  });

  it("freelancer can submit existing_account with email", async () => {
    const db = createMemoryDb();
    const result = await submitBildazoAuthorLinkRequest(
      11,
      existingBody({ existingBildazoEmail: USER.email }),
      { db },
    );
    assert.equal(result.link.status, "pending_existing_account");
    assert.equal(result.link.submitted.emailMatchesOrderz, true);
  });

  it("freelancer can submit existing_account with publicId", async () => {
    const db = createMemoryDb();
    const result = await submitBildazoAuthorLinkRequest(
      11,
      existingBody({ existingBildazoPublicId: "writer-42" }),
      { db },
    );
    assert.equal(result.link.status, "pending_existing_account");
    assert.equal(result.link.submitted.existingBildazoPublicId, "writer-42");
  });

  it("freelancer can submit existing_account with profileUrl", async () => {
    const db = createMemoryDb();
    const result = await submitBildazoAuthorLinkRequest(
      11,
      existingBody({ existingBildazoProfileUrl: "https://bildazo.com/u/ahmad" }),
      { db },
    );
    assert.equal(result.link.submitted.existingBildazoProfileUrl, "https://bildazo.com/u/ahmad");
  });

  it("existing_account requires at least one identifier", () => {
    assert.throws(
      () => validateRequestBody(existingBody(), { orderzEmail: USER.email }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    );
  });

  it("existing_account with same email sets email_matches_orderz", () => {
    const resolved = resolveExistingAccountStatus({
      existingEmail: USER.email,
      orderzEmail: USER.email,
    });
    assert.equal(resolved.emailMatchesOrderz, true);
    assert.equal(resolved.status, "pending_existing_account");
  });

  it("existing_account with different email becomes pending_external_verification, not linked", async () => {
    const db = createMemoryDb();
    const result = await submitBildazoAuthorLinkRequest(
      11,
      existingBody({ existingBildazoEmail: "other@bildazo.test" }),
      { db },
    );
    assert.equal(result.link.status, "pending_external_verification");
    assert.equal(result.link.submitted.emailMatchesOrderz, false);
    assert.notEqual(result.link.status, "linked");
  });

  it("linked status is not overwritten by a normal request", async () => {
    const db = createMemoryDb({
      link: {
        id: 9,
        freelancer_user_id: 11,
        link_flow: "new_account",
        status: "linked",
        orderz_verified_email: USER.email,
        full_name: "Locked",
        bildazo_public_id: "pub-1",
        bildazo_user_id: "2",
        bildazo_profile_url: "https://bildazo.com/u/locked",
        linked_at: new Date(),
        email_matches_orderz: false,
        accepted_terms_version: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
        accepted_at: new Date(),
        source: "orderzhouse",
      },
    });
    const result = await submitBildazoAuthorLinkRequest(11, newAccountBody({ fullName: "Hacker" }), {
      db,
    });
    assert.equal(result.alreadyLinked, true);
    assert.equal(result.link.status, "linked");
    assert.equal(result.link.linked.bildazoPublicId, "pub-1");
  });

  it("invalid fullName rejected", () => {
    assert.throws(
      () => validateRequestBody(newAccountBody({ fullName: "أ" }), { orderzEmail: USER.email }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    );
  });

  it("invalid email rejected", () => {
    assert.throws(
      () =>
        validateRequestBody(
          existingBody({
            existingBildazoEmail: "not-an-email",
            existingBildazoPublicId: "",
            existingBildazoProfileUrl: "",
          }),
          { orderzEmail: USER.email },
        ),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    );
  });

  it("terms acknowledgment required", () => {
    assert.throws(
      () =>
        validateRequestBody(newAccountBody({ acceptedTermsAcknowledged: false }), {
          orderzEmail: USER.email,
        }),
      (err) => err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    );
  });

  it("client cannot use freelancer link service", async () => {
    const db = createMemoryDb({ user: { ...USER, role: "client" } });
    await assert.rejects(
      () => getMyBildazoAuthorLink(11, { db }),
      (err) => err.statusCode === 403,
    );
  });
});

describe("article apply gate", () => {
  beforeEach(() => {
    clearBildazoAuthorLinkSchemaCache();
    delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
    delete process.env.BILDAZO_AUTHOR_SYNC_ENABLED;
  });

  it("when flag is off, apply is not blocked by missing link", async () => {
    const db = createMemoryDb({ link: null });
    const result = await assertBildazoAuthorLinkedForArticleApply(11, { db });
    assert.equal(result.required, false);
  });

  it("when flag is on and unlinked, returns BILDAZO_AUTHOR_LINK_REQUIRED", async () => {
    process.env.BILDAZO_AUTHOR_GATE_ENABLED = "true";
    const db = createMemoryDb();
    await assert.rejects(
      () => assertBildazoAuthorLinkedForArticleApply(11, { db }),
      (err) =>
        err.publicCode === BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_REQUIRED &&
        err.statusCode === 409 &&
        err.message === BILDAZO_AUTHOR_LINK_REQUIRED_AR,
    );
    delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
  });

  it("when flag is on and linked, apply prerequisite passes", async () => {
    process.env.BILDAZO_AUTHOR_GATE_ENABLED = "true";
    const db = createMemoryDb({
      link: {
        id: 1,
        freelancer_user_id: 11,
        status: "linked",
        link_flow: "new_account",
        orderz_verified_email: USER.email,
      },
    });
    const result = await assertBildazoAuthorLinkedForArticleApply(11, { db });
    assert.equal(result.linked, true);
    delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
  });
});

describe("no live Bildazo integration in Phase 0B", () => {
  it("integration client refuses create/lookup/link", async () => {
    assert.throws(() => integrationClient.assertNoLiveBildazoCall(), (err) => err.statusCode === 501);
    await assert.rejects(() => integrationClient.createWriterAccount());
    await assert.rejects(() => integrationClient.lookupExistingWriter());
  });

  it("link service source never persists password hashes or calls HTTP directly", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/bildazoAuthorLinkService.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /password_hash/);
    assert.doesNotMatch(src, /\bfetch\(|axios\.|http\.request|https\.request/);
    assert.doesNotMatch(src, /console\.(log|info|warn|error)\([^)]*password/);
  });

  it("article apply calls the gate before Bid reserve", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceArticleApplicationsService.js"),
      "utf8",
    );
    const gateAt = src.indexOf("assertBildazoAuthorLinkedForArticleApply");
    const reserveAt = src.indexOf("reserveBidCreditsFefo");
    assert.ok(gateAt > 0 && reserveAt > gateAt);
    assert.match(src, /opportunityBidCollectionService/);
  });

  it("routes are freelancer-guarded and app mounts them", () => {
    const routes = fs.readFileSync(
      path.join(__dirname, "../src/routes/freelancerBildazoAuthorLinkRoutes.js"),
      "utf8",
    );
    assert.match(routes, /requireAuth/);
    assert.match(routes, /requireFreelancer/);
    assert.match(routes, /\/bildazo-author-link\/me/);
    assert.match(routes, /\/bildazo-author-link\/request/);
    const app = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
    assert.match(app, /freelancerBildazoAuthorLinkRoutes/);
  });

  it("migration 164 is additive CREATE TABLE", () => {
    const sql = fs.readFileSync(
      path.join(__dirname, "../sql/migrations/164_freelancer_bildazo_author_links.sql"),
      "utf8",
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS freelancer_bildazo_author_links/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b|\bTRUNCATE TABLE\b|\bDELETE FROM\b/);
  });
});
