import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { DEFAULT_LOCALE, getLocaleDirection, isSupportedLocale, readStoredLocale } from "./localePreference.js";
import { resolveTranslation } from "./resolveTranslation.js";

const localesRoot = join(dirname(fileURLToPath(import.meta.url)), "../locales");

function collectKeys(value, prefix = "") {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return [];
  const keys = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child != null && typeof child === "object" && !Array.isArray(child)) {
      keys.push(...collectKeys(child, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe("locale defaults", () => {
  it("defaults to Arabic and ignores an unsupported stored value", () => {
    assert.equal(DEFAULT_LOCALE, "ar");
    assert.equal(getLocaleDirection("ar"), "rtl");
    assert.equal(getLocaleDirection("en"), "ltr");
    assert.equal(getLocaleDirection("fr"), "rtl");
    const storage = { getItem: () => "de" };
    assert.equal(readStoredLocale(storage), "ar");
  });

  it("reads the saved preference before the legacy key", () => {
    const storage = {
      getItem(key) {
        if (key === "orderzhouse.locale") return "en";
        if (key === "oh_locale") return "ar";
        return null;
      },
    };
    assert.equal(readStoredLocale(storage), "en");
    assert.equal(isSupportedLocale("en"), true);
    assert.equal(isSupportedLocale("fr"), false);
  });

  it("falls back to Arabic when an English key is missing", () => {
    const resources = {
      ar: { common: { save: "حفظ" } },
      en: { common: {} },
    };
    assert.equal(resolveTranslation(resources.en, "common.save", "ar", resources), "حفظ");
  });
});

describe("translation key parity", () => {
  it("keeps Arabic and English namespace keys aligned", () => {
    const arDir = join(localesRoot, "ar");
    const enDir = join(localesRoot, "en");
    const arFiles = readdirSync(arDir).filter((name) => name.endsWith(".json")).sort();
    const enFiles = readdirSync(enDir).filter((name) => name.endsWith(".json")).sort();
    assert.deepEqual(enFiles, arFiles);
    for (const file of arFiles) {
      const arKeys = collectKeys(JSON.parse(readFileSync(join(arDir, file), "utf8"))).sort();
      const enKeys = collectKeys(JSON.parse(readFileSync(join(enDir, file), "utf8"))).sort();
      assert.deepEqual(enKeys, arKeys, file);
    }
  });
});
