/**
 * Phase 2B — focused authorization / ownership policy checks (no DB).
 * Run: npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/phase2b_protection_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  requireRole,
  requireAnyRole,
  resolvedRoleNames,
} = require("../src/middleware/rbacMiddleware");
const { collectResolvedRoleNames } = require("../src/utils/roleResolution");
const { pickPrimaryRole } = require("../src/services/rbacService");
const orderAuthz = require("../src/services/orderAuthorizationService");

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

describe("collectResolvedRoleNames matches resolvedRoleNames", () => {
  it("merges RBAC, primary, legacy, and JWT consistently", () => {
    const req = {
      user: { role: "client" },
      auth: {
        roles: [{ name: "freelancer" }],
        primaryRole: "freelancer",
        legacyRole: "client",
      },
    };
    assert.deepStrictEqual(
      collectResolvedRoleNames(req.auth, req.user.role).sort(),
      resolvedRoleNames(req).sort(),
    );
  });
});

describe("pickPrimaryRole — admin legacy vs incomplete user_roles", () => {
  it("prefers privileged RBAC role over stale legacy client", () => {
    const primary = pickPrimaryRole({
      roles: [{ name: "admin" }],
      legacyRole: "client",
    });
    assert.strictEqual(primary, "admin");
  });

  it("falls back to legacy super_admin when user_roles empty", () => {
    const primary = pickPrimaryRole({ roles: [], legacyRole: "super_admin" });
    assert.strictEqual(primary, "super_admin");
  });
});

describe("requireRole(super_admin) blocks admin", () => {
  const mw = requireRole("super_admin");

  it("returns 401 without user", () => {
    const out = runMw(mw, { auth: { roles: [{ name: "admin" }] } });
    assert.strictEqual(out.statusCode, 401);
    assert.strictEqual(out.jsonBody?.code, "UNAUTHORIZED");
  });

  it("returns 403 for admin legacy only", () => {
    const out = runMw(mw, {
      user: { sub: "1", role: "admin" },
      auth: { roles: [], legacyRole: "admin", primaryRole: "admin" },
    });
    assert.strictEqual(out.statusCode, 403);
    assert.strictEqual(out.jsonBody?.code, "FORBIDDEN");
  });

  it("allows super_admin", () => {
    const out = runMw(mw, {
      user: { sub: "1", role: "super_admin" },
      auth: { roles: [{ name: "super_admin" }], legacyRole: "super_admin", primaryRole: "super_admin" },
    });
    assert.strictEqual(out.nextCalled, true);
  });
});

describe("requireAnyRole unauthenticated", () => {
  it("returns 401", () => {
    const out = runMw(requireAnyRole(["client"]), {});
    assert.strictEqual(out.statusCode, 401);
  });
});

describe("orderAuthorizationService ownership helpers", () => {
  it("requireAuthenticatedUserId returns 401 when auth missing", () => {
    assert.throws(() => orderAuthz.requireAuthenticatedUserId(null), (e) => e.statusCode === 401);
  });
});

describe("client order routes wire ownership middleware", () => {
  const ordersRoutes = fs.readFileSync(
    path.join(__dirname, "..", "src", "routes", "ordersRoutes.js"),
    "utf8",
  );

  const clientOwnershipPaths = [
    '"/client/orders/:id/pay-checkout"',
    '"/client/orders/:id/pay-confirm"',
    '"/client/orders/:id/bids/:bidId/select"',
    '"/client/orders/:id/delivery/approve"',
  ];

  for (const routePath of clientOwnershipPaths) {
    it(`${routePath} uses requireClientOwnsOrderParam`, () => {
      const idx = ordersRoutes.indexOf(routePath);
      assert.ok(idx > -1, `route ${routePath} missing`);
      const slice = ordersRoutes.slice(idx, idx + 900);
      assert.ok(slice.includes("requireClientOwnsOrderParam"), `ownership middleware missing near ${routePath}`);
    });
  }

  it('"/client/orders/:id/files/:fileId/download" uses requireOrderFileAccess', () => {
    const routePath = '"/client/orders/:id/files/:fileId/download"';
    const idx = ordersRoutes.indexOf(routePath);
    assert.ok(idx > -1);
    const slice = ordersRoutes.slice(idx, idx + 500);
    assert.ok(slice.includes("requireOrderFileAccess"));
  });

  it("freelancer delivery route uses requireFreelancerAssignedOrderParam", () => {
    const idx = ordersRoutes.indexOf('"/freelancer/my-orders/:id/delivery"');
    assert.ok(idx > -1);
    const slice = ordersRoutes.slice(idx, idx + 500);
    assert.ok(slice.includes("requireFreelancerAssignedOrderParam"));
  });
});

describe("freelancer pool mutations require freelancer role", () => {
  const ordersRoutes = fs.readFileSync(
    path.join(__dirname, "..", "src", "routes", "ordersRoutes.js"),
    "utf8",
  );

  it("take pool order requires requireFreelancerCanClaimOrderParam", () => {
    const idx = ordersRoutes.indexOf('"/orders/:id/take"');
    assert.ok(idx > -1);
    const slice = ordersRoutes.slice(idx, idx + 400);
    assert.ok(slice.includes('requireRole("freelancer")'));
    assert.ok(slice.includes("requireFreelancerCanClaimOrderParam"));
  });
});
