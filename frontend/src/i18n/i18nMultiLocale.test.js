import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  DEFAULT_LOCALE,
  LOCALE_META,
  SUPPORTED_LOCALES,
  applyI18nPreviewQuery,
  getLocaleDirection,
  getSelectableLocales,
  isSelectableLocale,
  isSupportedLocale,
  readStoredLocale,
} from "./localePreference.js";
import { RELEASED_LOCALES } from "./localeRelease.js";
import { fallbackChainFor, resolveTranslation, createTranslator, getMissingTranslationLog, clearMissingTranslationLog } from "./resolveTranslation.js";
import { intlTagOrDefault, pickIntlTag, formatNumberLocale } from "./intlLocale.js";
import { tPlural } from "./plural.js";
import {
  localizeSystemText,
  normalizeSystemContentSource,
  setSystemContentTranslations,
  systemContentHash,
  translateSystemContent,
} from "./systemContent.js";
import { getLocalizedField } from "../lib/i18n/getLocalizedField.js";
import { getLocalizedMarketplaceOrderTitle } from "../lib/i18n/getLocalizedMarketplaceOrderText.js";
import { presentServerMessage } from "./presentServerMessage.js";
import { mergeLocaleNamespaces, resources } from "./resources.js";
import { ensureLocaleLoaded } from "./loadLocaleBundle.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe("locale registry and release gate", () => {
  it("supports exactly ar, en, de, nl, ro with native names and Arabic as the only RTL locale", () => {
    assert.deepEqual([...SUPPORTED_LOCALES], ["ar", "en", "de", "nl", "ro"]);
    assert.equal(DEFAULT_LOCALE, "ar");
    assert.deepEqual(
      SUPPORTED_LOCALES.map((l) => LOCALE_META[l].nativeName),
      ["العربية", "English", "Deutsch", "Nederlands", "Română"],
    );
    assert.equal(getLocaleDirection("ar"), "rtl");
    for (const l of ["en", "de", "nl", "ro"]) assert.equal(getLocaleDirection(l), "ltr");
    assert.equal(getLocaleDirection("../../etc"), "rtl", "unknown values follow the default locale");
  });

  it("treats locale input as untrusted (allowlist only)", () => {
    for (const bad of ["fr", "de-DE", "../de", "__proto__", "constructor", "", null, undefined, "de\u0000"]) {
      assert.equal(isSupportedLocale(bad), false, String(bad));
    }
  });

  it("exposes unreleased locales only through the internal preview", () => {
    const storage = memStorage();
    const unreleased = SUPPORTED_LOCALES.filter((l) => !RELEASED_LOCALES.includes(l));
    for (const l of unreleased) assert.equal(isSelectableLocale(l, storage), false);
    assert.deepEqual(getSelectableLocales(storage), [...RELEASED_LOCALES]);
    applyI18nPreviewQuery("?i18n_preview=1", storage);
    assert.deepEqual(getSelectableLocales(storage), [...SUPPORTED_LOCALES]);
    applyI18nPreviewQuery("?i18n_preview=0", storage);
    assert.deepEqual(getSelectableLocales(storage), [...RELEASED_LOCALES]);
  });

  it("persists the explicit choice and never lets an unselectable stored value win", () => {
    assert.equal(readStoredLocale(memStorage({ "orderzhouse.locale": "en" })), "en");
    assert.equal(readStoredLocale(memStorage({ "orderzhouse.locale": "xx", oh_locale: "en" })), "ar");
    const preview = memStorage({ "orderzhouse.locale": "ro", "orderzhouse.i18nPreview": "1" });
    assert.equal(readStoredLocale(preview), "ro");
  });

  it("index.html pre-paint script mirrors RELEASED / SUPPORTED locales", () => {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const released = JSON.parse(/var RELEASED = (\[[^\]]*\])/.exec(html)[1]);
    const supported = JSON.parse(/var SUPPORTED = (\[[^\]]*\])/.exec(html)[1]);
    assert.deepEqual(released, [...RELEASED_LOCALES]);
    assert.deepEqual(supported, [...SUPPORTED_LOCALES]);
    assert.match(html, /root\.dir = locale === "ar" \? "rtl" : "ltr"/);
  });

  it("rejects lazy bundles outside the allowlist", async () => {
    await assert.rejects(() => ensureLocaleLoaded("fr"));
    await assert.rejects(() => ensureLocaleLoaded("../en"));
  });
});

