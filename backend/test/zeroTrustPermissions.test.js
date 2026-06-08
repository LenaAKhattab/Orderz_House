/**
 * Zero Trust — permission middleware + audit logging smoke tests.
 * Run: node --test test/zeroTrustPermissions.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/zero_trust_permissions_test_placeholder";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { requirePermission, requireAnyRole } = require("../src/middleware/rbacMiddleware");

function runMw(mw, req) {
  let statusCode = 200;
  let jsonBody;
  let nextCalled = false;
  const logs = [];
  const origWarn = console.warn;
  console.warn = (...args) => logs.push(args.join(" "));

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
  console.warn = origWarn;
  return { statusCode, jsonBody, nextCalled, logs };
}

describe("requirePermission — admin dashboard pages", () => {
  let mw;

  beforeEach(() => {
    mw = requirePermission("dashboard.admin.courses");
  });

  it("allows super_admin without explicit page permission", () => {
    const { nextCalled, statusCode } = runMw(mw, {
      method: "GET",
      originalUrl: "/api/admin/courses",
      user: { sub: "1", role: "super_admin" },
      auth: { isSuperAdmin: true, permissions: [], userId: "1", email: "sa@test.com", primaryRole: "super_admin" },
    });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(statusCode, 200);
  });

  it("allows admin with matching permission", () => {
    const { nextCalled } = runMw(mw, {
      method: "GET",
      originalUrl: "/api/admin/courses",
      user: { sub: "2", role: "admin" },
      auth: {
        isSuperAdmin: false,
        permissions: ["dashboard.admin.courses"],
        userId: "2",
        email: "admin@test.com",
        primaryRole: "admin",
        roles: [{ name: "admin" }],
        legacyRole: "admin",
      },
    });
    assert.strictEqual(nextCalled, true);
  });

  it("denies admin without permission and logs audit event", () => {
    const { statusCode, jsonBody, nextCalled, logs } = runMw(mw, {
      method: "GET",
      originalUrl: "/api/admin/courses",
      ip: "127.0.0.1",
      user: { sub: "3", role: "admin" },
      auth: {
        isSuperAdmin: false,
        permissions: ["dashboard.admin.ads"],
        userId: "3",
        email: "limited@test.com",
        primaryRole: "admin",
        roles: [{ name: "admin" }],
        legacyRole: "admin",
      },
    });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 403);
    assert.strictEqual(jsonBody?.code, "FORBIDDEN");
    assert.ok(logs.some((l) => l.includes("access_denied") && l.includes("dashboard.admin.courses")));
  });

  it("denies freelancer even if permission key were present", () => {
    const { statusCode, nextCalled } = runMw(mw, {
      method: "GET",
      originalUrl: "/api/admin/courses",
      user: { sub: "4", role: "freelancer" },
      auth: {
        isSuperAdmin: false,
        permissions: ["dashboard.admin.courses"],
        userId: "4",
        email: "fl@test.com",
        primaryRole: "freelancer",
        roles: [{ name: "freelancer" }],
        legacyRole: "freelancer",
      },
    });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 403);
  });
});

describe("notifications routes — self-access (auth only)", () => {
  it("notifications API does not require admin page permission", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "notificationsRoutes.js"), "utf8");
    assert.ok(src.includes("requireAuth"));
    assert.ok(!src.includes("requireRoleScopedPermission"));
    assert.ok(!src.includes("dashboard.admin.notifications"));
  });
});

describe("route wiring — high-risk admin APIs", () => {
  it("training orders API is super_admin only", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "adminFakeOrdersRoutes.js"), "utf8");
    assert.ok(src.includes("requireSuperAdmin"));
    assert.ok(!src.includes('"admin"'));
  });

  it("profile mutations use auth only (settings page not exposed for admin)", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "profileRoutes.js"), "utf8");
    assert.ok(!src.includes("dashboard.admin.settings"));
    assert.ok(src.includes('router.get("/me", profileController.getProfileMe)'));
    assert.ok(src.includes("router.patch(\"/me\", profileController.patchProfile)"));
  });

  it("admin plans router does not globally block other /api/admin routes", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "adminPlansRoutes.js"), "utf8");
    assert.ok(!src.includes("router.use(requireAuth, requireRole(\"super_admin\"))"));
    assert.ok(src.includes('router.get("/plans"'));
  });

  it("admin courses router scopes dashboard.admin.courses guard to /courses routes", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "adminCoursesRoutes.js"), "utf8");
    assert.ok(!src.includes('router.use(requireAuth, requireAnyRole(["admin", "super_admin"]), requirePermission("dashboard.admin.courses"))'));
    assert.ok(src.includes("dashboard.admin.courses"));
    assert.ok(src.includes('router.get("/courses/freelancers"'));
  });
});

describe("requireAnyRole — cross-role isolation", () => {
  const mw = requireAnyRole(["admin", "super_admin"]);

  it("denies client from admin routes", () => {
    const { statusCode, nextCalled } = runMw(mw, {
      method: "GET",
      originalUrl: "/api/admin/orders",
      user: { sub: "20", role: "client" },
      auth: {
        isSuperAdmin: false,
        permissions: [],
        userId: "20",
        primaryRole: "client",
        roles: [{ name: "client" }],
        legacyRole: "client",
      },
    });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 403);
  });
});
