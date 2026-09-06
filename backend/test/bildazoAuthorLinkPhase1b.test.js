/**
 * Phase 1B — optional backend-only Bildazo S2S link/create.
 * Does not connect to production. Does not call Bildazo production.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/bildazo_placeholder";
delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
delete process.env.BILDAZO_AUTHOR_SYNC_ENABLED;
delete process.env.BILDAZO_API_BASE_URL;
delete process.env.BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET;

const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
if (classifyDatabaseUrl(process.env.DATABASE_URL).isProduction) {
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/bildazo_placeholder";
}

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION } = require("../src/constants/bildazoAuthorLink");
const { isBildazoAuthorGateEnabled } = require("../src/config/bildazoAuthorGate");
const { isBildazoAuthorSyncEnabled } = require("../src/config/bildazoAuthorSync");
const { clearBildazoAuthorLinkSchemaCache } = require("../src/utils/bildazoAuthorLinkSchema");
const {
  submitBildazoAuthorLinkRequest,
  changeBildazoAuthorLink,
  assertBildazoAuthorLinkedForArticleApply,
} = require("../src/services/bildazoAuthorLinkService");
const {
  linkOrCreateBildazoAuthor,
  createAndLinkBildazoAuthor,
  linkExistingBildazoAuthorWithCredentials,
  replaceBildazoAuthorLink,
  buildSafeRequestBody,
  buildCreateAndLinkRequestBody,
  buildCredentialLinkRequestBody,
  buildReplaceLinkRequestBody,
  joinLinkOrCreateUrl,
} = require("../src/services/bildazoAuthorIntegrationClient");

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
  const db = {
    insertCount: 0,
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
        db.insertCount += 1;
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
          last_error: null,
          created_at: new Date(),
          updated_at: new Date(),
        };
        return { rows: [row] };
      }
      if (s.includes("UPDATE freelancer_bildazo_author_links")) {
        if (s.includes("AND status = 'linked'")) {
          if (!row || row.status !== "linked") return { rows: [] };
          Object.assign(row, {
            link_flow: params[1],
            existing_bildazo_email: params[2],
            bildazo_user_id: params[3],
            bildazo_public_id: params[4],
            bildazo_profile_url: params[5],
            linked_at: new Date(),
            last_error: null,
            updated_at: new Date(),
          });
          return { rows: [row] };
        }
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
          last_error: null,
          updated_at: new Date(),
        });
        return { rows: [row] };
      }
      throw new Error(`unexpected sql: ${s.slice(0, 80)}`);
    },
  };
  return db;
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

function mockSync(result) {
  const calls = [];
  const impl = async (payload) => {
    calls.push({
      ...payload,
      password: payload.password ? "[present]" : undefined,
      hadPassword: Boolean(payload.password),
    });
    return typeof result === "function" ? result(payload) : result;
  };
  return {
    calls,
    linkOrCreateBildazoAuthor: impl,
    createAndLinkBildazoAuthor: impl,
    linkExistingBildazoAuthorWithCredentials: impl,
    replaceBildazoAuthorLink: impl,
  };
}

function linkedOk(status) {
  return {
    ok: true,
    disabled: false,
    called: true,
    status,
    bildazoUserId: "42",
    bildazoPublicId: "w-public-1",
    profileUrl: null,
    errorCode: null,
    safeMessage: status,
    httpStatus: 200,
  };
}

const LOCAL_FETCH_CFG = {
  enabled: true,
  baseUrl: "http://127.0.0.1:3999",
  secret: "test-local-secret",
  timeoutMs: 50,
};

function jsonResponse(status, body) {
  return {
    status,
    text: async () => JSON.stringify(body),
  };
}

describe("Phase 1B Bildazo S2S client", () => {
  it("join URL appends the Bildazo link-or-create path", () => {
    assert.equal(
      joinLinkOrCreateUrl("http://127.0.0.1:4000"),
      "http://127.0.0.1:4000/api/integrations/orderzhouse/authors/link-or-create",
    );
    assert.equal(
      joinLinkOrCreateUrl("http://127.0.0.1:4000/api"),
      "http://127.0.0.1:4000/api/integrations/orderzhouse/authors/link-or-create",
    );
  });

  it("safe body never includes password fields", () => {
    const body = buildSafeRequestBody({
      orderzFreelancerId: "11",
      email: "freelancer@orderzhouse.test",
      fullName: "أحمد",
      password: "nope",
      passwordHash: "nope",
    });
    assert.equal(body.password, undefined);
    assert.equal(body.passwordHash, undefined);
    assert.equal(body.email, "freelancer@orderzhouse.test");
  });

  it("create-and-link body includes password but never passwordHash/role", () => {
    const body = buildCreateAndLinkRequestBody({
      orderzFreelancerId: "11",
      email: USER.email,
      fullName: "أحمد",
      password: "Writer1x",
      passwordHash: "nope",
      roleId: 99,
    });
    assert.equal(body.password, "Writer1x");
    assert.equal(body.passwordHash, undefined);
    assert.equal(body.roleId, undefined);
  });

  it("credential-link body is email+password only", () => {
    const body = buildCredentialLinkRequestBody({
      orderzFreelancerId: "11",
      email: "a@b.com",
      password: "Writer1x",
      roleId: 2,
    });
    assert.deepEqual(Object.keys(body).sort(), ["email", "orderzFreelancerId", "password"]);
  });

  it("replace-link body requires replace=true and never sends passwordHash", async () => {
    const body = buildReplaceLinkRequestBody({
      orderzFreelancerId: "11",
      email: "a@b.com",
      password: "Writer1x",
      linkFlow: "existing_account",
      passwordHash: "nope",
      roleId: 2,
    });
    assert.equal(body.replace, true);
    assert.equal(body.password, "Writer1x");
    assert.equal(body.passwordHash, undefined);
    assert.equal(body.roleId, undefined);
    assert.match(
      (await replaceBildazoAuthorLink(
        { orderzFreelancerId: "11", email: "a@b.com", password: "Writer1x", linkFlow: "existing_account" },
        {
          getConfig: () => LOCAL_FETCH_CFG,
          fetchImpl: async (url, opts) => {
            assert.match(url, /\/authors\/replace-link$/);
            const sent = JSON.parse(opts.body);
            assert.equal(sent.replace, true);
            return jsonResponse(200, {
              status: "replaced",
              bildazoUserId: "99",
              bildazoPublicId: "pub-99",
            });
          },
        },
      )).status,
      /replaced/,
    );
  });

  it("disabled sync makes no HTTP call", async () => {
    let called = 0;
    const result = await linkOrCreateBildazoAuthor(
      { orderzFreelancerId: "11", email: USER.email, fullName: "أحمد علي حسن" },
      {
        getConfig: () => ({ ...LOCAL_FETCH_CFG, enabled: false }),
        fetchImpl: async () => {
          called += 1;
          throw new Error("must not fetch");
        },
      },
    );
    assert.equal(called, 0);
    assert.equal(result.disabled, true);
    assert.equal(result.called, false);
    assert.equal(result.ok, true);
  });

  it("enabled but missing base URL/secret returns config error and does not fetch", async () => {
    let called = 0;
    const result = await linkOrCreateBildazoAuthor(
      { orderzFreelancerId: "11", email: USER.email, fullName: "أحمد علي حسن" },
      {
        getConfig: () => ({ enabled: true, baseUrl: "", secret: "", timeoutMs: 8000 }),
        fetchImpl: async () => {
          called += 1;
          throw new Error("must not fetch");
        },
      },
    );
    assert.equal(called, 0);
    assert.equal(result.called, false);
    assert.equal(result.errorCode, "BILDAZO_SYNC_CONFIG_MISSING");
    assert.notEqual(result.status, "linked");
  });

  it("maps created/linked/already_linked and never sends password", async () => {
    let captured;
    const result = await linkOrCreateBildazoAuthor(
      {
        orderzFreelancerId: "11",
        email: USER.email,
        fullName: "أحمد علي حسن",
        password: "secret",
        passwordHash: "hash",
      },
      {
        getConfig: () => LOCAL_FETCH_CFG,
        fetchImpl: async (url, opts) => {
          captured = { url, opts };
          return jsonResponse(200, {
            status: "created",
            bildazoUserId: "99",
            bildazoPublicId: "pub-99",
            profileUrl: null,
            message: "ok",
          });
        },
      },
    );
    const body = JSON.parse(captured.opts.body);
    assert.equal(body.password, undefined);
    assert.equal(body.passwordHash, undefined);
    assert.equal(captured.opts.headers["X-OrderzHouse-Integration-Secret"], "test-local-secret");
    assert.match(captured.url, /\/api\/integrations\/orderzhouse\/authors\/link-or-create$/);
    assert.equal(result.status, "created");
    assert.equal(result.bildazoUserId, "99");
    assert.equal(result.bildazoPublicId, "pub-99");
    assert.equal(result.profileUrl, null);
  });

  it("create-and-link posts password to the dedicated path", async () => {
    let captured;
    const result = await createAndLinkBildazoAuthor(
      {
        orderzFreelancerId: "11",
        email: USER.email,
        fullName: "أحمد علي حسن",
        password: "Writer1x",
      },
      {
        getConfig: () => LOCAL_FETCH_CFG,
        fetchImpl: async (url, opts) => {
          captured = { url, opts };
          return jsonResponse(200, {
            status: "created",
            bildazoUserId: "99",
            bildazoPublicId: "pub-99",
            profileUrl: null,
          });
        },
      },
    );
    const body = JSON.parse(captured.opts.body);
    assert.equal(body.password, "Writer1x");
    assert.match(captured.url, /\/authors\/create-and-link$/);
    assert.equal(result.status, "created");
  });

  it("credential link maps 401 to a generic invalid-credentials result", async () => {
    const result = await linkExistingBildazoAuthorWithCredentials(
      { orderzFreelancerId: "11", email: "a@b.com", password: "Wrong1x" },
      {
        getConfig: () => LOCAL_FETCH_CFG,
        fetchImpl: async () => jsonResponse(401, { ok: false, code: "INVALID_CREDENTIALS", error: "Invalid email or password" }),
      },
    );
    assert.equal(result.errorCode, "BILDAZO_SYNC_INVALID_CREDENTIALS");
    assert.equal(result.ok, false);
    assert.equal(result.safeMessage, "Invalid email or password");
  });

  it("credential link maps 404 to endpoint-missing without leaking bodies", async () => {
    const result = await linkExistingBildazoAuthorWithCredentials(
      { orderzFreelancerId: "11", email: "a@b.com", password: "Writer1x" },
      {
        getConfig: () => LOCAL_FETCH_CFG,
        fetchImpl: async () => jsonResponse(404, { error: "Not Found" }),
      },
    );
    assert.equal(result.errorCode, "BILDAZO_SYNC_ENDPOINT_MISSING");
    assert.equal(result.httpStatus, 404);
    assert.equal(result.ok, false);
    assert.match(result.safeMessage, /unavailable/i);
    assert.doesNotMatch(JSON.stringify(result), /Writer1x/);
  });

  it("timeout/network errors are safe failures", async () => {
    const timeout = await linkOrCreateBildazoAuthor(
      { orderzFreelancerId: "11", email: USER.email, fullName: "أحمد علي حسن" },
      {
        getConfig: () => LOCAL_FETCH_CFG,
        fetchImpl: async () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          throw err;
        },
      },
    );
    assert.equal(timeout.errorCode, "BILDAZO_SYNC_TIMEOUT");
    assert.equal(timeout.status, null);

    const network = await linkOrCreateBildazoAuthor(
      { orderzFreelancerId: "11", email: USER.email, fullName: "أحمد علي حسن" },
      {
        getConfig: () => LOCAL_FETCH_CFG,
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
      },
    );
    assert.equal(network.errorCode, "BILDAZO_SYNC_NETWORK");
    assert.notEqual(network.status, "linked");
  });

  it("unknown response status is a safe failure", async () => {
    const result = await linkOrCreateBildazoAuthor(
      { orderzFreelancerId: "11", email: USER.email, fullName: "أحمد علي حسن" },
      {
        getConfig: () => LOCAL_FETCH_CFG,
        fetchImpl: async () => jsonResponse(200, { status: "published", bildazoUserId: "1" }),
      },
    );
    assert.equal(result.errorCode, "BILDAZO_SYNC_UNKNOWN_STATUS");
    assert.equal(result.status, null);
  });
});

describe("Phase 1B freelancer request S2S mapping", () => {
  beforeEach(() => {
    clearBildazoAuthorLinkSchemaCache();
    delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
    delete process.env.BILDAZO_AUTHOR_SYNC_ENABLED;
  });

  afterEach(() => {
    delete process.env.BILDAZO_AUTHOR_SYNC_ENABLED;
    delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
  });

  it("sync disabled keeps pending_new_account and makes no HTTP call", async () => {
    assert.equal(isBildazoAuthorSyncEnabled(), false);
    const db = createMemoryDb();
    const sync = mockSync(() => {
      throw new Error("sync client must not be called when disabled");
    });
    const result = await submitBildazoAuthorLinkRequest(11, newAccountBody(), { db, syncClient: sync });
    assert.equal(result.link.status, "pending_new_account");
    assert.equal(sync.calls.length, 0);
    assert.equal(result.link.linked, null);
  });

  it("sync enabled with created sets local linked and stores ids", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    const sync = mockSync(linkedOk("created"));
    const result = await submitBildazoAuthorLinkRequest(11, newAccountBody(), { db, syncClient: sync });
    assert.equal(result.link.status, "linked");
    assert.equal(result.link.linked.bildazoUserId, "42");
    assert.equal(result.link.linked.bildazoPublicId, "w-public-1");
    assert.equal(result.link.linked.bildazoProfileUrl, null);
    assert.ok(result.link.linked.linkedAt);
    assert.equal(sync.calls.length, 1);
  });

  it("sync enabled with linked or already_linked sets local linked", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    for (const status of ["linked", "already_linked"]) {
      const db = createMemoryDb();
      const result = await submitBildazoAuthorLinkRequest(11, newAccountBody(), {
        db,
        syncClient: mockSync(linkedOk(status)),
      });
      assert.equal(result.link.status, "linked");
      assert.equal(result.link.linked.bildazoPublicId, "w-public-1");
    }
  });

  it("needs_manual_review stays reviewable and is not linked", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    const result = await submitBildazoAuthorLinkRequest(11, newAccountBody(), {
      db,
      syncClient: mockSync({
        ok: false,
        disabled: false,
        called: true,
        status: "needs_manual_review",
        bildazoUserId: null,
        bildazoPublicId: null,
        profileUrl: null,
        errorCode: "BILDAZO_SYNC_NEEDS_REVIEW",
        safeMessage: "duplicate email",
        httpStatus: 200,
      }),
    });
    assert.equal(result.link.status, "needs_manual_review");
    assert.equal(result.link.linked, null);
  });

  it("config/network errors do not mark linked and store a safe last_error", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    const result = await submitBildazoAuthorLinkRequest(11, newAccountBody(), {
      db,
      syncClient: mockSync({
        ok: false,
        disabled: false,
        called: false,
        status: null,
        errorCode: "BILDAZO_SYNC_CONFIG_MISSING",
        safeMessage: "Bildazo sync is not configured",
      }),
    });
    assert.equal(result.link.status, "failed");
    assert.equal(result.link.linked, null);
    const stored = await db.query("SELECT * FROM freelancer_bildazo_author_links WHERE freelancer_user_id = $1", [
      11,
    ]);
    assert.match(stored.rows[0].last_error, /not configured|failed|timed out/i);
    assert.doesNotMatch(String(stored.rows[0].last_error), /test-local-secret/);
  });

  it("new_account uses authenticated OrderzHouse email, not frontend email", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    const sync = mockSync(linkedOk("created"));
    await submitBildazoAuthorLinkRequest(11, newAccountBody({ email: "spoof@evil.test" }), {
      db,
      syncClient: sync,
    });
    assert.equal(sync.calls[0].email, USER.email);
    assert.notEqual(sync.calls[0].email, "spoof@evil.test");
  });

  it("passwordHash is rejected before any sync call", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    const sync = mockSync(linkedOk("created"));
    await assert.rejects(
      () => submitBildazoAuthorLinkRequest(11, newAccountBody({ passwordHash: "x" }), { db, syncClient: sync }),
      (err) => err.publicCode === "BILDAZO_AUTHOR_PASSWORD_NOT_ALLOWED",
    );
    assert.equal(sync.calls.length, 0);
    assert.equal(db.insertCount, 0);
  });

  it("new_account with password uses create-and-link mapping", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    const sync = mockSync(linkedOk("created"));
    const result = await submitBildazoAuthorLinkRequest(
      11,
      newAccountBody({ password: "Writer1x", passwordConfirm: "Writer1x" }),
      { db, syncClient: sync },
    );
    assert.equal(result.link.status, "linked");
    assert.equal(sync.calls[0].hadPassword, true);
    assert.equal(sync.calls[0].password, "[present]");
    const stored = await db.query("SELECT * FROM freelancer_bildazo_author_links");
    assert.equal(stored.rows[0].password, undefined);
  });

  it("existing-account credentials link and invalid credentials stay unlinked", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    const sync = mockSync(linkedOk("linked"));
    const ok = await submitBildazoAuthorLinkRequest(
      11,
      existingBody({
        existingBildazoEmail: "writer@bildazo.test",
        password: "Writer1x",
      }),
      { db, syncClient: sync },
    );
    assert.equal(ok.link.status, "linked");
    assert.equal(sync.calls[0].email, "writer@bildazo.test");
    assert.equal(sync.calls[0].hadPassword, true);

    const db2 = createMemoryDb();
    const bad = mockSync({
      ok: false,
      called: true,
      status: null,
      errorCode: "BILDAZO_SYNC_INVALID_CREDENTIALS",
      safeMessage: "Invalid email or password",
      bildazoUserId: null,
      bildazoPublicId: null,
      profileUrl: null,
    });
    const failed = await submitBildazoAuthorLinkRequest(
      11,
      existingBody({
        existingBildazoEmail: "writer@bildazo.test",
        password: "Writer1x",
      }),
      { db: db2, syncClient: bad },
    );
    assert.equal(failed.link.status, "failed");
    assert.equal(failed.link.linked, null);
    assert.equal(failed.link.failureCode, "INVALID_CREDENTIALS");
    assert.equal(failed.link.lastError, undefined);
  });

  it("existing-account 404 maps to ENDPOINT_UNAVAILABLE and stays unlinked", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    const missing = mockSync({
      ok: false,
      called: true,
      status: null,
      httpStatus: 404,
      errorCode: "BILDAZO_SYNC_ENDPOINT_MISSING",
      safeMessage: "Bildazo link endpoint is unavailable",
      bildazoUserId: null,
      bildazoPublicId: null,
      profileUrl: null,
    });
    const failed = await submitBildazoAuthorLinkRequest(
      11,
      existingBody({
        existingBildazoEmail: "writer@bildazo.test",
        password: "Writer1x",
      }),
      { db, syncClient: missing },
    );
    assert.equal(failed.link.status, "failed");
    assert.equal(failed.link.failureCode, "ENDPOINT_UNAVAILABLE");
    assert.equal(failed.link.linked, null);
    const stored = await db.query("SELECT last_error FROM freelancer_bildazo_author_links WHERE freelancer_user_id = $1", [
      11,
    ]);
    assert.match(String(stored.rows[0].last_error), /ENDPOINT_MISSING|unavailable/i);
    assert.doesNotMatch(JSON.stringify(failed.link), /password/i);
  });

  it("existing_account same email can call S2S and link", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    const sync = mockSync(linkedOk("linked"));
    const result = await submitBildazoAuthorLinkRequest(
      11,
      existingBody({ existingBildazoEmail: USER.email, fullName: "أحمد علي حسن" }),
      { db, syncClient: sync },
    );
    assert.equal(sync.calls.length, 1);
    assert.equal(sync.calls[0].email, USER.email);
    assert.equal(result.link.status, "linked");
  });

  it("existing_account different email does not call S2S", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    const sync = mockSync(() => {
      throw new Error("must not call S2S for different email");
    });
    const result = await submitBildazoAuthorLinkRequest(
      11,
      existingBody({ existingBildazoEmail: "other@bildazo.test" }),
      { db, syncClient: sync },
    );
    assert.equal(sync.calls.length, 0);
    assert.equal(result.link.status, "pending_external_verification");
    assert.notEqual(result.link.status, "linked");
  });

  it("existing_account publicId/profileUrl only does not call S2S", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    const sync = mockSync(() => {
      throw new Error("must not call S2S for publicId-only");
    });
    const byId = await submitBildazoAuthorLinkRequest(
      11,
      existingBody({ existingBildazoPublicId: "writer-9" }),
      { db, syncClient: sync },
    );
    assert.equal(byId.link.status, "pending_existing_account");
    const db2 = createMemoryDb();
    const byUrl = await submitBildazoAuthorLinkRequest(
      11,
      existingBody({ existingBildazoProfileUrl: "https://bildazo.com/u/ahmad" }),
      { db: db2, syncClient: sync },
    );
    assert.equal(byUrl.link.status, "pending_existing_account");
    assert.equal(sync.calls.length, 0);
  });

  it("already linked local row is not overwritten and does not call S2S", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
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
        bildazo_profile_url: null,
        linked_at: new Date(),
        email_matches_orderz: false,
        accepted_terms_version: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
        accepted_at: new Date(),
        source: "orderzhouse",
      },
    });
    const sync = mockSync(() => {
      throw new Error("must not call S2S for already linked");
    });
    const result = await submitBildazoAuthorLinkRequest(11, newAccountBody({ fullName: "Hacker" }), {
      db,
      syncClient: sync,
    });
    assert.equal(result.alreadyLinked, true);
    assert.equal(result.link.status, "linked");
    assert.equal(result.link.linked.bildazoPublicId, "pub-1");
    assert.equal(sync.calls.length, 0);
  });

  it("linked account cannot be changed without explicit confirmChange", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb({
      link: {
        id: 9,
        freelancer_user_id: 11,
        link_flow: "existing_account",
        status: "linked",
        orderz_verified_email: USER.email,
        existing_bildazo_email: USER.email,
        bildazo_user_id: "2",
        bildazo_public_id: "pub-1",
        linked_at: new Date(),
        email_matches_orderz: true,
        accepted_terms_version: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
        accepted_at: new Date(),
        source: "orderzhouse",
      },
    });
    const sync = mockSync(linkedOk("replaced"));
    await assert.rejects(
      () =>
        changeBildazoAuthorLink(
          11,
          existingBody({ existingBildazoEmail: "new@bildazo.test", password: "Writer1x" }),
          { db, syncClient: sync },
        ),
      (err) => err.publicCode === "BILDAZO_AUTHOR_CHANGE_CONFIRM_REQUIRED",
    );
    assert.equal(sync.calls.length, 0);
    const stored = await db.query("SELECT * FROM freelancer_bildazo_author_links WHERE freelancer_user_id = $1", [11]);
    assert.equal(stored.rows[0].bildazo_public_id, "pub-1");
  });

  it("successful change updates future linked account and failed change leaves the old one", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const linkedRow = {
      id: 9,
      freelancer_user_id: 11,
      link_flow: "existing_account",
      status: "linked",
      orderz_verified_email: USER.email,
      existing_bildazo_email: USER.email,
      bildazo_user_id: "2",
      bildazo_public_id: "pub-1",
      linked_at: new Date(),
      email_matches_orderz: true,
      accepted_terms_version: ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
      accepted_at: new Date(),
      source: "orderzhouse",
    };
    const dbFail = createMemoryDb({ link: { ...linkedRow } });
    const failed = await changeBildazoAuthorLink(
      11,
      existingBody({
        existingBildazoEmail: "new@bildazo.test",
        password: "Writer1x",
        confirmChange: true,
      }),
      {
        db: dbFail,
        syncClient: mockSync({
          ok: false,
          called: true,
          status: null,
          errorCode: "BILDAZO_SYNC_INVALID_CREDENTIALS",
          safeMessage: "Invalid email or password",
        }),
      },
    );
    assert.equal(failed.changed, false);
    assert.equal(failed.link.linked.bildazoPublicId, "pub-1");
    assert.equal(failed.failureCode, "INVALID_CREDENTIALS");

    const dbOk = createMemoryDb({ link: { ...linkedRow } });
    const ok = await changeBildazoAuthorLink(
      11,
      existingBody({
        existingBildazoEmail: "new@bildazo.test",
        password: "Writer1x",
        confirmChange: true,
      }),
      {
        db: dbOk,
        syncClient: mockSync({
          ok: true,
          called: true,
          status: "replaced",
          bildazoUserId: "77",
          bildazoPublicId: "pub-new",
          profileUrl: null,
        }),
      },
    );
    assert.equal(ok.changed, true);
    assert.equal(ok.link.status, "linked");
    assert.equal(ok.link.linked.bildazoPublicId, "pub-new");
    assert.equal(ok.link.linked.bildazoUserId, "77");
    assert.equal(ok.link.linked.email, "new@bildazo.test");
    const src = fs.readFileSync(path.join(__dirname, "../src/services/bildazoAuthorLinkService.js"), "utf8");
    assert.doesNotMatch(src, /bildazo_article_publish_records/);
    assert.doesNotMatch(JSON.stringify(ok.link), /Writer1x|password/);
  });

  it("same freelancer request does not create duplicate local rows", async () => {
    const db = createMemoryDb();
    await submitBildazoAuthorLinkRequest(11, newAccountBody(), { db, syncClient: mockSync({ disabled: true }) });
    await submitBildazoAuthorLinkRequest(11, newAccountBody({ fullName: "أحمد علي حسن" }), {
      db,
      syncClient: mockSync({ disabled: true }),
    });
    assert.equal(db.insertCount, 1);
  });

  it("failed rows can be retried by resubmitting", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    await submitBildazoAuthorLinkRequest(11, newAccountBody(), {
      db,
      syncClient: mockSync({
        ok: false,
        called: true,
        status: null,
        errorCode: "BILDAZO_SYNC_NETWORK",
        safeMessage: "Bildazo request failed",
      }),
    });
    const retry = await submitBildazoAuthorLinkRequest(11, newAccountBody(), {
      db,
      syncClient: mockSync(linkedOk("created")),
    });
    assert.equal(retry.link.status, "linked");
    assert.equal(db.insertCount, 1);
  });

  it("article apply gate still only blocks when BILDAZO_AUTHOR_GATE_ENABLED=true", async () => {
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    const db = createMemoryDb();
    delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
    assert.equal(isBildazoAuthorGateEnabled(), false);
    await assertBildazoAuthorLinkedForArticleApply(11, { db });
    process.env.BILDAZO_AUTHOR_GATE_ENABLED = "true";
    await assert.rejects(
      () => assertBildazoAuthorLinkedForArticleApply(11, { db }),
      (err) => err.publicCode === "BILDAZO_AUTHOR_LINK_REQUIRED",
    );
  });

  it("article apply still calls the gate before Bid reserve", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceArticleApplicationsService.js"),
      "utf8",
    );
    const gateAt = src.indexOf("assertBildazoAuthorLinkedForArticleApply");
    const reserveAt = src.indexOf("reserveBidCreditsFefo");
    assert.ok(gateAt > 0 && reserveAt > gateAt);
  });

  it("env example has sync placeholders and frontend has no secret", () => {
    const envExample = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8");
    const bildazoBlock = envExample
      .split("# --- Bildazo author gate")
      .slice(1)
      .join("\n")
      .split("# --- Display-only FX")[0];
    assert.match(bildazoBlock, /BILDAZO_AUTHOR_SYNC_ENABLED=false/);
    assert.match(bildazoBlock, /BILDAZO_API_BASE_URL=/);
    assert.match(bildazoBlock, /BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET=/);
    assert.doesNotMatch(bildazoBlock, /sk_live|whsec_/i);
    const frontendRoot = path.join(__dirname, "../../frontend/src");
    const walk = (dir, acc = []) => {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p, acc);
        else if (/\.(js|jsx|ts|tsx)$/.test(name) && !/\.test\.(js|jsx|ts|tsx)$/.test(name)) acc.push(p);
      }
      return acc;
    };
    for (const file of walk(frontendRoot)) {
      const src = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(src, /BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET/);
    }
  });
});
