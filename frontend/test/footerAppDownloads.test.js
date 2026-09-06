/**
 * Footer CMS constants / visibility / Contact Center navigation.
 * Run: node --test test/footerAppDownloads.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FOOTER_APP_DOWNLOAD_FALLBACKS,
  mergeFooterAppDownloads,
  pickFooterAppDownloadTitle,
  shouldRenderFooterAppDownload,
} from "../src/constants/footerAppDownloads.js";
import {
  FOOTER_CONTACT_CENTER_FALLBACKS,
  FOOTER_CONTACT_FALLBACKS,
  FOOTER_WORKING_HOURS_FALLBACKS,
  buildFooterTelHref,
  buildFooterWhatsAppHref,
  getVisibleFooterContactItems,
  mergeFooterSettings,
  resolveFooterContactCenterDestination,
  shouldRenderFooterContactCenter,
  shouldRenderFooterContactPanel,
  shouldRenderFooterWorkingHours,
} from "../src/constants/footerSettings.js";
import {
  SUPER_ADMIN_FOOTER_SECTIONS,
  SUPER_ADMIN_WEBSITE_SECTIONS,
} from "../src/constants/superAdminWebsiteSections.js";

describe("footerAppDownloads constants", () => {
  it("keeps production fallback URLs and titles", () => {
    assert.equal(FOOTER_APP_DOWNLOAD_FALLBACKS.titleAr, "تحميل التطبيق");
    assert.ok(FOOTER_APP_DOWNLOAD_FALLBACKS.googlePlayUrl.includes("play.google.com"));
    assert.ok(FOOTER_APP_DOWNLOAD_FALLBACKS.appStoreUrl.includes("apps.apple.com"));
    assert.equal(FOOTER_APP_DOWNLOAD_FALLBACKS.visible, true);
  });

  it("mergeFooterAppDownloads preserves valid CMS values and fills blanks", () => {
    const merged = mergeFooterAppDownloads({
      titleAr: "حمّل الآن",
      titleEn: "",
      googlePlayUrl: "https://play.google.com/store/apps/details?id=custom",
      appStoreUrl: null,
      appStoreVisible: false,
    });
    assert.equal(merged.titleAr, "حمّل الآن");
    assert.equal(merged.appStoreUrl, FOOTER_APP_DOWNLOAD_FALLBACKS.appStoreUrl);
    assert.equal(merged.visible, true);
    assert.equal(merged.appStoreVisible, false);
    assert.equal(merged.googlePlayVisible, true);
  });

  it("pickFooterAppDownloadTitle respects locale", () => {
    const settings = { titleAr: "تحميل التطبيق", titleEn: "Download the app" };
    assert.equal(pickFooterAppDownloadTitle(settings, "ar"), "تحميل التطبيق");
    assert.equal(pickFooterAppDownloadTitle(settings, "en"), "Download the app");
  });

  it("shouldRenderFooterAppDownload hides empty or disabled sections", () => {
    assert.equal(
      shouldRenderFooterAppDownload({ visible: true, appStoreVisible: true, googlePlayVisible: false }),
      true,
    );
    assert.equal(
      shouldRenderFooterAppDownload({ visible: true, appStoreVisible: false, googlePlayVisible: false }),
      false,
    );
    assert.equal(
      shouldRenderFooterAppDownload({ visible: false, appStoreVisible: true, googlePlayVisible: true }),
      false,
    );
  });
});

describe("footerSettings merge and hrefs", () => {
  it("mergeFooterSettings fills contact and hours defaults", () => {
    const merged = mergeFooterSettings({
      contact: { phone: "+971 111", email: "", whatsapp: "+971 222", location: "دبي", emailVisible: false },
      workingHours: { title: "", text: "نص مخصص" },
      appDownload: { titleAr: "تحميل التطبيق" },
    });
    assert.equal(merged.contact.phone, "+971 111");
    assert.equal(merged.contact.email, FOOTER_CONTACT_FALLBACKS.email);
    assert.equal(merged.contact.location, "دبي");
    assert.equal(merged.contact.visible, true);
    assert.equal(merged.contact.emailVisible, false);
    assert.equal(merged.contact.phoneVisible, true);
    assert.equal(merged.workingHours.title, FOOTER_WORKING_HOURS_FALLBACKS.title);
    assert.equal(merged.workingHours.text, "نص مخصص");
    assert.equal(merged.workingHours.visible, true);
    assert.equal(merged.contactCenter.helperText, FOOTER_CONTACT_CENTER_FALLBACKS.helperText);
    assert.equal(merged.contactCenter.buttonText, FOOTER_CONTACT_CENTER_FALLBACKS.buttonText);
    assert.equal(merged.contactCenter.visible, true);
    assert.equal(merged.appDownload.googlePlayUrl, FOOTER_APP_DOWNLOAD_FALLBACKS.googlePlayUrl);
  });

  it("remaps legacy contact-center helper copy to the cleaner default", () => {
    const merged = mergeFooterSettings({
      contactCenter: { helperText: "للاقتراحات والشكاوى اضغط هنا" },
    });
    assert.equal(merged.contactCenter.helperText, "للاقتراحات والشكاوى");
    assert.equal(FOOTER_CONTACT_CENTER_FALLBACKS.helperText, "للاقتراحات والشكاوى");
  });

  it("visibility helpers respect section and element flags", () => {
    const contact = {
      visible: true,
      phoneVisible: true,
      emailVisible: false,
      whatsappVisible: true,
      locationVisible: false,
    };
    assert.deepEqual(getVisibleFooterContactItems(contact), ["phone", "whatsapp"]);
    assert.deepEqual(getVisibleFooterContactItems({ ...contact, visible: false }), []);

    assert.equal(shouldRenderFooterWorkingHours({ visible: true, titleVisible: false, textVisible: true }), true);
    assert.equal(shouldRenderFooterWorkingHours({ visible: true, titleVisible: false, textVisible: false }), false);
    assert.equal(shouldRenderFooterWorkingHours({ visible: false, titleVisible: true, textVisible: true }), false);

    assert.equal(
      shouldRenderFooterContactCenter({
        visible: true,
        helperTextVisible: false,
        buttonVisible: true,
      }),
      true,
    );
    assert.equal(
      shouldRenderFooterContactCenter({
        visible: true,
        helperTextVisible: false,
        buttonVisible: false,
      }),
      false,
    );
    assert.equal(
      shouldRenderFooterContactCenter({
        visible: false,
        helperTextVisible: true,
        buttonVisible: true,
      }),
      false,
    );

    assert.equal(
      shouldRenderFooterContactPanel(
        { visible: false, phoneVisible: true, emailVisible: true, whatsappVisible: true, locationVisible: true },
        { visible: true, titleVisible: true, textVisible: true },
        { visible: false, helperTextVisible: true, buttonVisible: true },
      ),
      true,
    );
    assert.equal(
      shouldRenderFooterContactPanel(
        { visible: false, phoneVisible: true, emailVisible: true, whatsappVisible: true, locationVisible: true },
        { visible: false, titleVisible: true, textVisible: true },
        { visible: true, helperTextVisible: true, buttonVisible: false },
      ),
      true,
    );
    assert.equal(
      shouldRenderFooterContactPanel(
        { visible: false, phoneVisible: true, emailVisible: true, whatsappVisible: true, locationVisible: true },
        { visible: false, titleVisible: true, textVisible: true },
        { visible: false, helperTextVisible: true, buttonVisible: true },
      ),
      false,
    );
  });

  it("resolves contact-center destination with role-aware Problems & Suggestions workflow", () => {
    assert.deepEqual(resolveFooterContactCenterDestination(null, true), { kind: "pending" });
    assert.deepEqual(resolveFooterContactCenterDestination({ role: "freelancer" }, false), {
      kind: "internal",
      to: "/dashboard/freelancer/feedback",
    });
    assert.deepEqual(resolveFooterContactCenterDestination({ role: "client" }, false), {
      kind: "internal",
      to: "/dashboard/client/feedback",
    });
    assert.deepEqual(resolveFooterContactCenterDestination({ primaryRole: "super_admin" }, false), {
      kind: "internal",
      to: "/dashboard/super-admin/feedback",
    });
    assert.deepEqual(resolveFooterContactCenterDestination(null, false), {
      kind: "login",
      to: "/login",
      state: { problemsSuggestions: true },
    });
    assert.equal(resolveFooterContactCenterDestination({ role: "financial_user" }, false).kind, "dashboard");
  });

  it("builds tel and whatsapp hrefs from display numbers", () => {
    assert.equal(buildFooterTelHref("+971 522857808"), "tel:+971522857808");
    assert.equal(buildFooterWhatsAppHref("+971 522857808"), "https://wa.me/971522857808");
  });
});

describe("edit-website footer hub cards", () => {
  it("top-level list has footer card and no standalone app card", () => {
    const ids = SUPER_ADMIN_WEBSITE_SECTIONS.map((s) => s.id);
    assert.ok(ids.includes("footer"));
    assert.equal(ids.includes("footer-app-downloads"), false);
    assert.equal(SUPER_ADMIN_WEBSITE_SECTIONS.find((s) => s.id === "footer")?.title, "تعديل تذييل الموقع");
  });

  it("footer editor exposes four subsections including contact center", () => {
    const ids = SUPER_ADMIN_FOOTER_SECTIONS.map((s) => s.id);
    assert.deepEqual(ids, ["contact", "working-hours", "app-downloads", "contact-center"]);
    assert.equal(SUPER_ADMIN_FOOTER_SECTIONS.find((s) => s.id === "contact-center")?.title, "مركز التواصل");
  });
});
