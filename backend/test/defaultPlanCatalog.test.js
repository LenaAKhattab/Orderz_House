/**
 * Default plan catalog — Super Admin setting + resolver.
 * Run: node --test test/defaultPlanCatalog.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/default_plan_catalog_test";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  PLAN_CATALOG,
  DEFAULT_PLAN_CATALOG_INITIAL_VALUE,
  DEFAULT_PLAN_CATALOG_SETTING_KEY,
} = require("../src/constants/planCatalogs");

const SETTINGS = new Map();
const CATALOG_COUNTS = {
  [PLAN_CATALOG.MAIN_PLANS]: 3,
  [PLAN_CATALOG.PAGE_PLANS]: 2,
  [PLAN_CATALOG.MARKETPLACE_PLANS]: 4,
};

function installMocks() {
  SETTINGS.clear();
  CATALOG_COUNTS[PLAN_CATALOG.MAIN_PLANS] = 3;
  CATALOG_COUNTS[PLAN_CATALOG.PAGE_PLANS] = 2;
  CATALOG_COUNTS[PLAN_CATALOG.MARKETPLACE_PLANS] = 4;

  const settingsPath = require.resolve("../src/services/systemSettingsService");
  require.cache[settingsPath] = {
    id: settingsPath,
    filename: settingsPath,
    loaded: true,
    exports: {
      getSetting: async (key) => (SETTINGS.has(key) ? SETTINGS.get(key) : null),
      setSetting: async (key, value) => {
        const normalized = value == null || String(value).trim() === "" ? null : String(value).trim();
        if (normalized == null) SETTINGS.delete(key);
        else SETTINGS.set(key, normalized);
        return normalized;
      },
    },
  };

  const plansPath = require.resolve("../src/services/plansService");
  require.cache[plansPath] = {
    id: plansPath,
    filename: plansPath,
    loaded: true,
    exports: {
      listPublicCatalogPlans: async () => Array.from({ length: CATALOG_COUNTS[PLAN_CATALOG.MAIN_PLANS] }, (_, i) => ({ id: String(i + 1) })),
    },
  };

  const pagesPath = require.resolve("../src/services/planPagesService");
  require.cache[pagesPath] = {
    id: pagesPath,
    filename: pagesPath,
    loaded: true,
    exports: {
      listPublicSpecialPageCatalogPlans: async () =>
        Array.from({ length: CATALOG_COUNTS[PLAN_CATALOG.PAGE_PLANS] }, (_, i) => ({ id: `p${i + 1}` })),
    },
  };

  const membershipPath = require.resolve("../src/services/marketplaceMembershipPlansService");
  require.cache[membershipPath] = {
    id: membershipPath,
    filename: membershipPath,
    loaded: true,
    exports: {
      listPublicMarketplaceMembershipPlans: async () => {
        const codes = ["starter", "silver", "pro", "elite"].slice(0, CATALOG_COUNTS[PLAN_CATALOG.MARKETPLACE_PLANS]);
        return codes.map((tierCode, i) => ({ id: String(i + 10), tierCode }));
      },
    },
  };

  const servicePath = require.resolve("../src/services/defaultPlanCatalogService");
  delete require.cache[servicePath];
  return require("../src/services/defaultPlanCatalogService");
}

describe("default plan catalog service", () => {
  let svc;

  beforeEach(() => {
    svc = installMocks();
  });

  it("resolves marketplace_plans when setting is unset (behavior-preserving)", async () => {
    const catalog = await svc.resolveDefaultPlanCatalog();
    assert.equal(catalog, PLAN_CATALOG.MARKETPLACE_PLANS);
    assert.equal(catalog, DEFAULT_PLAN_CATALOG_INITIAL_VALUE);
    const pub = await svc.getPublicDefaultPlanCatalog();
    assert.deepEqual(pub, { catalog: PLAN_CATALOG.MARKETPLACE_PLANS });
    assert.equal(Object.keys(pub).join(","), "catalog");
  });

  it("Super Admin can read current default catalog", async () => {
    SETTINGS.set(DEFAULT_PLAN_CATALOG_SETTING_KEY, PLAN_CATALOG.MAIN_PLANS);
    const admin = await svc.getAdminDefaultPlanCatalog();
    assert.equal(admin.catalog, PLAN_CATALOG.MAIN_PLANS);
    assert.equal(admin.catalogs.length, 3);
    assert.deepEqual(
      admin.catalogs.map((c) => c.id),
      [PLAN_CATALOG.MAIN_PLANS, PLAN_CATALOG.PAGE_PLANS, PLAN_CATALOG.MARKETPLACE_PLANS],
    );
  });

  it("rejects invalid catalog", async () => {
    await assert.rejects(() => svc.setDefaultPlanCatalog("not_a_catalog"), (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.publicCode, "INVALID_PLAN_CATALOG");
      assert.match(err.message, /غير موجود/);
      return true;
    });
    await assert.rejects(() => svc.setDefaultPlanCatalog("الباقات الرئيسية"), (err) => {
      assert.equal(err.publicCode, "INVALID_PLAN_CATALOG");
      return true;
    });
  });

  it("rejects empty/inactive catalog as default", async () => {
    CATALOG_COUNTS[PLAN_CATALOG.PAGE_PLANS] = 0;
    await assert.rejects(() => svc.setDefaultPlanCatalog(PLAN_CATALOG.PAGE_PLANS), (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.publicCode, "EMPTY_PLAN_CATALOG");
      assert.equal(err.message, svc.EMPTY_CATALOG_MESSAGE);
      return true;
    });
    assert.equal(SETTINGS.has(DEFAULT_PLAN_CATALOG_SETTING_KEY), false);
  });

  it("persists catalog A then B then C without copying plans", async () => {
    const a = await svc.setDefaultPlanCatalog(PLAN_CATALOG.MAIN_PLANS, { updatedByUserId: 9 });
    assert.equal(a.catalog, PLAN_CATALOG.MAIN_PLANS);
    assert.equal(SETTINGS.get(DEFAULT_PLAN_CATALOG_SETTING_KEY), PLAN_CATALOG.MAIN_PLANS);

    const b = await svc.setDefaultPlanCatalog(PLAN_CATALOG.PAGE_PLANS);
    assert.equal(b.catalog, PLAN_CATALOG.PAGE_PLANS);

    const c = await svc.setDefaultPlanCatalog(PLAN_CATALOG.MARKETPLACE_PLANS);
    assert.equal(c.catalog, PLAN_CATALOG.MARKETPLACE_PLANS);
    assert.equal(await svc.resolveDefaultPlanCatalog(), PLAN_CATALOG.MARKETPLACE_PLANS);
  });

  it("invalid stored setting does not silently fall back to another catalog", async () => {
    SETTINGS.set(DEFAULT_PLAN_CATALOG_SETTING_KEY, "legacy_hardcoded");
    await assert.rejects(() => svc.resolveDefaultPlanCatalog(), (err) => {
      assert.equal(err.statusCode, 503);
      assert.equal(err.publicCode, "INVALID_DEFAULT_PLAN_CATALOG");
      return true;
    });
    await assert.rejects(() => svc.getPublicDefaultPlanCatalog());
  });
});

describe("default plan catalog routes and wiring", () => {
  const root = path.join(__dirname, "..");

  function read(rel) {
    return fs.readFileSync(path.join(root, rel), "utf8");
  }

  it("Super Admin GET/PATCH are requireAuth + requireSuperAdmin; public GET is read-safe", () => {
    const admin = read("src/routes/superAdminDefaultPlanCatalogRoutes.js");
    const pub = read("src/routes/defaultPlanCatalogRoutes.js");
    const app = read("src/app.js");
    assert.match(admin, /requireAuth/);
    assert.match(admin, /requireSuperAdmin/);
    assert.match(admin, /router\.get\("\/default-plan-catalog"/);
    assert.match(admin, /router\.patch\(\s*"\/default-plan-catalog"/);
    assert.doesNotMatch(admin, /requireAdmin\b/);
    assert.match(pub, /router\.get\("\/default-plan-catalog"/);
    assert.doesNotMatch(pub, /requireAuth/);
    assert.match(app, /superAdminDefaultPlanCatalogRoutes/);
    assert.match(app, /defaultPlanCatalogRoutes/);
  });

  it("does not merge catalogs, copy plan rows, or reintroduce Work Token UI", () => {
    const svc = read("src/services/defaultPlanCatalogService.js");
    const pages = read("src/services/planPagesService.js");
    assert.match(svc, /resolveDefaultPlanCatalog/);
    assert.doesNotMatch(svc, /INSERT INTO\s+plans/i);
    assert.doesNotMatch(svc, /INSERT INTO\s+marketplace_membership_plans/i);
    assert.doesNotMatch(svc, /UPDATE\s+plans\s+SET/i);
    assert.match(pages, /listPublicSpecialPageCatalogPlans/);
    assert.match(pages, /listPlansForPageRow/);
    assert.doesNotMatch(svc, /Work Token/i);
  });

  it("marketplace membership service remains the CTA source for marketplace_plans", () => {
    const svc = read("src/services/defaultPlanCatalogService.js");
    assert.match(svc, /listPublicMarketplaceMembershipPlans/);
    assert.match(svc, /listPublicCatalogPlans/);
    assert.doesNotMatch(svc, /createFreelancerSubscriptionCheckout/);
  });
});
