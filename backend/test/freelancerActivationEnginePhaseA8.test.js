/**
 * Phase A8 — Work Inventory Reserve (internal accounting ledger).
 * Does not apply migrations. No Production / git / Stripe / orders / wallet.
 *
 * Run: node --test test/freelancerActivationEnginePhaseA8.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a8_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  FREELANCER_ACTIVATION_EVENT_TYPES,
  FREELANCER_ACTIVATION_SETTINGS_DEFAULTS,
} = require("../src/constants/freelancerActivationEngine");
const reserve = require("../src/services/freelancerActivationWorkInventoryReserveService");
const conversion = require("../src/services/freelancerActivationConversionService");
const kpi = require("../src/services/freelancerActivationKpiService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function settingsRow(overrides = {}) {
  return {
    freelancer_activation_engine_enabled: true,
    freelancer_activation_trial_duration_days: 10,
    freelancer_activation_trial_bids: 20,
    freelancer_activation_daily_bid_limit: 2,
    freelancer_activation_successful_work_cap: 2,
    freelancer_activation_requires_training: true,
    freelancer_activation_requires_verification: true,
    freelancer_activation_silver_plan_code: "silver",
    freelancer_activation_archive_after_days: 45,
    freelancer_activation_work_inventory_enabled: false,
    freelancer_activation_work_inventory_percentage: 50,
    ...overrides,
  };
}

function createFakeClient(mem) {
  mem.events = mem.events || [];
  mem.wirEntries = mem.wirEntries || [];
  mem.nextWirId = mem.nextWirId || 1;
  mem.paymentTouched = false;
  mem.walletTouched = false;
  mem.claimsTouched = false;

  return {
    async query(sql, params = []) {
      const s = String(sql);
      if (/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/.test(s)) return { rows: [] };

      if (s.includes("freelancer_activation_engine_enabled")) {
        return { rows: [mem.settings] };
      }

      if (s.includes("FROM freelancer_marketplace_memberships")) {
        return { rows: mem.membership ? [mem.membership] : [] };
      }

      if (s.includes("FROM freelancer_activation_trials WHERE freelancer_user_id")) {
        return { rows: mem.trial ? [mem.trial] : [] };
      }

      if (s.includes("INSERT INTO freelancer_activation_events")) {
        mem.events.push({
          freelancer_user_id: params[0],
          trial_id: params[1],
          event_type: params[2],
          metadata: params[3],
        });
        return { rows: [] };
      }

      if (s.includes("freelancer_activation_work_inventory_reserve_entries")) {
        if (mem.wirSchemaMissing) {
          const err = new Error("missing wir");
          err.code = "42P01";
          throw err;
        }

        if (s.includes("WHERE idempotency_key")) {
          const key = params[0];
          const found = mem.wirEntries.find((e) => e.idempotency_key === key);
          return { rows: found ? [found] : [] };
        }

        if (s.trimStart().startsWith("INSERT")) {
          const row = {
            id: mem.nextWirId++,
            freelancer_user_id: params[0],
            trial_id: params[1],
            membership_id: params[2],
            plan_code: params[3],
            plan_price_jod: params[4],
            reserve_percentage: params[5],
            reserve_amount_jod: params[6],
            currency: "JOD",
            entry_type: "membership_reserve_allocated",
            status: "active",
            idempotency_key: params[7],
            metadata:
              typeof params[8] === "string" ? JSON.parse(params[8]) : params[8],
            created_by_user_id: params[9],
            created_at: "2026-08-20T12:00:00.000Z",
            updated_at: "2026-08-20T12:00:00.000Z",
          };
          if (mem.wirEntries.some((e) => e.idempotency_key === row.idempotency_key)) {
            const err = new Error("duplicate");
            err.code = "23505";
            throw err;
          }
          mem.wirEntries.push(row);
          return { rows: [row] };
        }

        if (s.includes("COALESCE(SUM")) {
          let allocated = 0;
          let active = 0;
          let reversed = 0;
          for (const e of mem.wirEntries) {
            const amt = Number(e.reserve_amount_jod);
            if (e.entry_type === "membership_reserve_allocated") {
              allocated += amt;
              if (e.status === "active") active += amt;
            }
            if (e.status === "reversed" || e.entry_type === "membership_reserve_reversed") {
              reversed += amt;
            }
          }
          return {
            rows: [
              {
                allocated: allocated.toFixed(3),
                active: active.toFixed(3),
                reversed: reversed.toFixed(3),
              },
            ],
          };
        }

        if (s.includes("ORDER BY created_at DESC")) {
          return { rows: [...mem.wirEntries].reverse() };
        }

        return { rows: mem.wirEntries };
      }

      if (/payment|wallet|claim|stripe|paytabs/i.test(s) && !s.includes("freelancer_activation")) {
        mem.paymentTouched = true;
        mem.walletTouched = true;
        mem.claimsTouched = true;
      }

      throw new Error(`Unexpected SQL in A8 fake client: ${s.slice(0, 200)}`);
    },
  };
}

describe("Phase A8 isolation", () => {
  it("adds migration 172 and does not rewrite payment/webhook/orders domains", () => {
    const migrations = fs.readdirSync(path.join(root, "sql/migrations"));
    assert.ok(migrations.some((f) => f.startsWith("172_freelancer_activation_work_inventory_reserve")));
    const sql = read("sql/migrations/172_freelancer_activation_work_inventory_reserve_a8.sql");
    assert.match(sql, /freelancer_activation_work_inventory_reserve_entries/);
    assert.match(sql, /freelancer_activation_work_inventory_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /DEFAULT 50\.000/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b|\bTRUNCATE\b/);
    assert.doesNotMatch(sql, /CREATE TABLE.*wallet|ALTER TABLE.*wallet|financial_claims|stripe_webhook|paytabs/i);
    assert.match(sql, /Not wallet, claims, or payment/);

    const svc = read("src/services/freelancerActivationWorkInventoryReserveService.js");
    assert.doesNotMatch(svc, /require\(["'].*stripe/i);
    assert.doesNotMatch(svc, /require\(["'].*paytabs/i);
    assert.doesNotMatch(svc, /require\(["'].*ordersService/);
    assert.doesNotMatch(svc, /require\(["'].*financialClaims/);
    assert.doesNotMatch(svc, /reserveBidCredits|consumeBid/);

    const routes = read("src/routes/superAdminFreelancerActivationRoutes.js");
    assert.match(routes, /work-inventory-reserve/);
    assert.match(routes, /requireSuperAdmin/);

    const conv = read("src/services/freelancerActivationConversionService.js");
    assert.match(conv, /allocateWorkInventoryReserveForPaidMembership/);
    assert.doesNotMatch(conv, /stripeWebhook|paytabsWebhook/);
  });

  it("defaults keep reserve disabled; percentage default 50", () => {
    assert.equal(FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.workInventoryEnabled, false);
    assert.equal(FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.workInventoryPercentage, 50);
    assert.equal(
      FREELANCER_ACTIVATION_EVENT_TYPES.WORK_INVENTORY_RESERVE_ALLOCATED,
      "work_inventory_reserve_allocated",
    );
  });
});

describe("Phase A8 allocation math + gates", () => {
  it("computes 19 JOD × 50% = 9.500 JOD", () => {
    assert.equal(reserve.computeReserveAmountJod("19.000", 50), "9.500");
    assert.equal(reserve.computeReserveAmountJod(19, 50), "9.500");
  });

  it("reserve disabled: no allocation", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_work_inventory_enabled: false }),
      membership: {
        tier_code: "silver",
        plan_id: 2,
        monthly_price_jod: "19.000",
        membership_id: 90,
      },
      trial: { id: 1, freelancer_user_id: 41, status: "paid_active" },
    };
    const client = createFakeClient(mem);
    const out = await reserve.allocateWorkInventoryReserveForPaidMembership(41, { client });
    assert.equal(out.skipped, true);
    assert.equal(out.reason, "reserve_disabled");
    assert.equal(mem.wirEntries.length, 0);
  });

  it("engine disabled: no allocation even if reserve enabled", async () => {
    const mem = {
      settings: settingsRow({
        freelancer_activation_engine_enabled: false,
        freelancer_activation_work_inventory_enabled: true,
      }),
      membership: {
        tier_code: "silver",
        plan_id: 2,
        monthly_price_jod: "19.000",
        membership_id: 90,
      },
    };
    const out = await reserve.allocateWorkInventoryReserveForPaidMembership(41, {
      client: createFakeClient(mem),
    });
    assert.equal(out.reason, "engine_disabled");
    assert.equal(mem.wirEntries.length, 0);
  });

  it("reserve enabled + paid Silver: creates one entry at 9.500 JOD", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_work_inventory_enabled: true }),
      membership: {
        tier_code: "silver",
        plan_id: 2,
        monthly_price_jod: "19.000",
        membership_id: 90,
      },
      trial: { id: 7, freelancer_user_id: 41, status: "paid_active" },
    };
    const client = createFakeClient(mem);
    const out = await reserve.allocateWorkInventoryReserveForPaidMembership(41, { client });
    assert.equal(out.allocated, true);
    assert.equal(out.entry.reserveAmountJod, "9.500");
    assert.equal(out.entry.planPriceJod, "19.000");
    assert.equal(out.entry.planCode, "silver");
    assert.equal(out.entry.idempotencyKey, "work_inventory_reserve:90");
    assert.equal(out.entry.metadata.amountSource, "catalog_plan_price");
    assert.equal(mem.wirEntries.length, 1);
    assert.ok(
      mem.events.some(
        (e) => e.event_type === FREELANCER_ACTIVATION_EVENT_TYPES.WORK_INVENTORY_RESERVE_ALLOCATED,
      ),
    );
    assert.equal(mem.paymentTouched, false);
    assert.equal(mem.walletTouched, false);
    assert.equal(mem.claimsTouched, false);
  });

  it("repeated allocate is idempotent", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_work_inventory_enabled: true }),
      membership: {
        tier_code: "silver",
        plan_id: 2,
        monthly_price_jod: "19.000",
        membership_id: 90,
      },
      trial: { id: 7, freelancer_user_id: 41, status: "paid_active" },
    };
    const client = createFakeClient(mem);
    const first = await reserve.allocateWorkInventoryReserveForPaidMembership(41, { client });
    const second = await reserve.allocateWorkInventoryReserveForPaidMembership(41, { client });
    assert.equal(first.allocated, true);
    assert.equal(second.idempotent, true);
    assert.equal(second.entry.id, first.entry.id);
    assert.equal(mem.wirEntries.length, 1);
  });

  it("paid Pro and Elite can allocate", async () => {
    for (const [tier, price, expected] of [
      ["pro", "39.000", "19.500"],
      ["elite", "59.000", "29.500"],
    ]) {
      const mem = {
        settings: settingsRow({ freelancer_activation_work_inventory_enabled: true }),
        membership: {
          tier_code: tier,
          plan_id: 3,
          monthly_price_jod: price,
          membership_id: tier === "pro" ? 11 : 12,
        },
        trial: null,
      };
      const out = await reserve.allocateWorkInventoryReserveForPaidMembership(50, {
        client: createFakeClient(mem),
      });
      assert.equal(out.allocated, true, tier);
      assert.equal(out.entry.reserveAmountJod, expected, tier);
      assert.equal(out.entry.planCode, tier);
    }
  });

  it("no allocation for unpaid trial user", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_work_inventory_enabled: true }),
      membership: null,
      trial: { id: 1, freelancer_user_id: 41, status: "trial_active" },
    };
    const out = await reserve.allocateWorkInventoryReserveForPaidMembership(41, {
      client: createFakeClient(mem),
    });
    assert.equal(out.reason, "not_paid_active");
    assert.equal(mem.wirEntries.length, 0);
  });

  it("reversal helper is deferred placeholder", async () => {
    const out = await reserve.reverseWorkInventoryReserveForMembership(90);
    assert.equal(out.deferred, true);
    assert.equal(out.reversed, false);
  });
});

describe("Phase A8 sync hook + admin summary + KPI", () => {
  it("syncActivationPaidStatus allocates when reserve enabled", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_work_inventory_enabled: true }),
      membership: {
        tier_code: "silver",
        plan_id: 2,
        monthly_price_jod: "19.000",
        membership_id: 90,
      },
      trial: {
        id: 7,
        freelancer_user_id: 41,
        status: "trial_active",
        silver_paid_at: null,
      },
    };
    // Minimal stubs for sync paths beyond membership/settings
    const base = createFakeClient(mem);
    const client = {
      async query(sql, params) {
        const s = String(sql);
        if (s.includes("status = 'paid_active'") && s.includes("silver_paid_at")) {
          mem.trial = {
            ...mem.trial,
            status: "paid_active",
            silver_paid_at: params[1] || new Date().toISOString(),
          };
          return { rows: [mem.trial] };
        }
        if (s.includes("SET silver_paid_at")) {
          mem.trial.silver_paid_at = params[1] || new Date().toISOString();
          return { rows: [mem.trial] };
        }
        try {
          return await base.query(sql, params);
        } catch (err) {
          if (String(err.message).includes("Unexpected SQL")) return { rows: [] };
          throw err;
        }
      },
    };
    const sync = await conversion.syncActivationPaidStatus(41, { client });
    assert.equal(sync.paidActive, true);
    assert.equal(mem.wirEntries.length, 1);
    assert.equal(mem.wirEntries[0].reserve_amount_jod, "9.500");
  });

  it("admin summary returns totals and internal note", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_work_inventory_enabled: true }),
      wirEntries: [
        {
          id: 1,
          freelancer_user_id: 41,
          membership_id: 90,
          plan_code: "silver",
          plan_price_jod: "19.000",
          reserve_percentage: 50,
          reserve_amount_jod: "9.500",
          entry_type: "membership_reserve_allocated",
          status: "active",
          idempotency_key: "work_inventory_reserve:90",
          metadata: { amountSource: "catalog_plan_price" },
          created_at: "2026-08-20T12:00:00.000Z",
          updated_at: "2026-08-20T12:00:00.000Z",
        },
      ],
    };
    const out = await reserve.getSuperAdminWorkInventoryReserveSummary({
      client: createFakeClient(mem),
    });
    assert.equal(out.schemaReady, true);
    assert.equal(out.totalReserveAllocatedJod, "9.500");
    assert.equal(out.totalReserveActiveJod, "9.500");
    assert.equal(out.totalReserveReversedJod, "0.000");
    assert.equal(out.recentEntries.length, 1);
    assert.match(out.noteAr, /سجل داخلي/);
    assert.doesNotMatch(JSON.stringify(out), /"email"|"phone"/i);
  });

  it("KPI includes reserve totals when rows present; null when schema missing", () => {
    const ready = kpi.computeKpisFromRows({
      filters: { campaignId: null, waveId: null, dateFrom: null, dateTo: null },
      workInventoryRows: [
        {
          entry_type: "membership_reserve_allocated",
          status: "active",
          reserve_amount_jod: "9.500",
        },
      ],
    });
    assert.equal(ready.financial.workInventoryReserveAllocatedJod, "9.500");
    assert.equal(ready.financial.workInventoryReserveActiveJod, "9.500");

    const missing = kpi.computeKpisFromRows({
      filters: { campaignId: null, waveId: null, dateFrom: null, dateTo: null },
      workInventoryRows: null,
    });
    assert.equal(missing.financial.workInventoryReserveAllocatedJod, null);
    assert.equal(missing.financial.workInventoryReserveActiveJod, null);
    assert.ok(
      missing.metadata.unavailableMetrics.some(
        (m) => m.key === "financial.workInventoryReserveAllocatedJod",
      ),
    );
  });

  it("allocate returns schema_missing safely", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_work_inventory_enabled: true }),
      membership: {
        tier_code: "silver",
        plan_id: 2,
        monthly_price_jod: "19.000",
        membership_id: 90,
      },
      wirSchemaMissing: true,
    };
    const out = await reserve.allocateWorkInventoryReserveForPaidMembership(41, {
      client: createFakeClient(mem),
    });
    assert.equal(out.reason, "schema_missing");
  });
});
