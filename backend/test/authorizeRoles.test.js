/**
 * authorizeRoles must match requireAnyRole: empty user_roles does not hide legacy users.role.
 * Run: npm run test:authorize-roles  |  npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/authorize_roles_test_placeholder";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");
const { authorizeRoles } = require("../src/middleware/roleMiddleware");
const { resolvedRoleNames } = require("../src/middleware/rbacMiddleware");

function runMw(mw, req) {
  let statusCode = 200;
  let jsonBody;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
    },
  };
  const next = () => {
    nextCalled = true;
  };
  mw(req, res, next);
  return { statusCode, jsonBody, nextCalled };
}

describe("resolvedRoleNames", () => {
  it("includes RBAC role names", () => {
    const req = {
      user: { role: "client" },
      auth: {
        roles: [{ name: "admin" }],
        primaryRole: null,
        legacyRole: null,
      },
    };
    assert.deepStrictEqual(resolvedRoleNames(req).sort(), ["admin"]);
  });

  it("falls back to legacyRole when RBAC roles array is empty", () => {
    const req = {
      user: { role: "client" },
      auth: {
        roles: [],
        primaryRole: null,
        legacyRole: "admin",
      },
    };
    assert.deepStrictEqual(resolvedRoleNames(req), ["admin"]);
  });

  it("falls back to JWT role when merged RBAC/primary/legacy is empty", () => {
    const req = {
      user: { role: "super_admin" },
      auth: {
        roles: [],
        primaryRole: null,
        legacyRole: null,
      },
    };
    assert.deepStrictEqual(resolvedRoleNames(req), ["super_admin"]);
  });
});

describe("authorizeRoles", () => {
  let mw;

  beforeEach(() => {
    mw = authorizeRoles("super_admin", "admin");
  });

  it("allows user when RBAC roles include an allowed role", () => {
    const req = {
      user: { sub: "1", role: "client" },
      auth: {
        roles: [{ name: "admin" }],
        primaryRole: null,
        legacyRole: null,
      },
    };
    const out = runMw(mw, req);
    assert.strictEqual(out.nextCalled, true);
    assert.strictEqual(out.statusCode, 200);
  });

  it("allows user when RBAC roles array is empty but legacyRole is allowed", () => {
    const req = {
      user: { sub: "1", role: "client" },
      auth: {
        roles: [],
        primaryRole: null,
        legacyRole: "admin",
      },
    };
    const out = runMw(mw, req);
    assert.strictEqual(out.nextCalled, true);
    assert.strictEqual(out.statusCode, 200);
  });

  it("denies when no req.user", () => {
    const req = { auth: { roles: [{ name: "admin" }] } };
    const out = runMw(mw, req);
    assert.strictEqual(out.nextCalled, false);
    assert.strictEqual(out.statusCode, 401);
    assert.strictEqual(out.jsonBody?.code, "UNAUTHORIZED");
  });

  it("denies when resolved roles do not match any allowed role", () => {
    const req = {
      user: { sub: "1", role: "freelancer" },
      auth: {
        roles: [],
        primaryRole: null,
        legacyRole: "freelancer",
      },
    };
    const out = runMw(mw, req);
    assert.strictEqual(out.nextCalled, false);
    assert.strictEqual(out.statusCode, 403);
    assert.strictEqual(out.jsonBody?.code, "FORBIDDEN");
  });

  it("denies when neither RBAC nor legacy nor JWT yields an allowed role", () => {
    const req = {
      user: { sub: "1", role: undefined },
      auth: {
        roles: [],
        primaryRole: null,
        legacyRole: null,
      },
    };
    const out = runMw(mw, req);
    assert.strictEqual(out.nextCalled, false);
    assert.strictEqual(out.statusCode, 403);
  });
});