describe("translation resolution", () => {
  it("uses en → ar as the emergency chain for new locales and records the miss", () => {
    assert.deepEqual(fallbackChainFor("de"), ["en", "ar"]);
    assert.deepEqual(fallbackChainFor("en"), ["ar"]);
    assert.deepEqual(fallbackChainFor("ar"), []);
    clearMissingTranslationLog();
    const all = { ar: { common: { save: "حفظ" } }, en: { common: { save: "Save" } }, de: { common: {} } };
    assert.equal(resolveTranslation(all.de, "common.save", "ar", all, "de"), "Save");
    assert.deepEqual(getMissingTranslationLog().map((m) => m.key), ["common.save"]);
  });

  it("never resolves a not-yet-loaded Latin locale against Arabic", () => {
    const all = { ar: { common: { x: "عربي" } }, en: { common: { x: "English" } } };
    assert.equal(createTranslator("nl", all, "ar")("common.x"), "English");
  });
});

describe("formatting", () => {
  it("keeps the historical Arabic / English tags and uses canonical tags for new locales", () => {
    assert.equal(pickIntlTag("ar", { ar: "ar-JO-u-nu-latn", en: "en-GB" }), "ar-JO-u-nu-latn");
    assert.equal(pickIntlTag("en", { ar: "ar-JO-u-nu-latn", en: "en-GB" }), "en-GB");
    assert.equal(pickIntlTag("de", { ar: "ar-JO-u-nu-latn", en: "en-GB" }), "de-DE");
    assert.equal(pickIntlTag("nl"), "nl-NL");
    assert.equal(pickIntlTag("ro"), "ro-RO");
    assert.equal(intlTagOrDefault("ar"), undefined);
    assert.equal(intlTagOrDefault("en"), undefined);
    assert.equal(intlTagOrDefault("de"), "de-DE");
  });

  it("formats numbers per locale without changing the value (JOD stays JOD)", () => {
    assert.equal(formatNumberLocale(1234.56, "de", { minimumFractionDigits: 2 }), "1.234,56");
    assert.equal(formatNumberLocale(1234.56, "nl", { minimumFractionDigits: 2 }), "1.234,56");
    assert.equal(formatNumberLocale(1234.56, "ro", { minimumFractionDigits: 2 }), "1.234,56");
    assert.equal(formatNumberLocale(1234.56, "en", { minimumFractionDigits: 2 }), "1,234.56");
    const jod = new Intl.NumberFormat(pickIntlTag("de"), { style: "currency", currency: "JOD" }).format(12.5);
    assert.match(jod, /12,500\s?JOD/);
  });

  it("selects plural forms with Intl rules (Romanian has three)", () => {
    const t = (k, v) => `${k}:${v.count}`;
    assert.equal(tPlural(t, "en", "x", 1), "x:1");
    assert.equal(tPlural(t, "de", "x", 2), "x_plural:2");
    assert.equal(tPlural(t, "nl", "x", 0), "x_plural:0");
    assert.equal(tPlural(t, "ro", "x", 1), "x:1");
    assert.equal(tPlural(t, "ro", "x", 5), "x_plural:5");
    assert.equal(tPlural(t, "ro", "x", 25), "x_plural_other:25");
    assert.equal(tPlural((k) => k, "ro", "x", 25), "x_plural", "falls back to _plural when _plural_other is missing");
    assert.equal(tPlural(t, "ar", "x", 2), "x_plural:2");
  });
});

