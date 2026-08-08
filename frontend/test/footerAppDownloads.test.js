/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  FOOTER_APP_DOWNLOAD_FALLBACKS,
  mergeFooterAppDownloads,
  pickFooterAppDownloadTitle,
  shouldRenderFooterAppDownload,
} from "../src/constants/footerAppDownloads";
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
} from "../src/constants/footerSettings";
import {
  SUPER_ADMIN_FOOTER_SECTIONS,
  SUPER_ADMIN_WEBSITE_SECTIONS,
} from "../src/constants/superAdminWebsiteSections";

describe("footerAppDownloads constants", () => {
  it("keeps production fallback URLs and titles", () => {
    expect(FOOTER_APP_DOWNLOAD_FALLBACKS.titleAr).toBe("تحميل التطبيق");
    expect(FOOTER_APP_DOWNLOAD_FALLBACKS.googlePlayUrl).toContain("play.google.com");
    expect(FOOTER_APP_DOWNLOAD_FALLBACKS.appStoreUrl).toContain("apps.apple.com");
    expect(FOOTER_APP_DOWNLOAD_FALLBACKS.visible).toBe(true);
  });

  it("mergeFooterAppDownloads preserves valid CMS values and fills blanks", () => {
    const merged = mergeFooterAppDownloads({
      titleAr: "حمّل الآن",
      titleEn: "",
      googlePlayUrl: "https://play.google.com/store/apps/details?id=custom",
      appStoreUrl: null,
      appStoreVisible: false,
    });
    expect(merged.titleAr).toBe("حمّل الآن");
    expect(merged.appStoreUrl).toBe(FOOTER_APP_DOWNLOAD_FALLBACKS.appStoreUrl);
    expect(merged.visible).toBe(true);
    expect(merged.appStoreVisible).toBe(false);
    expect(merged.googlePlayVisible).toBe(true);
  });

  it("pickFooterAppDownloadTitle respects locale", () => {
    const settings = { titleAr: "تحميل التطبيق", titleEn: "Download the app" };
    expect(pickFooterAppDownloadTitle(settings, "ar")).toBe("تحميل التطبيق");
    expect(pickFooterAppDownloadTitle(settings, "en")).toBe("Download the app");
  });

  it("shouldRenderFooterAppDownload hides empty or disabled sections", () => {
    expect(shouldRenderFooterAppDownload({ visible: true, appStoreVisible: true, googlePlayVisible: false })).toBe(
      true,
    );
    expect(shouldRenderFooterAppDownload({ visible: true, appStoreVisible: false, googlePlayVisible: false })).toBe(
      false,
    );
    expect(shouldRenderFooterAppDownload({ visible: false, appStoreVisible: true, googlePlayVisible: true })).toBe(
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
    expect(merged.contact.phone).toBe("+971 111");
    expect(merged.contact.email).toBe(FOOTER_CONTACT_FALLBACKS.email);
    expect(merged.contact.location).toBe("دبي");
    expect(merged.contact.visible).toBe(true);
    expect(merged.contact.emailVisible).toBe(false);
    expect(merged.contact.phoneVisible).toBe(true);
    expect(merged.workingHours.title).toBe(FOOTER_WORKING_HOURS_FALLBACKS.title);
    expect(merged.workingHours.text).toBe("نص مخصص");
    expect(merged.workingHours.visible).toBe(true);
    expect(merged.contactCenter.helperText).toBe(FOOTER_CONTACT_CENTER_FALLBACKS.helperText);
    expect(merged.contactCenter.buttonText).toBe(FOOTER_CONTACT_CENTER_FALLBACKS.buttonText);
    expect(merged.contactCenter.visible).toBe(true);
    expect(merged.appDownload.googlePlayUrl).toBe(FOOTER_APP_DOWNLOAD_FALLBACKS.googlePlayUrl);
  });

  it("remaps legacy contact-center helper copy to the cleaner default", () => {
    const merged = mergeFooterSettings({
      contactCenter: { helperText: "للاقتراحات والشكاوى اضغط هنا" },
    });
    expect(merged.contactCenter.helperText).toBe("للاقتراحات والشكاوى");
    expect(FOOTER_CONTACT_CENTER_FALLBACKS.helperText).toBe("للاقتراحات والشكاوى");
  });

  it("visibility helpers respect section and element flags", () => {
    const contact = {
      visible: true,
      phoneVisible: true,
      emailVisible: false,
      whatsappVisible: true,
      locationVisible: false,
    };
    expect(getVisibleFooterContactItems(contact)).toEqual(["phone", "whatsapp"]);
    expect(getVisibleFooterContactItems({ ...contact, visible: false })).toEqual([]);

    expect(shouldRenderFooterWorkingHours({ visible: true, titleVisible: false, textVisible: true })).toBe(true);
    expect(shouldRenderFooterWorkingHours({ visible: true, titleVisible: false, textVisible: false })).toBe(false);
    expect(shouldRenderFooterWorkingHours({ visible: false, titleVisible: true, textVisible: true })).toBe(false);

    expect(
      shouldRenderFooterContactCenter({
        visible: true,
        helperTextVisible: false,
        buttonVisible: true,
      }),
    ).toBe(true);
    expect(
      shouldRenderFooterContactCenter({
        visible: true,
        helperTextVisible: false,
        buttonVisible: false,
      }),
    ).toBe(false);
    expect(
      shouldRenderFooterContactCenter({
        visible: false,
        helperTextVisible: true,
        buttonVisible: true,
      }),
    ).toBe(false);

    expect(
      shouldRenderFooterContactPanel(
        { visible: false, phoneVisible: true, emailVisible: true, whatsappVisible: true, locationVisible: true },
        { visible: true, titleVisible: true, textVisible: true },
        { visible: false, helperTextVisible: true, buttonVisible: true },
      ),
    ).toBe(true);
    expect(
      shouldRenderFooterContactPanel(
        { visible: false, phoneVisible: true, emailVisible: true, whatsappVisible: true, locationVisible: true },
        { visible: false, titleVisible: true, textVisible: true },
        { visible: true, helperTextVisible: true, buttonVisible: false },
      ),
    ).toBe(true);
    expect(
      shouldRenderFooterContactPanel(
        { visible: false, phoneVisible: true, emailVisible: true, whatsappVisible: true, locationVisible: true },
        { visible: false, titleVisible: true, textVisible: true },
        { visible: false, helperTextVisible: true, buttonVisible: true },
      ),
    ).toBe(false);
  });

  it("resolves contact-center destination with role-aware Problems & Suggestions workflow", () => {
    expect(resolveFooterContactCenterDestination(null, true)).toEqual({ kind: "pending" });
    expect(resolveFooterContactCenterDestination({ role: "freelancer" }, false)).toEqual({
      kind: "internal",
      to: "/dashboard/freelancer/feedback",
    });
    expect(resolveFooterContactCenterDestination({ role: "client" }, false)).toEqual({
      kind: "internal",
      to: "/dashboard/client/feedback",
    });
    expect(resolveFooterContactCenterDestination({ primaryRole: "super_admin" }, false)).toEqual({
      kind: "internal",
      to: "/dashboard/super-admin/feedback",
    });
    expect(resolveFooterContactCenterDestination(null, false)).toEqual({
      kind: "login",
      to: "/login",
      state: { problemsSuggestions: true },
    });
    expect(resolveFooterContactCenterDestination({ role: "financial_user" }, false).kind).toBe("dashboard");
  });

  it("builds tel and whatsapp hrefs from display numbers", () => {
    expect(buildFooterTelHref("+971 522857808")).toBe("tel:+971522857808");
    expect(buildFooterWhatsAppHref("+971 522857808")).toBe("https://wa.me/971522857808");
  });
});

describe("edit-website footer hub cards", () => {
  it("top-level list has footer card and no standalone app card", () => {
    const ids = SUPER_ADMIN_WEBSITE_SECTIONS.map((s) => s.id);
    expect(ids).toContain("footer");
    expect(ids).not.toContain("footer-app-downloads");
    expect(SUPER_ADMIN_WEBSITE_SECTIONS.find((s) => s.id === "footer")?.title).toBe("تعديل تذييل الموقع");
  });

  it("footer editor exposes four subsections including contact center", () => {
    const ids = SUPER_ADMIN_FOOTER_SECTIONS.map((s) => s.id);
    expect(ids).toEqual(["contact", "working-hours", "app-downloads", "contact-center"]);
    expect(SUPER_ADMIN_FOOTER_SECTIONS.find((s) => s.id === "contact-center")?.title).toBe("مركز التواصل");
  });
});
