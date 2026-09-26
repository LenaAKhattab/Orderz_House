/**
 * Legacy Admin live marketplace package selector — focused regression tests.
 * Run: node --test test/legacyLivePackageSelector.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/legacy_live_pkg_test_placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "legacy-live-package-selector-test-secret";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function loadServiceWithPool(pool) {
  const dbPath = require.resolve("../src/config/db");
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool } };
  const svcPath = require.resolve("../src/services/legacyAssignableMarketplacePackagesService");
  delete require.cache[svcPath];
  return require("../src/services/legacyAssignableMarketplacePackagesService");
}

describe("legacy live package selector — static wiring", () => {
  it("exposes assignable-packages route before :userId", () => {
    const routes = read("src/routes/superAdminLegacyFreelancerInviteRoutes.js");
    const assignableIdx = routes.indexOf("/legacy-freelancers/assignable-packages");
    const userIdx = routes.indexOf('/legacy-freelancers/:userId"');
    assert.ok(assignableIdx > 0, "assignable-packages route missing");
    assert.ok(userIdx > assignableIdx, "assignable-packages must be registered before :userId");
  });

  it("admin service validates marketplace bridge plans on assign", () => {
    const svc = read("src/services/legacyFreelancerAdminService.js");
    assert.match(svc, /listAssignablePackagesForLegacyAdmin|listAssignablePackages/);
    assert.match(svc, /assertAssignableLegacyPackagePlanId/);
    assert.doesNotMatch(svc, /require\(["']stripe["']\)/i);
  });

  it("frontend uses assignable packages API not full admin plans dump", () => {
    const panel = read(
      "../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyFreelancersPanel.jsx",
    );
    const api = read("../frontend/src/services/api.js");
    assert.match(api, /listLegacyFreelancerAssignablePackagesRequest/);
    assert.match(panel, /listLegacyFreelancerAssignablePackagesRequest/);
    assert.doesNotMatch(panel, /listAdminPlansRequest/);
    assert.match(panel, /PACKAGE_DURATION_OPTIONS/);
  });

  it("keeps historical package history rendering", () => {
    const panel = read(
      "../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyFreelancersPanel.jsx",
    );
    assert.match(panel, /packageHistory/);
    assert.match(panel, /planTitle \|\| h\.planName/);
    const svc = read("src/services/legacyFreelancerAdminService.js");
    assert.match(svc, /legacy_freelancer_package_assignments/);
    assert.match(svc, /p\.title AS plan_title/);
  });
});

describe("legacyAssignableMarketplacePackagesService", () => {
  it("lists STARTER SILVER PRO ELITE and excludes promo/duration/legacy", async () => {
    const pool = {
      query: async (sql, params = []) => {
        const s = String(sql);
        if (s.includes("FROM marketplace_membership_plans") && s.includes("is_active = TRUE")) {
          return {
            rows: [
              {
                id: 7,
                tier_code: "starter",
                name_ar: "ستارتر",
                name_en: "Starter",
                monthly_price_jod: 0,
                cycle_duration_days: 10,
                sort_order: 1,
                description_ar: "starter",
              },
              {
                id: 8,
                tier_code: "silver",
                name_ar: "فضة",
                name_en: "Silver",
                monthly_price_jod: 19,
                cycle_duration_days: 30,
                sort_order: 2,
                description_ar: "silver",
              },
              {
                id: 3,
                tier_code: "pro",
                name_ar: "برو",
                name_en: "Pro",
                monthly_price_jod: 39,
                cycle_duration_days: 30,
                sort_order: 3,
                description_ar: "pro",
              },
              {
                id: 4,
                tier_code: "elite",
                name_ar: "إيليت",
                name_en: "Elite",
                monthly_price_jod: 59,
                cycle_duration_days: 30,
                sort_order: 4,
                description_ar: "elite",
              },
            ],
          };
        }
        if (s.includes("INSERT INTO plans")) {
          const bridgeName = params[0];
          const idMap = {
            marketplace_membership_starter: 101,
            marketplace_membership_silver: 102,
            marketplace_membership_pro: 103,
            marketplace_membership_elite: 104,
          };
          return {
            rows: [
              {
                id: idMap[bridgeName],
                name: bridgeName,
                title: params[1],
                price_jod: params[4],
                duration_days: params[3],
                is_active: true,
                is_visible: false,
              },
            ],
          };
        }
        if (s.includes("special_offer")) {
          return {
            rows: [
              {
                id: 9,
                tier_code: "special_offer",
                name_ar: "باقة العرض",
                name_en: "Offer",
                is_active: true,
              },
            ],
          };
        }
        if (s.includes("FROM plans") && s.includes("ORDER BY id")) {
          return {
            rows: [
              {
                id: 20,
                name: "freelancers_1_month",
                title: "شهر واحد",
                is_active: false,
                is_visible: true,
                deleted_at: null,
              },
              {
                id: 21,
                name: "freelancers_1_year",
                title: "سنة واحدة",
                is_active: false,
                is_visible: true,
                deleted_at: null,
              },
              {
                id: 25,
                name: "plan_msk",
                title: "باقة المبتدئين",
                is_active: true,
                is_visible: true,
                deleted_at: null,
              },
              {
                id: 101,
                name: "marketplace_membership_starter",
                title: "STARTER",
                is_active: true,
                is_visible: false,
                deleted_at: null,
              },
            ],
          };
        }
        return { rows: [] };
      },
    };

    const service = loadServiceWithPool(pool);
    const listed = await service.listAssignablePackagesForLegacyAdmin({ includeDiagnostic: true });
    const codes = listed.packages.map((p) => p.displayName);
    assert.deepStrictEqual(codes, ["STARTER", "SILVER", "PRO", "ELITE"]);
    assert.equal(listed.packages.find((p) => p.displayName === "STARTER")?.planId, "101");
    assert.equal(listed.packages.find((p) => p.displayName === "SILVER")?.planId, "102");
    assert.equal(listed.packages.find((p) => p.displayName === "PRO")?.planId, "103");
    assert.equal(listed.packages.find((p) => p.displayName === "ELITE")?.planId, "104");
    assert.equal(listed.promoOffer.included, false);
    assert.ok(listed.diagnostic.counts.duration >= 1);
    assert.ok(listed.diagnostic.counts.inactive >= 1 || listed.diagnostic.counts.duration >= 2);
    assert.ok(listed.diagnostic.counts.unrelated >= 1);
    assert.ok(listed.diagnostic.counts.bridge >= 1);
    assert.ok(!codes.some((c) => /شهر|سنة|تدريب|المبتدئين|العرض/.test(c)));
  });

  it("rejects inactive, non-bridge, and invalid tiers; accepts STARTER bridge", async () => {
    const pool = {
      query: async (sql, params = []) => {
        const s = String(sql);
        if (s.includes("FROM plans") && s.includes("WHERE id")) {
          const id = Number(params[0]);
          const map = {
            20: {
              id: 20,
              name: "freelancers_1_month",
              title: "شهر واحد",
              is_active: false,
              deleted_at: null,
            },
            25: {
              id: 25,
              name: "plan_msk",
              title: "باقة المبتدئين",
              is_active: true,
              deleted_at: null,
            },
            109: {
              id: 109,
              name: "marketplace_membership_special_offer",
              title: "OFFER",
              is_active: true,
              deleted_at: null,
            },
            101: {
              id: 101,
              name: "marketplace_membership_starter",
              title: "STARTER",
              is_active: true,
              deleted_at: null,
            },
          };
          return { rows: map[id] ? [map[id]] : [] };
        }
        if (s.includes("FROM marketplace_membership_plans")) {
          const tier = String(params[0] || "");
          if (tier === "starter") {
            return { rows: [{ id: 7, tier_code: "starter", is_active: true }] };
          }
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    const service = loadServiceWithPool(pool);

    await assert.rejects(() => service.assertAssignableLegacyPackagePlanId(20), (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });
    await assert.rejects(() => service.assertAssignableLegacyPackagePlanId(25), (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(String(err.message), /STARTER|SILVER|PRO|ELITE/);
      return true;
    });
    await assert.rejects(() => service.assertAssignableLegacyPackagePlanId(109), (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });

    const ok = await service.assertAssignableLegacyPackagePlanId(101);
    assert.equal(ok.tierCode, "starter");
    assert.equal(ok.planTitle, "STARTER");
    assert.equal(ok.marketplacePlanId, 7);
  });

  it("display codes match public marketplace naming", () => {
    const service = loadServiceWithPool({ query: async () => ({ rows: [] }) });
    assert.equal(service.displayCodeForTier("starter"), "STARTER");
    assert.equal(service.displayCodeForTier("silver"), "SILVER");
    assert.equal(service.displayCodeForTier("pro"), "PRO");
    assert.equal(service.displayCodeForTier("elite"), "ELITE");
  });
});