describe("system DB content (translation memory)", () => {
  it("hashes like the backend (shared vectors)", () => {
    assert.equal(normalizeSystemContentSource("  a\r\nb \r "), "a\nb");
    assert.equal(systemContentHash("Content writing"), systemContentHash(" Content writing\r\n"));
    assert.match(systemContentHash("x"), /^[0-9a-f]{14}$/);
    // Shared vectors — identical assertions live in backend/test/systemContentTranslations.test.js.
    assert.equal(systemContentHash("Terms & Conditions"), "101fe63019a1cd");
    assert.equal(systemContentHash("كتابة المحتوى"), "0d6cb52ed93f29");
    assert.equal(systemContentHash("Română: ș ț ă"), "1ee8de708b8d21");
    assert.equal(systemContentHash("line1\nline2"), "07dbadf4204ab2");
  });

  it("resolves bilingual fields for every locale and keeps AR/EN unchanged", () => {
    const row = { name: "تصميم", name_en: "Design" };
    setSystemContentTranslations("de", { [systemContentHash("Design")]: "Gestaltung" });
    assert.equal(getLocalizedField(row, "name", "ar"), "تصميم");
    assert.equal(getLocalizedField(row, "name", "en"), "Design");
    assert.equal(getLocalizedField(row, "name", "de"), "Gestaltung");
    assert.equal(localizeSystemText("de", { ar: "تصميم", en: "Design" }), "Gestaltung");
    assert.equal(translateSystemContent("Unknown text", "de"), null);
  });

  it("never translates user-generated order content", () => {
    const order = { title: "طلب كتابة مقال عن السفر", title_en: "" };
    assert.equal(getLocalizedMarketplaceOrderTitle(order, "de"), "طلب كتابة مقال عن السفر");
    assert.equal(getLocalizedMarketplaceOrderTitle(order, "ro"), "طلب كتابة مقال عن السفر");
  });
});

describe("backend errors in new locales", () => {
  it("never shows raw backend text (Arabic or English); codes map to catalog text", () => {
    const de = JSON.parse(readFileSync(join(HERE, "../locales/en/apiErrors.json"), "utf8"));
    const t = (key) => {
      const parts = key.split(".");
      if (parts[0] !== "apiErrors") return key;
      let cur = de;
      for (const p of parts.slice(1)) cur = cur?.[p];
      return typeof cur === "string" ? `DE:${cur}` : key;
    };
    assert.equal(presentServerMessage({ message: "Internal detail", code: "UNMAPPED_X" }, t, "de"), `DE:${de.generic}`);
    assert.equal(presentServerMessage({ message: "تعذر", code: "COURSE_NOT_FOUND" }, t, "nl"), `DE:${de.codes.COURSE_NOT_FOUND}`);
    assert.equal(presentServerMessage({ message: "Lokalisiert", localized: true }, t, "ro"), "Lokalisiert");
    assert.equal(presentServerMessage({ message: "رسالة" }, (k) => k, "ar"), "رسالة", "Arabic unchanged");
  });

  it("every error catalog key exists in Arabic and English", () => {
    const en = JSON.parse(readFileSync(join(HERE, "../locales/en/apiErrors.json"), "utf8"));
    const ar = JSON.parse(readFileSync(join(HERE, "../locales/ar/apiErrors.json"), "utf8"));
    assert.deepEqual(Object.keys(ar.codes).sort(), Object.keys(en.codes).sort());
    assert.deepEqual(Object.keys(ar.status).sort(), Object.keys(en.status).sort());
  });
});

describe("notifications in new locales", () => {
  it("presents type-catalog text instead of the stored Arabic row", async () => {
    const { getNotificationText } = await import("../utils/notificationDisplay.js");
    mergeLocaleNamespaces({ de: { notificationTypes: { fallback: { wallet: "Zahlungsupdate" }, types: { order_pool_summary: { title: "Neue Aufträge", message: "Verfügbar: {{visibleCount}}" } } } } });
    const row = { type: "order.pool.summary", title: "تمت إضافة", message: "يتوفر", metadata: { visibleCount: "7" } };
    assert.deepEqual(getNotificationText(row, "de"), { title: "Neue Aufträge", message: "Verfügbar: 7" });
    assert.deepEqual(getNotificationText(row, "ar"), { title: "تمت إضافة", message: "يتوفر" });
    assert.equal(getNotificationText({ type: "payment.mystery" }, "de").title, "Zahlungsupdate");
    delete resources.de;
  });
});

describe("language selector", () => {
  it("lists endonyms from the registry, marks the current one, and uses no flags", () => {
    const src = readFileSync(join(HERE, "../components/layout/LanguageSwitcher.jsx"), "utf8");
    assert.match(src, /LOCALE_META\[code\]/);
    assert.match(src, /role="menuitemradio"/);
    assert.match(src, /aria-checked=\{active\}/);
    assert.match(src, /insetInlineEnd/);
    assert.doesNotMatch(src, /[\u{1F1E6}-\u{1F1FF}]/u, "no regional-indicator flag emoji");
  });
});
