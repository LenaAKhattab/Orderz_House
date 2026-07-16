/**
 * Rate limit exemptions — Super Admin managed scoped bypass / increased limits.
 * Run: node --test test/rateLimitExemptions.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/rate_limit_exemptions_test_placeholder";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(__dirname, "..", "sql", "migrations", "111_rate_limit_exemptions.sql");
const routesSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "routes", "rateLimitExemptionsRoutes.js"),
  "utf8",
);
const limitersSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "middleware", "orderWriteRateLimiters.js"),
  "utf8",
);
const authLimitersSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "middleware", "rateLimiters.js"),
  "utf8",
);
const logSrc = fs.readFileSync(path.join(__dirname, "..", "src", "utils", "rateLimitLog.js"), "utf8");
const appSrc = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");

const servicePath = require.resolve("../src/services/rateLimitExemptionsService");

describe("migration 111_rate_limit_exemptions", () => {
  it("creates scoped table with reason and expires_at", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS rate_limit_exemptions"));
    assert.ok(sql.includes("order_create"));
    assert.ok(sql.includes("fake_order_create"));
    assert.ok(sql.includes("training_bulk"));
    assert.ok(sql.includes("admin_write"));
    assert.ok(sql.includes("reason TEXT NOT NULL"));
    assert.ok(sql.includes("expires_at"));
    assert.ok(!sql.includes("auth_login"));
  });
});

describe("admin routes — Super Admin only", () => {
  it("requires requireSuperAdmin and mounts under /api/super-admin", () => {
    assert.ok(routesSrc.includes("requireSuperAdmin"));
    assert.ok(routesSrc.includes('"/rate-limit-exemptions"'));
    assert.ok(routesSrc.includes("revoke"));
    assert.ok(appSrc.includes("rateLimitExemptionsRoutes"));
    assert.ok(!routesSrc.includes("requireAnyRole([\"admin\""));
  });
});

describe("limiters wire exemptions; auth limiters do not", () => {
  it("order/training/admin write limiters use exemption skip/max", () => {
    assert.ok(limitersSrc.includes('createExemptionSkip("order_create")'));
    assert.ok(limitersSrc.includes('createExemptionSkip("fake_order_create")'));
    assert.ok(limitersSrc.includes('createExemptionSkip("training_bulk")'));
    assert.ok(limitersSrc.includes('createExemptionSkip("admin_write")'));
    assert.ok(!limitersSrc.includes('createExemptionSkip("notifications")'));
  });

  it("auth rateLimiters.js has no exemption hooks", () => {
    assert.ok(!authLimitersSrc.includes("rateLimitExemptions"));
    assert.ok(!authLimitersSrc.includes("createExemptionSkip"));
  });
});

describe("rateLimitExemptionsService validation + cache", () => {
  beforeEach(() => {
    delete require.cache[servicePath];
  });
  afterEach(() => {
    delete require.cache[servicePath];
  });

  it("rejects forbidden and unknown scopes; requires reason", () => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const svc = require("../src/services/rateLimitExemptionsService");
    assert.throws(
      () => svc.normalizeCreateInput({ userId: 1, scope: "auth_login", mode: "bypass", reason: "trusted friend work" }),
      (err) => err.code === "INVALID_SCOPE",
    );
    assert.throws(
      () =>
        svc.normalizeCreateInput({
          userId: 1,
          scope: "order_create",
          mode: "bypass",
          reason: "x",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        }),
      (err) => err.code === "REASON_REQUIRED",
    );
  });

  it("requires expiresAt unless confirmPermanent", () => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const svc = require("../src/services/rateLimitExemptionsService");
    assert.throws(
      () =>
        svc.normalizeCreateInput({
          userId: 1,
          scope: "fake_order_create",
          mode: "bypass",
          reason: "trusted training ingestion",
        }),
      (err) => err.code === "EXPIRES_AT_RECOMMENDED",
    );
    const ok = svc.normalizeCreateInput({
      userId: 1,
      scope: "fake_order_create",
      mode: "bypass",
      reason: "trusted training ingestion",
      confirmPermanent: true,
    });
    assert.equal(ok.permanent, true);
    assert.equal(ok.expiresAt, null);
  });

  it("findActiveExemption fail-closed returns null on DB error", async () => {
    const dbPath = require.resolve("../src/config/db");
    const prev = require.cache[dbPath];
    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: {
        pool: {
          query: async () => {
            throw new Error("db down");
          },
        },
      },
    };
    delete require.cache[servicePath];
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const svc = require("../src/services/rateLimitExemptionsService");
      const result = await svc.findActiveExemption(9, "order_create");
      assert.equal(result, null);
      const skip = await svc.createExemptionSkip("order_create")({ auth: { userId: 9 } });
      assert.equal(skip, false);
    } finally {
      if (prev) require.cache[dbPath] = prev;
      else delete require.cache[dbPath];
      delete require.cache[servicePath];
    }
  });

  it("bypass skip returns true for active exemption; wrong scope false", async () => {
    const dbPath = require.resolve("../src/config/db");
    const prev = require.cache[dbPath];
    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: {
        pool: {
          query: async (sql, params) => {
            if (String(sql).includes("rate_limit_exemptions") && params?.[1] === "order_create") {
              return {
                rows: [
                  {
                    id: 11,
                    user_id: 9,
                    scope: "order_create",
                    mode: "bypass",
                    max_per_minute: null,
                    max_per_hour: null,
                    expires_at: null,
                    reason: "qa",
                    notes: null,
                    is_active: true,
                    created_by: 1,
                    revoked_at: null,
                    revoked_by: null,
                    created_at: new Date(),
                    updated_at: new Date(),
                  },
                ],
              };
            }
            return { rows: [] };
          },
        },
      },
    };
    delete require.cache[servicePath];
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const svc = require("../src/services/rateLimitExemptionsService");
      svc.invalidateAllCache();
      const skipOrder = await svc.createExemptionSkip("order_create")({ auth: { userId: 9 }, method: "POST", originalUrl: "/api/client/orders" });
      const skipBulk = await svc.createExemptionSkip("training_bulk")({ auth: { userId: 9 } });
      assert.equal(skipOrder, true);
      assert.equal(skipBulk, false);
    } finally {
      if (prev) require.cache[dbPath] = prev;
      else delete require.cache[dbPath];
      delete require.cache[servicePath];
    }
  });

  it("expired row is not returned by SQL filter (empty rows → no skip)", async () => {
    const dbPath = require.resolve("../src/config/db");
    const prev = require.cache[dbPath];
    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: {
        pool: {
          query: async () => ({ rows: [] }),
        },
      },
    };
    delete require.cache[servicePath];
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const svc = require("../src/services/rateLimitExemptionsService");
      svc.invalidateAllCache();
      assert.equal(await svc.createExemptionSkip("order_create")({ auth: { userId: 3 } }), false);
    } finally {
      if (prev) require.cache[dbPath] = prev;
      else delete require.cache[dbPath];
      delete require.cache[servicePath];
    }
  });

  it("revoke invalidates cache so subsequent lookup misses stale bypass", async () => {
    let active = true;
    const dbPath = require.resolve("../src/config/db");
    const prev = require.cache[dbPath];
    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: {
        pool: {
          query: async (sql) => {
            const s = String(sql);
            if (s.startsWith("UPDATE rate_limit_exemptions") && s.includes("revoked_at")) {
              active = false;
              return {
                rows: [
                  {
                    id: 5,
                    user_id: 22,
                    scope: "fake_order_create",
                    mode: "bypass",
                    is_active: false,
                    reason: "done",
                    created_at: new Date(),
                    updated_at: new Date(),
                  },
                ],
              };
            }
            if (s.includes("FROM rate_limit_exemptions") && s.includes("is_active = TRUE")) {
              if (!active) return { rows: [] };
              return {
                rows: [
                  {
                    id: 5,
                    user_id: 22,
                    scope: "fake_order_create",
                    mode: "bypass",
                    is_active: true,
                    reason: "work",
                    created_at: new Date(),
                    updated_at: new Date(),
                  },
                ],
              };
            }
            return { rows: [] };
          },
        },
      },
    };
    delete require.cache[servicePath];
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const svc = require("../src/services/rateLimitExemptionsService");
      svc.invalidateAllCache();
      assert.equal(
        await svc.createExemptionSkip("fake_order_create")({ auth: { userId: 22 } }),
        true,
      );
      await svc.revokeExemption(5, 1);
      assert.equal(
        await svc.createExemptionSkip("fake_order_create")({ auth: { userId: 22 } }),
        false,
      );
    } finally {
      if (prev) require.cache[dbPath] = prev;
      else delete require.cache[dbPath];
      delete require.cache[servicePath];
    }
  });
});

describe("audit log hygiene", () => {
  it("logs events without Authorization/cookie/token fields", () => {
    assert.ok(logSrc.includes('event: "rate_limit_exemption_used"'));
    assert.ok(logSrc.includes("logRateLimitExemptionAudit"));
    // Comment may mention Authorization; payload builders must not include it.
    assert.ok(!/Authorization\s*:/.test(logSrc));
    assert.ok(!logSrc.includes("req.headers"));
    assert.ok(!logSrc.includes("req.cookies"));
    assert.ok(!logSrc.toLowerCase().includes('"password"'));
    assert.ok(!logSrc.toLowerCase().includes("access_token"));
  });
});
