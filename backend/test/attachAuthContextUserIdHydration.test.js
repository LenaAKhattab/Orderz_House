/**
 * Phase 0F — req.user.id hydration must come from JWT sub → DB user, never from body/headers.
 * No production DB. Stubs authz lookups.
 */
process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/attach_auth_context_placeholder";

const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const authService = require("../src/services/authService");
const rbacService = require("../src/services/rbacService");

const originalGetUser = authService.getUserRowByIdForAuthz;
const originalResolve = rbacService.resolveAuthzContext;

authService.getUserRowByIdForAuthz = async (sub) => {
  if (String(sub) === "7") {
    return {
      id: 7,
      account_id: "FL00000007",
      email: "freelancer@orderzhouse.test",
      role: "freelancer",
      is_active: true,
    };
  }
  if (String(sub) === "99") {
    return {
      id: 99,
      account_id: "SA00000099",
      email: "admin@orderzhouse.test",
      role: "super_admin",
      is_active: true,
    };
  }
  if (String(sub) === "5") {
    return {
      id: 5,
      account_id: "CL00000005",
      email: "client@orderzhouse.test",
      role: "client",
      is_active: true,
    };
  }
  return null;
};
rbacService.resolveAuthzContext = async ({ userId, legacyRole }) => ({
  primaryRole: legacyRole,
  roles: [{ name: legacyRole }],
  permissions: [],
  isSuperAdmin: legacyRole === "super_admin",
  rbacReady: true,
  userId,
});

const {
  attachAuthContext,
  requireFreelancer,
  requireSuperAdmin,
  requireRole,
} = require("../src/middleware/rbacMiddleware");

function runAttach(req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({ statusCode: this.statusCode, body, nextCalled: false });
      },
    };
    attachAuthContext(req, res, (err) => {
      if (err) return reject(err);
      resolve({ statusCode: res.statusCode, body: res.body, nextCalled: true, req });
    });
  });
}

describe("attachAuthContext user id hydration", () => {
  after(() => {
    authService.getUserRowByIdForAuthz = originalGetUser;
    rbacService.resolveAuthzContext = originalResolve;
  });

  it("source looks up JWT sub and assigns req.user.id from the DB row", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "middleware", "rbacMiddleware.js"), "utf8");
    assert.match(src, /getUserRowByIdForAuthz\(req\.user\.sub\)/);
    assert.match(src, /req\.user\.id = Number\(legacyUser\.id\)/);
    assert.doesNotMatch(src, /req\.body\.id/);
    assert.doesNotMatch(src, /req\.headers\[[^\]]*user-id/i);
  });

  it("sets req.user.id from DB lookup of JWT sub, ignoring spoofed body/header/jwt id", async () => {
    const req = {
      user: { sub: "7", id: 999, role: "super_admin" },
      body: { id: 123, userId: 123 },
      headers: { "x-user-id": "123" },
    };
    const out = await runAttach(req);
    assert.equal(out.nextCalled, true);
    assert.equal(req.user.id, 7);
    assert.equal(String(req.user.sub), "7");
    assert.equal(req.user.role, "freelancer");
    assert.equal(req.auth.userId, "7");
    assert.equal(req.auth.primaryRole, "freelancer");
    assert.equal(req.auth.isSuperAdmin, false);
  });

  it("does not invent identity when JWT sub is missing (public/optional auth)", async () => {
    const req = {
      user: { id: 123, role: "super_admin" },
      body: { id: 123 },
      headers: { "x-user-id": "123" },
    };
    const out = await runAttach(req);
    assert.equal(out.nextCalled, true);
    assert.equal(req.auth, undefined);
    assert.equal(req.user.id, 123);
  });

  it("rejects unknown sub without using body id", async () => {
    const req = {
      user: { sub: "404", id: 1 },
      body: { id: 1 },
    };
    const out = await runAttach(req);
    assert.equal(out.nextCalled, false);
    assert.equal(out.statusCode, 401);
    assert.equal(out.body?.code, "INVALID_TOKEN");
  });

  it("hydrates super_admin from DB role, not JWT claim", async () => {
    const req = { user: { sub: "99", role: "client" } };
    const out = await runAttach(req);
    assert.equal(out.nextCalled, true);
    assert.equal(req.user.id, 99);
    assert.equal(req.user.role, "super_admin");
    assert.equal(req.auth.isSuperAdmin, true);
  });

  it("freelancer/client/super-admin role guards still match DB-hydrated roles", async () => {
    const freelancerReq = { user: { sub: "7" } };
    await runAttach(freelancerReq);
    const fl = await new Promise((resolve) => {
      requireFreelancer(freelancerReq, { status() { return this; }, json(body) { resolve({ ok: false, body }); } }, () => resolve({ ok: true }));
    });
    assert.equal(fl.ok, true);

    const clientReq = { user: { sub: "5" } };
    await runAttach(clientReq);
    const clientOk = await new Promise((resolve) => {
      requireRole("client")(clientReq, { status() { return this; }, json(body) { resolve({ ok: false, body }); } }, () => resolve({ ok: true }));
    });
    assert.equal(clientOk.ok, true);
    const clientBlockedAsFl = await new Promise((resolve) => {
      const res = { status(code) { this.statusCode = code; return this; }, json(body) { resolve({ ok: false, statusCode: this.statusCode, body }); } };
      requireFreelancer(clientReq, res, () => resolve({ ok: true }));
    });
    assert.equal(clientBlockedAsFl.ok, false);
    assert.equal(clientBlockedAsFl.statusCode, 403);

    const saReq = { user: { sub: "99" } };
    await runAttach(saReq);
    const sa = await new Promise((resolve) => {
      requireSuperAdmin(saReq, { status() { return this; }, json(body) { resolve({ ok: false, body }); } }, () => resolve({ ok: true }));
    });
    assert.equal(sa.ok, true);
    const saBlockedAsClient = await new Promise((resolve) => {
      const res = { status(code) { this.statusCode = code; return this; }, json(body) { resolve({ ok: false, statusCode: this.statusCode, body }); } };
      requireRole("client")(saReq, res, () => resolve({ ok: true }));
    });
    assert.equal(saBlockedAsClient.ok, false);
    assert.equal(saBlockedAsClient.statusCode, 403);
  });
});
