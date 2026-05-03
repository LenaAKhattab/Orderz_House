/**
 * Policy (see adminSubscriptionsRoutes.js): admin + super_admin may assign/manage freelancer
 * subscriptions; super_admin alone retains plan *template* CRUD (adminPlansRoutes).
 *
 * Run: npm run test:admin-subscriptions-auth  |  npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/admin_subscriptions_auth_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { requireAnyRole } = require("../src/middleware/rbacMiddleware");

const ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES = ["admin", "super_admin"];

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
  mw(req, res, () => {
    nextCalled = true;
  });
  return { statusCode, jsonBody, nextCalled };
}

describe("admin subscription routes authorization policy", () => {
  it("route file assigns plans with admin OR super_admin (shared constant)", () => {
    const p = path.join(__dirname, "..", "src", "routes", "adminSubscriptionsRoutes.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(src.includes("/subscriptions/assign"), "assign route present");
    assert.ok(
      src.includes("requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES)"),
      "assign uses requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES)",
    );
    assert.ok(!src.includes("requireRole"), "this router uses requireAnyRole only (no super_admin-only requireRole)");
  });

  it("plan template CRUD stays documented as super_admin scope (adminPlansRoutes)", () => {
    const p = path.join(__dirname, "..", "src", "routes", "adminPlansRoutes.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(src.includes('requireRole("super_admin")'), "plan templates remain super_admin-only");
  });
});

describe("requireAnyRole(admin, super_admin) — subscription management gate", () => {
  const makeMw = () => requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES);

  it("allows super_admin", () => {
    const mwInst = makeMw();
    const out = runMw(mwInst, {
      user: { sub: "1", role: "super_admin" },
      auth: { roles: [], legacyRole: "super_admin", primaryRole: null },
    });
    assert.strictEqual(out.nextCalled, true);
    assert.strictEqual(out.statusCode, 200);
  });

  it("allows admin", () => {
    const mwInst = makeMw();
    const out = runMw(mwInst, {
      user: { sub: "2", role: "admin" },
      auth: { roles: [], legacyRole: "admin", primaryRole: null },
    });
    assert.strictEqual(out.nextCalled, true);
  });

  it("denies freelancer (normal user)", () => {
    const mwInst = makeMw();
    const out = runMw(mwInst, {
      user: { sub: "3", role: "freelancer" },
      auth: { roles: [], legacyRole: "freelancer", primaryRole: null },
    });
    assert.strictEqual(out.nextCalled, false);
    assert.strictEqual(out.statusCode, 403);
    assert.strictEqual(out.jsonBody?.code, "FORBIDDEN");
  });

  it("denies client", () => {
    const mwInst = makeMw();
    const out = runMw(mwInst, {
      user: { sub: "4", role: "client" },
      auth: { roles: [], legacyRole: "client", primaryRole: null },
    });
    assert.strictEqual(out.nextCalled, false);
    assert.strictEqual(out.statusCode, 403);
  });

  it("denies when not logged in", () => {
    const mwInst = makeMw();
    const out = runMw(mwInst, { auth: {} });
    assert.strictEqual(out.nextCalled, false);
    assert.strictEqual(out.statusCode, 401);
  });
});
