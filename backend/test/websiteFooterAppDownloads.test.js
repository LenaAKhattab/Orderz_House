/**
 * Footer settings (contact + hours + app downloads) — validation, routes, defaults.
 * Run: node --test test/websiteFooterAppDownloads.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/footer_app_downloads_test_placeholder";

const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const migration128 = path.join(__dirname, "..", "sql", "migrations", "128_footer_app_download_settings.sql");
const migration129 = path.join(__dirname, "..", "sql", "migrations", "129_footer_contact_working_hours_settings.sql");
const migration130 = path.join(__dirname, "..", "sql", "migrations", "130_footer_visibility_settings.sql");
const adminRoutesSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "routes", "superAdminWebsiteRoutes.js"),
  "utf8",
);
const publicRoutesSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "routes", "publicRoutes.js"),
  "utf8",
);
const servicePath = require.resolve("../src/services/websiteFooterAppDownloadsService");
const sectionsPath = path.join(
  __dirname,
  "..",
  "..",
  "frontend",
  "src",
  "constants",
  "superAdminWebsiteSections.js",
);

describe("migrations footer settings", () => {
  it("128 adds app-download columns with production defaults", () => {
    const sql = fs.readFileSync(migration128, "utf8");
    assert.ok(sql.includes("footer_app_download_title_ar"));
    assert.ok(sql.includes("footer_google_play_url"));
    assert.ok(sql.includes("footer_app_store_url"));
    assert.ok(!sql.includes("DROP TABLE"));
  });

  it("129 adds contact and working-hours columns without dropping app columns", () => {
    const sql = fs.readFileSync(migration129, "utf8");
    assert.ok(sql.includes("footer_contact_phone"));
    assert.ok(sql.includes("footer_contact_email"));
    assert.ok(sql.includes("footer_contact_whatsapp"));
    assert.ok(sql.includes("footer_contact_location"));
    assert.ok(sql.includes("footer_working_hours_title"));
    assert.ok(sql.includes("footer_working_hours_text"));
    assert.ok(sql.includes("info@orderzhouse.com"));
    assert.ok(sql.includes("نعمل على مدار الساعة لخدمتك"));
    assert.ok(!sql.includes("DROP COLUMN"));
    assert.ok(!sql.includes("DROP TABLE"));
  });

  it("130 adds visibility booleans with default TRUE and no destructive ops", () => {
    const sql = fs.readFileSync(migration130, "utf8");
    assert.ok(sql.includes("footer_contact_visible"));
    assert.ok(sql.includes("footer_contact_phone_visible"));
    assert.ok(sql.includes("footer_working_hours_visible"));
    assert.ok(sql.includes("footer_app_download_visible"));
    assert.ok(sql.includes("footer_app_store_visible"));
    assert.ok(sql.includes("footer_google_play_visible"));
    assert.ok(sql.includes("BOOLEAN NOT NULL DEFAULT TRUE"));
    assert.ok(!sql.includes("DROP COLUMN"));
    assert.ok(!sql.includes("DROP TABLE"));
  });

  it("131 adds contact-center columns with Arabic defaults and no destructive ops", () => {
    const migration131 = path.join(__dirname, "..", "sql", "migrations", "131_footer_contact_center_settings.sql");
    const sql = fs.readFileSync(migration131, "utf8");
    assert.ok(sql.includes("footer_contact_center_visible"));
    assert.ok(sql.includes("footer_contact_center_helper_text"));
    assert.ok(sql.includes("footer_contact_center_button_text"));
    assert.ok(sql.includes("footer_contact_center_url"));
    assert.ok(sql.includes("للاقتراحات والشكاوى اضغط هنا"));
    assert.ok(sql.includes("مركز التواصل"));
    assert.ok(!sql.includes("DROP COLUMN"));
    assert.ok(!sql.includes("DROP TABLE"));
  });
});

describe("footer routes — auth and mounts", () => {
  it("super-admin footer routes use editWebsiteGuard", () => {
    assert.ok(adminRoutesSrc.includes("editWebsiteGuard"));
    assert.ok(adminRoutesSrc.includes('"/website/footer"'));
    assert.ok(adminRoutesSrc.includes('"/website/footer/contact"'));
    assert.ok(adminRoutesSrc.includes('"/website/footer/working-hours"'));
    assert.ok(adminRoutesSrc.includes('"/website/footer/contact-center"'));
    assert.ok(adminRoutesSrc.includes('"/website/footer-app-downloads"'));
    assert.ok(adminRoutesSrc.includes("updateFooterContactValidators"));
    assert.ok(adminRoutesSrc.includes("updateFooterWorkingHoursValidators"));
    assert.ok(adminRoutesSrc.includes("updateFooterContactCenterValidators"));
    assert.ok(adminRoutesSrc.includes("requirePermission(PERMISSION_KEYS.EDIT_WEBSITE)"));
  });

  it("public routes expose footer settings and app downloads", () => {
    assert.ok(publicRoutesSrc.includes('"/public/footer-settings"'));
    assert.ok(publicRoutesSrc.includes('"/public/footer-app-downloads"'));
  });
});

describe("edit-website hub card structure", () => {
  it("uses footer card and not a top-level app-downloads card", () => {
    const src = fs.readFileSync(sectionsPath, "utf8");
    assert.ok(src.includes('id: "footer"'));
    assert.ok(src.includes("تعديل تذييل الموقع"));
    assert.ok(src.includes("SUPER_ADMIN_FOOTER_SECTIONS"));
    assert.ok(src.includes('id: "contact"'));
    assert.ok(src.includes('id: "working-hours"'));
    assert.ok(src.includes('id: "app-downloads"'));
    assert.ok(src.includes('id: "contact-center"'));
    assert.ok(src.includes("مركز التواصل"));
    assert.ok(!src.includes('id: "footer-app-downloads"'));
  });
});

describe("websiteFooterAppDownloadsService validation", () => {
  beforeEach(() => {
    delete require.cache[servicePath];
  });
  afterEach(() => {
    delete require.cache[servicePath];
  });

  it("exports production fallback defaults", () => {
    const svc = require("../src/services/websiteFooterAppDownloadsService");
    assert.equal(svc.DEFAULTS.titleAr, "تحميل التطبيق");
    assert.equal(svc.CONTACT_DEFAULTS.email, "info@orderzhouse.com");
    assert.equal(svc.WORKING_HOURS_DEFAULTS.title, "ساعات العمل");
    assert.equal(svc.CONTACT_CENTER_DEFAULTS.helperText, "للاقتراحات والشكاوى اضغط هنا");
    assert.equal(svc.CONTACT_CENTER_DEFAULTS.buttonText, "مركز التواصل");
    assert.equal(svc.CONTACT_CENTER_DEFAULTS.url, "/login");
    assert.equal(
      svc.DEFAULTS.googlePlayUrl,
      "https://play.google.com/store/apps/details?id=com.orderzhouse.app",
    );
  });

  it("normalizeContactCenterUrl accepts relative paths and https only", () => {
    const svc = require("../src/services/websiteFooterAppDownloadsService");
    assert.equal(svc.normalizeContactCenterUrl("/login"), "/login");
    assert.equal(
      svc.normalizeContactCenterUrl("/dashboard/freelancer/feedback"),
      "/dashboard/freelancer/feedback",
    );
    assert.equal(
      svc.normalizeContactCenterUrl("https://orderzhouse.com/help"),
      "https://orderzhouse.com/help",
    );
    assert.throws(
      () => svc.normalizeContactCenterUrl("javascript:alert(1)"),
      (err) => err.publicCode === "CONTACT_CENTER_URL_INVALID",
    );
    assert.throws(
      () => svc.normalizeContactCenterUrl("http://insecure.example"),
      (err) => err.publicCode === "CONTACT_CENTER_URL_HTTPS_REQUIRED",
    );
    assert.throws(
      () => svc.normalizeContactCenterUrl("//evil.example"),
      (err) => err.publicCode === "CONTACT_CENTER_URL_INVALID",
    );
  });

  it("normalizeEmail rejects invalid emails", () => {
    const svc = require("../src/services/websiteFooterAppDownloadsService");
    assert.throws(() => svc.normalizeEmail("not-an-email"), (err) => err.publicCode === "EMAIL_INVALID");
    assert.equal(svc.normalizeEmail("  Info@OrderzHouse.com "), "info@orderzhouse.com");
  });

  it("normalizePhoneLike rejects scripts and short values", () => {
    const svc = require("../src/services/websiteFooterAppDownloadsService");
    assert.throws(
      () => svc.normalizePhoneLike("<script>x</script>", "رقم الهاتف"),
      (err) => err.publicCode === "PHONE_INVALID" || err.publicCode === "PHONE_REQUIRED",
    );
    assert.equal(svc.normalizePhoneLike("+971 522857808", "رقم الهاتف"), "+971 522857808");
  });

  it("normalizeStoreHttpsUrl rejects invalid store URLs", () => {
    const svc = require("../src/services/websiteFooterAppDownloadsService");
    const opts = { label: "رابط Google Play", allowedHosts: svc.GOOGLE_PLAY_HOSTS };
    assert.throws(
      () => svc.normalizeStoreHttpsUrl("https://evil.example/x", opts),
      (err) => err.publicCode === "STORE_URL_HOST_NOT_ALLOWED",
    );
    assert.throws(
      () => svc.normalizeStoreHttpsUrl("javascript:alert(1)", opts),
      (err) => err.publicCode === "STORE_URL_INVALID",
    );
  });

  it("sanitizePlainText strips HTML", () => {
    const svc = require("../src/services/websiteFooterAppDownloadsService");
    assert.equal(svc.sanitizePlainText("<b>نعمل</b>", { maxLen: 50 }), "نعمل");
  });
});

describe("websiteFooter settings get/update with mocked pool", () => {
  let poolQuery;

  beforeEach(() => {
    delete require.cache[servicePath];
    const dbPath = require.resolve("../src/config/db");
    delete require.cache[dbPath];
    poolQuery = mock.fn(async () => ({ rows: [] }));
    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: { pool: { query: (...args) => poolQuery(...args) } },
    };
  });

  afterEach(() => {
    delete require.cache[servicePath];
    const dbPath = require.resolve("../src/config/db");
    delete require.cache[dbPath];
    mock.restoreAll();
  });

  it("getFooterSettings returns defaults when no row exists", async () => {
    const svc = require("../src/services/websiteFooterAppDownloadsService");
    const settings = await svc.getFooterSettings();
    assert.equal(settings.contact.email, "info@orderzhouse.com");
    assert.equal(settings.workingHours.title, "ساعات العمل");
    assert.equal(settings.contactCenter.buttonText, "مركز التواصل");
    assert.equal(settings.contactCenter.url, "/login");
    assert.equal(settings.appDownload.titleAr, "تحميل التطبيق");
    assert.equal(settings.contact.visible, true);
    assert.equal(settings.contact.phoneVisible, true);
    assert.equal(settings.workingHours.visible, true);
    assert.equal(settings.contactCenter.visible, true);
    assert.equal(settings.appDownload.visible, true);
    assert.equal(settings.appDownload.appStoreVisible, true);
  });

  it("mapFullSettingsRow defaults missing visibility flags to true", () => {
    const svc = require("../src/services/websiteFooterAppDownloadsService");
    const mapped = svc.mapFullSettingsRow({
      footer_contact_phone: "+971 111",
      footer_contact_email: "a@b.com",
      footer_contact_whatsapp: "+971 222",
      footer_contact_location: "دبي",
      footer_contact_email_visible: false,
      footer_working_hours_title: "ساعات العمل",
      footer_working_hours_text: "نص",
      footer_app_download_title_ar: "تحميل التطبيق",
      footer_app_download_title_en: "Download the app",
      footer_google_play_url: "https://play.google.com/store/apps/details?id=com.orderzhouse.app",
      footer_app_store_url: "https://apps.apple.com/ae/app/orderzhouse/id6762045683",
      footer_app_store_visible: false,
    });
    assert.equal(mapped.contact.visible, true);
    assert.equal(mapped.contact.phoneVisible, true);
    assert.equal(mapped.contact.emailVisible, false);
    assert.equal(mapped.workingHours.visible, true);
    assert.equal(mapped.appDownload.visible, true);
    assert.equal(mapped.appDownload.appStoreVisible, false);
    assert.equal(mapped.appDownload.googlePlayVisible, true);
  });

  it("coalesceBool treats null/undefined as true and preserves false", () => {
    const svc = require("../src/services/websiteFooterAppDownloadsService");
    assert.equal(svc.coalesceBool(undefined, true), true);
    assert.equal(svc.coalesceBool(null, true), true);
    assert.equal(svc.coalesceBool(false, true), false);
    assert.equal(svc.coalesceBool(true, true), true);
  });

  it("updateFooterContact rejects invalid email before write", async () => {
    poolQuery = mock.fn(async () => ({
      rows: [
        {
          footer_contact_phone: "+971 522857808",
          footer_contact_email: "info@orderzhouse.com",
          footer_contact_whatsapp: "+971 522857808",
          footer_contact_location: "الإمارات العربية المتحدة، دبي",
          footer_working_hours_title: "ساعات العمل",
          footer_working_hours_text: "نعمل على مدار الساعة لخدمتك",
          footer_app_download_title_ar: "تحميل التطبيق",
          footer_app_download_title_en: "Download the app",
          footer_google_play_url: "https://play.google.com/store/apps/details?id=com.orderzhouse.app",
          footer_app_store_url: "https://apps.apple.com/ae/app/orderzhouse/id6762045683",
          updated_at: null,
        },
      ],
    }));
    const dbPath = require.resolve("../src/config/db");
    require.cache[dbPath].exports = { pool: { query: (...args) => poolQuery(...args) } };
    delete require.cache[servicePath];
    const svc = require("../src/services/websiteFooterAppDownloadsService");
    await assert.rejects(
      () =>
        svc.updateFooterContact({
          phone: "+971 522857808",
          email: "bad",
          whatsapp: "+971 522857808",
          location: "دبي",
        }),
      (err) => err.publicCode === "EMAIL_INVALID",
    );
  });

  it("updateFooterWorkingHours persists valid patch", async () => {
    let call = 0;
    poolQuery = mock.fn(async (sql) => {
      call += 1;
      if (String(sql).includes("INSERT INTO platform_ui_settings")) {
        return { rows: [] };
      }
      return {
        rows: [
          {
            footer_contact_phone: "+971 522857808",
            footer_contact_email: "info@orderzhouse.com",
            footer_contact_whatsapp: "+971 522857808",
            footer_contact_location: "الإمارات العربية المتحدة، دبي",
            footer_working_hours_title: call === 1 ? "ساعات العمل" : "أوقات الدعم",
            footer_working_hours_text: call === 1 ? "نعمل على مدار الساعة لخدمتك" : "متاحون دائماً",
            footer_app_download_title_ar: "تحميل التطبيق",
            footer_app_download_title_en: "Download the app",
            footer_google_play_url: "https://play.google.com/store/apps/details?id=com.orderzhouse.app",
            footer_app_store_url: "https://apps.apple.com/ae/app/orderzhouse/id6762045683",
            updated_at: "2026-08-08T12:00:00.000Z",
          },
        ],
      };
    });
    const dbPath = require.resolve("../src/config/db");
    require.cache[dbPath].exports = { pool: { query: (...args) => poolQuery(...args) } };
    delete require.cache[servicePath];
    const svc = require("../src/services/websiteFooterAppDownloadsService");
    const hours = await svc.updateFooterWorkingHours({
      title: "أوقات الدعم",
      text: "متاحون دائماً",
    });
    assert.equal(hours.title, "أوقات الدعم");
    assert.equal(hours.text, "متاحون دائماً");
  });
});
