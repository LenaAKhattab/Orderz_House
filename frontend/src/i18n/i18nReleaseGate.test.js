import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { RELEASED_LOCALES } from "./localeRelease.js";
import { SUPPORTED_LOCALES } from "./localePreference.js";
import { checkLocales } from "../../scripts/i18n/checkI18n.mjs";
import { LAZY_LOCALES, renderIndex } from "../../scripts/i18n/generateLocaleIndex.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Release gate: a locale listed in RELEASED_LOCALES must be 100 % clean (no missing / empty / placeholder /
 * markup / malformed / key-as-value / Arabic / cedilla / unreviewed-identical value). Unreleased locales are only
 * reachable through the internal preview, so they may be incomplete during development.
 */
describe("i18n release gate", () => {
  it("Arabic and English stay in key parity", () => {
    const report = checkLocales({ locales: [] });
    assert.equal(report.canonical.arParity, true);
  });

  it("every released new locale is 100% clean", () => {
    const released = RELEASED_LOCALES.filter((l) => l !== "ar" && l !== "en");
    if (!released.length) return;
    const report = checkLocales({ locales: released });
    for (const loc of released) {
      const L = report.locales[loc];
      const problems = Object.fromEntries(Object.entries(L.issues).filter(([, v]) => v.length).map(([k, v]) => [k, v.slice(0, 5)]));
      assert.equal(L.clean, true, `${loc} is released but not clean: ${JSON.stringify(problems)}`);
      assert.equal(L.coveragePct, 100);
    }
  });

  it("released locales are a subset of supported locales and include ar / en", () => {
    for (const l of RELEASED_LOCALES) assert.ok(SUPPORTED_LOCALES.includes(l), l);
    assert.ok(RELEASED_LOCALES.includes("ar"));
    assert.ok(RELEASED_LOCALES.includes("en"));
  });

  it("lazy locale index files list every namespace (regenerate with scripts/i18n/generateLocaleIndex.mjs)", () => {
    for (const loc of LAZY_LOCALES) {
      const cur = readFileSync(join(HERE, `../locales/${loc}/index.js`), "utf8").replace(/\r\n/g, "\n");
      assert.equal(cur, renderIndex(loc), `src/locales/${loc}/index.js is stale`);
    }
  });
});
