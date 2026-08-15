/**
 * Public `/plans` content — Super Admin hero copy + initial Training/Work tab.
 * Run: node --test test/publicPlansContent.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/public_plans_content_test";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  PUBLIC_PLANS_CONTENT_SETTING_KEYS,
  PUBLIC_PLANS_DEFAULT_SECTION,
  PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK,
  PUBLIC_PLANS_CONTENT_DEFAULTS,
  PUBLIC_PLANS_CONTENT_MAX_LENGTHS,
} = require("../src/constants/publicPlansContent");
const { DEFAULT_PLAN_CATALOG_SETTING_KEY } = require("../src/constants/planCatalogs");

const SETTINGS = new Map();

function installMocks() {
  SETTINGS.clear();

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

  const servicePath = require.resolve("../src/services/publicPlansContentService");
  delete require.cache[servicePath];
  return require("../src/services/publicPlansContentService");
}

describe("public plans content service", () => {
  let svc;

  beforeEach(() => {
    svc = installMocks();
  });

  it("returns Production training defaults when settings are unset", async () => {
    const pub = await svc.getPublicPlansContent();
    assert.equal(pub.badgeText, PUBLIC_PLANS_CONTENT_DEFAULTS.badgeText);
    assert.equal(pub.title, PUBLIC_PLANS_CONTENT_DEFAULTS.title);
    assert.equal(pub.description, PUBLIC_PLANS_CONTENT_DEFAULTS.description);
    assert.equal(pub.defaultSection, PUBLIC_PLANS_DEFAULT_SECTION.TRAINING);
    assert.equal(pub.defaultSection, PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK);
    assert.equal(pub.trainingTabLabel, PUBLIC_PLANS_CONTENT_DEFAULTS.trainingTabLabel);
    assert.equal(pub.workTabLabel, PUBLIC_PLANS_CONTENT_DEFAULTS.workTabLabel);
    assert.equal(pub.textsAreCustom, false);
  });

  it("does not write default_plan_catalog when saving public plans content", async () => {
    SETTINGS.set(DEFAULT_PLAN_CATALOG_SETTING_KEY, "page_plans");
    const saved = await svc.setPublicPlansContent({
      badgeText: "شارة جديدة",
      title: "عنوان جديد",
      description: "وصف جديد",
      defaultSection: PUBLIC_PLANS_DEFAULT_SECTION.WORK,
      trainingTabLabel: "تدريب مخصص",
      workTabLabel: "عضوية مخصصة",
    });
    assert.equal(saved.defaultSection, PUBLIC_PLANS_DEFAULT_SECTION.WORK);
    assert.equal(saved.trainingTabLabel, "تدريب مخصص");
    assert.equal(saved.workTabLabel, "عضوية مخصصة");
    assert.equal(saved.textsAreCustom, true);
    assert.equal(SETTINGS.get(DEFAULT_PLAN_CATALOG_SETTING_KEY), "page_plans");
    assert.equal(SETTINGS.get(PUBLIC_PLANS_CONTENT_SETTING_KEYS.DEFAULT_SECTION), "work");
    assert.equal(SETTINGS.get(PUBLIC_PLANS_CONTENT_SETTING_KEYS.TRAINING_TAB_LABEL), "تدريب مخصص");
    assert.equal(SETTINGS.get(PUBLIC_PLANS_CONTENT_SETTING_KEYS.WORK_TAB_LABEL), "عضوية مخصصة");
    assert.equal(SETTINGS.has("default_plan_catalog"), true);
  });

  it("rejects empty main heading", async () => {
    await assert.rejects(
      () =>
        svc.setPublicPlansContent({
          badgeText: "شارة",
          title: "   ",
          description: "وصف",
          defaultSection: "training",
        }),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.publicCode, "PUBLIC_PLANS_TITLE_REQUIRED");
        return true;
      },
    );
    assert.equal(SETTINGS.size, 0);
  });

  it("rejects default section values other than training|work", async () => {
    await assert.rejects(
      () =>
        svc.setPublicPlansContent({
          badgeText: "شارة",
          title: "عنوان",
          description: "وصف",
          defaultSection: "membership",
        }),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.publicCode, "INVALID_PUBLIC_PLANS_DEFAULT_SECTION");
        return true;
      },
    );
    await assert.rejects(() =>
      svc.setPublicPlansContent({
        badgeText: "شارة",
        title: "عنوان",
        description: "وصف",
        defaultSection: "marketplace_plans",
      }),
    );
  });

  it("rejects oversized plain text", async () => {
    await assert.rejects(
      () =>
        svc.setPublicPlansContent({
          badgeText: "x".repeat(PUBLIC_PLANS_CONTENT_MAX_LENGTHS.badgeText + 1),
          title: "عنوان",
          description: "وصف",
          defaultSection: "training",
        }),
      (err) => {
        assert.equal(err.publicCode, "PUBLIC_PLANS_TEXT_TOO_LONG");
        return true;
      },
    );
  });

  it("trims strings and persists training then work", async () => {
    const first = await svc.setPublicPlansContent({
      badgeText: "  شارة  ",
      title: "  عنوان  ",
      description: "  وصف  ",
      defaultSection: "training",
    });
    assert.equal(first.badgeText, "شارة");
    assert.equal(first.defaultSection, "training");

    const second = await svc.setPublicPlansContent({
      badgeText: "شارة",
      title: "عنوان",
      description: "وصف",
      defaultSection: "work",
    });
    assert.equal(second.defaultSection, "work");
    assert.equal(await (await svc.getPublicPlansContent()).defaultSection, "work");
  });

  it("falls back to training when stored section is invalid", async () => {
    SETTINGS.set(PUBLIC_PLANS_CONTENT_SETTING_KEYS.DEFAULT_SECTION, "membership");
    const pub = await svc.getPublicPlansContent();
    assert.equal(pub.defaultSection, "training");
  });
});

describe("public plans content routes and wiring", () => {
  const root = path.join(__dirname, "..");

  function read(rel) {
    return fs.readFileSync(path.join(root, rel), "utf8");
  }

  it("Super Admin GET/PATCH are requireAuth + requireSuperAdmin; public GET is read-safe", () => {
    const admin = read("src/routes/superAdminPublicPlansContentRoutes.js");
    const pub = read("src/routes/publicPlansContentRoutes.js");
    const app = read("src/app.js");
    assert.match(admin, /requireAuth/);
    assert.match(admin, /requireSuperAdmin/);
    assert.match(admin, /router\.get\("\/public-plans-content"/);
    assert.match(admin, /router\.patch\(\s*"\/public-plans-content"/);
    assert.doesNotMatch(admin, /requireAdmin\b/);
    assert.match(pub, /router\.get\("\/public-plans-content"/);
    assert.doesNotMatch(pub, /requireAuth/);
    assert.match(app, /superAdminPublicPlansContentRoutes/);
    assert.match(app, /publicPlansContentRoutes/);
  });

  it("does not merge with default_plan_catalog or change checkout/membership", () => {
    const svc = read("src/services/publicPlansContentService.js");
    const constants = read("src/constants/publicPlansContent.js");
    assert.match(constants, /public_plans_default_section/);
    assert.match(constants, /public_plans_badge_text/);
    assert.match(constants, /public_plans_training_tab_label/);
    assert.match(constants, /public_plans_work_tab_label/);
    assert.doesNotMatch(svc, /DEFAULT_PLAN_CATALOG_SETTING_KEY/);
    assert.doesNotMatch(svc, /setDefaultPlanCatalog/);
    assert.doesNotMatch(svc, /createFreelancerSubscriptionCheckout/);
    assert.doesNotMatch(svc, /Work Token/i);
  });
});
