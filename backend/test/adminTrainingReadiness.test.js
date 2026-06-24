/**
 * Admin training orders readiness endpoint — read-only contract and status logic.
 * Run: npm run test:training-readiness
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/admin_training_readiness_test_placeholder";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routesSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "routes", "adminFakeOrdersRoutes.js"),
  "utf8",
);
const serviceSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
  "utf8",
);

const { buildTrainingOrdersReadinessPayload } = require("../src/services/fakeOrdersService");

function loadFakeOrdersServiceWithMockPool(mockPool, mockClient) {
  const dbPath = require.resolve("../src/config/db");
  const servicePath = require.resolve("../src/services/fakeOrdersService");
  delete require.cache[dbPath];
  delete require.cache[servicePath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      pool: mockPool,
      connectDB: async () => {},
    },
  };
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require("../src/services/fakeOrdersService");
}

describe("admin training readiness routes", () => {
  it("registers GET /training-orders/health/readiness behind training guard", () => {
    assert.match(routesSrc, /router\.get\("\/training-orders\/health\/readiness"/);
    assert.match(routesSrc, /trainingOrdersGuard[\s\S]*getTrainingReadiness/);
    assert.doesNotMatch(routesSrc, /router\.post\("\/training-orders\/health\/readiness"/);
  });
});

describe("buildTrainingOrdersReadinessPayload", () => {
  const base = {
    trainingOrdersEnabled: true,
    automationEnabled: true,
    eligibleForNextRound: 120,
    minOrders: 50,
    maxOrders: 100,
    currentlyVisibleFakeOrders: 69,
    activeRound: { id: "319", status: "active", generatedCount: 69 },
    oldVisibleOrdersCount: 0,
    lastAutomationRunAt: "2026-06-24T08:00:00.000Z",
    lastAutomationStatus: "success",
    nextAutomationRunAt: "2026-06-25T08:00:00.000Z",
  };

  it("ready when eligible pool >= max", () => {
    const out = buildTrainingOrdersReadinessPayload(base);
    assert.equal(out.minOrdersPerRound, 50);
    assert.equal(out.maxOrdersPerRound, 100);
    assert.equal(out.nextRoundReadinessStatus, "ready");
    assert.equal(out.canCreateNextRound, true);
    assert.equal(out.eligibleForNextRound, 120);
    assert.ok(!out.readinessWarnings.includes("insufficient_eligible_pool"));
  });

  it("blocked when eligible pool < min", () => {
    const out = buildTrainingOrdersReadinessPayload({ ...base, eligibleForNextRound: 30 });
    assert.equal(out.nextRoundReadinessStatus, "blocked");
    assert.equal(out.canCreateNextRound, false);
    assert.ok(out.readinessWarnings.includes("insufficient_eligible_pool"));
  });

  it("warning when eligible >= min but < max", () => {
    const out = buildTrainingOrdersReadinessPayload({ ...base, eligibleForNextRound: 75 });
    assert.equal(out.nextRoundReadinessStatus, "warning");
    assert.equal(out.canCreateNextRound, true);
  });

  it("maps automation success/failure timestamps", () => {
    const ok = buildTrainingOrdersReadinessPayload(base);
    assert.equal(ok.lastAutomationSuccessAt, base.lastAutomationRunAt);
    assert.equal(ok.lastAutomationFailedAt, null);

    const fail = buildTrainingOrdersReadinessPayload({
      ...base,
      lastAutomationStatus: "failed",
    });
    assert.equal(fail.lastAutomationFailedAt, base.lastAutomationRunAt);
    assert.equal(fail.lastAutomationSuccessAt, null);
  });

  it("flags old visible order leaks", () => {
    const out = buildTrainingOrdersReadinessPayload({ ...base, oldVisibleOrdersCount: 3 });
    assert.equal(out.oldVisibleOrdersCount, 3);
    assert.ok(out.readinessWarnings.includes("old_visible_orders_detected"));
  });

  it("warns when next automation run is scheduled after active round ends", () => {
    const out = buildTrainingOrdersReadinessPayload({
      ...base,
      nextAutomationRunAt: "2026-06-25T12:00:00.000Z",
      activeRoundVisibleUntil: "2026-06-24T12:00:00.000Z",
    });
    assert.ok(out.readinessWarnings.includes("rotation_scheduled_after_round_end"));
    assert.ok(typeof out.handoffLeadTimeMs === "number" && out.handoffLeadTimeMs > 0);
  });
});

function buildReadinessMockClient({ eligibleCount = 2, callLog = [] } = {}) {
  const eligibleRows = Array.from({ length: eligibleCount }, (_, i) => ({
    id: i + 1,
    template_id: null,
    category_id: 1,
    category_name: "Design",
    category_slug: "design",
  }));

  const client = {
    async query(sql, params = []) {
      callLog.push({ sql: String(sql), params });
      const s = String(sql);
      if (s.includes("COUNT(DISTINCT fr.id)") && s.includes("visible_count")) {
        return {
          rows: [{ visible_count: 69, active_rounds: 1, earliest_until: new Date(Date.now() + 3600_000).toISOString() }],
        };
      }
      if (s.includes("SELECT COUNT(*)::int AS c") && s.includes("INNER JOIN categories c") && s.includes("NOT EXISTS")) {
        return { rows: [{ c: eligibleRows.length }] };
      }
      if (s.includes("INNER JOIN categories c") && s.includes("NOT EXISTS") && s.includes("fake_order_round_items")) {
        return { rows: eligibleRows };
      }
      if (s.includes("FROM fake_order_rounds WHERE status = 'active'")) {
        return {
          rows: [
            {
              id: 319,
              title: "Round 319",
              min_orders: 50,
              max_orders: 100,
              generated_count: 69,
              duration_hours: 12,
              starts_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
              status: "active",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              round_source: "automation",
              created_by: 1,
              settings_snapshot: {},
            },
          ],
        };
      }
      if (s.includes("GROUP BY ri.round_id")) {
        return {
          rows: [{ round_id: 319, visible_count: 69, visible_from: new Date().toISOString(), visible_until: new Date(Date.now() + 3600_000).toISOString() }],
        };
      }
      if (s.includes("COUNT(DISTINCT fo.id)::int AS c") && s.includes("show_to_all_visitors")) {
        return { rows: [{ c: 71 }] };
      }
      if (s.includes("COUNT(*)::int AS c FROM fake_orders")) {
        return { rows: [{ c: 400 }] };
      }
      if (s.includes("is_open_for_pool = TRUE")) {
        return { rows: [{ c: 380 }] };
      }
      if (s.includes("ri_any.fake_order_id = fo.id")) {
        return { rows: [{ c: 0 }] };
      }
      if (s.includes("COUNT(DISTINCT fo.id)::int AS c") && s.includes("NOT (") && s.includes("fr.status = 'active'")) {
        return { rows: [{ c: 0 }] };
      }
      if (s.includes("ORDER BY applicants_count DESC")) {
        return {
          rows: [
            {
              id: 10,
              title: "Visible order",
              order_code: "TRN-10",
              fake_status: "active",
              category_name: "Design",
              round_id: 319,
              visible_until: new Date(Date.now() + 3600_000).toISOString(),
              round_status: "active",
            },
          ],
        };
      }
      if (s.includes("FROM fake_order_settings WHERE id = 1")) {
        return {
          rows: [
            {
              id: 1,
              training_orders_enabled: true,
              automation_enabled: true,
              min_orders: 50,
              max_orders: 100,
              duration_value: 12,
              duration_unit: "hours",
              show_to_all_freelancers: true,
              show_to_all_visitors: true,
              category_distribution: { content: 34, programming: 33, design: 33 },
              next_automation_run_at: new Date(Date.now() + 86400_000).toISOString(),
              last_automation_run_at: new Date().toISOString(),
              last_automation_status: "success",
            },
          ],
        };
      }
      if (s.includes("fake_order_settings_plans")) {
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() {},
  };

  return {
    client,
    mockPool: {
      connect: async () => client,
      query: client.query.bind(client),
    },
  };
}

describe("getTrainingOrdersReadiness service", () => {
  it("does not mutate data (SELECT-only service path)", async () => {
    const callLog = [];
    const { mockPool } = buildReadinessMockClient({ eligibleCount: 2, callLog });
    const service = loadFakeOrdersServiceWithMockPool(mockPool);
    const out = await service.getTrainingOrdersReadiness();

    assert.equal(out.eligibleForNextRound, 2);
    assert.equal(out.currentlyVisibleFakeOrders, 69);
    assert.ok(Array.isArray(out.visibleOrdersPreview));
    assert.ok(out.visibleOrdersPreview.length >= 1);

    const mutating = callLog.filter(
      ({ sql }) =>
        /^\s*(UPDATE|INSERT|DELETE|BEGIN|COMMIT|ROLLBACK)/i.test(sql) ||
        /\bUPDATE\b/i.test(sql) ||
        /\bINSERT\b/i.test(sql) ||
        /\bDELETE\b/i.test(sql),
    );
    assert.equal(mutating.length, 0, `expected no mutations, got: ${mutating.map((m) => m.sql.slice(0, 40)).join("; ")}`);
  });

  it("uses configured min/max from getSettings (camelCase), not fallback 1/1", async () => {
    const { mockPool } = buildReadinessMockClient({ eligibleCount: 331 });
    const service = loadFakeOrdersServiceWithMockPool(mockPool);
    const out = await service.getTrainingOrdersReadiness();

    assert.equal(out.minOrdersPerRound, 50);
    assert.equal(out.maxOrdersPerRound, 100);
    assert.equal(out.eligibleForNextRound, 331);
    assert.equal(out.nextRoundReadinessStatus, "ready");
    assert.equal(out.canCreateNextRound, true);
  });

  it("warning status when eligible is between min and max", async () => {
    const { mockPool } = buildReadinessMockClient({ eligibleCount: 75 });
    const service = loadFakeOrdersServiceWithMockPool(mockPool);
    const out = await service.getTrainingOrdersReadiness();

    assert.equal(out.minOrdersPerRound, 50);
    assert.equal(out.maxOrdersPerRound, 100);
    assert.equal(out.eligibleForNextRound, 75);
    assert.equal(out.nextRoundReadinessStatus, "warning");
    assert.equal(out.canCreateNextRound, true);
  });

  it("blocked status when eligible is below min", async () => {
    const { mockPool } = buildReadinessMockClient({ eligibleCount: 30 });
    const service = loadFakeOrdersServiceWithMockPool(mockPool);
    const out = await service.getTrainingOrdersReadiness();

    assert.equal(out.minOrdersPerRound, 50);
    assert.equal(out.maxOrdersPerRound, 100);
    assert.equal(out.eligibleForNextRound, 30);
    assert.equal(out.nextRoundReadinessStatus, "blocked");
    assert.equal(out.canCreateNextRound, false);
  });

  it("eligible count uses COUNT-only pool query for readiness (not full row load)", () => {
    assert.match(serviceSrc, /countEligibleFakeOrderPool/);
    assert.match(serviceSrc, /getTrainingOrdersReadiness/);
    assert.match(serviceSrc, /eligibleForNextRound,/);
    assert.match(serviceSrc, /SELECT COUNT\(\*\)::int AS c/);
    assert.match(serviceSrc, /NOT EXISTS/);
    assert.match(serviceSrc, /ri\.visible_until > NOW\(\)/);
  });

  it("countOldVisibleOrderLeaks stale query ignores pool inventory never shown in a round", () => {
    const fnStart = serviceSrc.indexOf("async function countOldVisibleOrderLeaks");
    assert.ok(fnStart >= 0, "countOldVisibleOrderLeaks must exist");
    const fnEnd = serviceSrc.indexOf("async function listCurrentlyVisibleFakeOrdersPreview", fnStart);
    const fnBody = serviceSrc.slice(fnStart, fnEnd);
    const staleStart = fnBody.indexOf("const { rows: staleRows }");
    const staleBlock = fnBody.slice(staleStart, staleStart + 700);
    assert.match(staleBlock, /fake_order_round_items ri_any/);
    assert.match(staleBlock, /ri_any\.fake_order_id = fo\.id/);
    assert.match(staleBlock, /AND EXISTS/);
  });

  it("countOldVisibleOrderLeaks keeps visible-window inconsistency detector (query A)", () => {
    const fnStart = serviceSrc.indexOf("async function countOldVisibleOrderLeaks");
    const fnEnd = serviceSrc.indexOf("async function listCurrentlyVisibleFakeOrdersPreview", fnStart);
    const fnBody = serviceSrc.slice(fnStart, fnEnd);
    assert.match(fnBody, /ri\.visible_from <= NOW\(\)/);
    assert.match(fnBody, /ri\.visible_until > NOW\(\)/);
    assert.match(fnBody, /fr\.status = 'active'/);
  });
});

describe("countOldVisibleOrderLeaks", () => {
  const { countOldVisibleOrderLeaks } = require("../src/services/fakeOrdersService");

  it("adds visible-window leaks and stale orders that previously appeared in a round", async () => {
    const queries = [];
    const runner = {
      query: async (sql) => {
        const s = String(sql);
        queries.push(s);
        if (s.includes("COUNT(DISTINCT fo.id)::int AS c")) return { rows: [{ c: 2 }] };
        if (s.includes("ri_any.fake_order_id = fo.id")) return { rows: [{ c: 3 }] };
        return { rows: [{ c: 0 }] };
      },
    };
    assert.equal(await countOldVisibleOrderLeaks(runner), 5);
    assert.equal(queries.length, 2);
    assert.match(queries[1], /fake_order_round_items ri_any/);
  });

  it("does not count converted pool inventory with zero round items (query B returns 0)", async () => {
    const runner = {
      query: async (sql) => {
        const s = String(sql);
        if (s.includes("COUNT(DISTINCT fo.id)::int AS c")) return { rows: [{ c: 0 }] };
        if (s.includes("ri_any.fake_order_id = fo.id")) return { rows: [{ c: 0 }] };
        return { rows: [{ c: 0 }] };
      },
    };
    assert.equal(await countOldVisibleOrderLeaks(runner), 0);
  });
});
