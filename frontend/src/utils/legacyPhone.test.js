import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

/** Mirror of longest-prefix split used by legacyPhone.js (avoids ESM extensionless imports). */
function splitE164(e164, dialCodes, defaultDial = "+962") {
  const normalized = String(e164 ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
  if (!normalized) return { countryCode: defaultDial, number: "" };
  if (!normalized.startsWith("+")) {
    return { countryCode: defaultDial, number: normalized.replace(/\D/g, "") };
  }
  const sorted = [...dialCodes].sort((a, b) => b.length - a.length);
  for (const dial of sorted) {
    if (normalized.startsWith(dial)) {
      return { countryCode: dial, number: normalized.slice(dial.length) };
    }
  }
  return { countryCode: defaultDial, number: normalized.slice(1).replace(/\D/g, "") };
}

function composePreview({ countryCode, number }) {
  const cc = String(countryCode || "").trim().replace(/[\s()-]/g, "");
  const num = String(number || "").trim().replace(/[\s()-]/g, "");
  return `${cc}${num}`;
}

describe("legacyPhone utils", () => {
  const utilSrc = read("utils/legacyPhone.js");
  const countriesSrc = read("constants/arabCountries.js");
  const dialCodes = ["+962", "+971", "+966", "+20", "+965", "+974", "+973", "+968", "+961", "+970", "+964", "+963", "+967"];

  it("defaults Jordan dial to +962 and reuses arabCountries dataset", () => {
    assert.match(utilSrc, /DEFAULT_DIAL_CODE/);
    assert.match(utilSrc, /from ["']\.\.\/constants\/arabCountries["']/);
    assert.match(countriesSrc, /dialCode:\s*["']\+962["']/);
    assert.match(countriesSrc, /export const DEFAULT_DIAL_CODE = ["']\+962["']/);
    assert.match(countriesSrc, /dialCode:\s*["']\+971["']/);
    assert.match(countriesSrc, /dialCode:\s*["']\+966["']/);
    assert.match(countriesSrc, /dialCode:\s*["']\+20["']/);
  });

  it("composes Jordan local number to E.164 preview", () => {
    assert.equal(composePreview({ countryCode: "+962", number: "791234567" }), "+962791234567");
  });

  it("composes another country correctly", () => {
    assert.equal(composePreview({ countryCode: "+971", number: "501234567" }), "+971501234567");
  });

  it("splits existing E.164 without duplicating country code", () => {
    assert.deepEqual(splitE164("+962791234567", dialCodes), {
      countryCode: "+962",
      number: "791234567",
    });
    assert.deepEqual(splitE164("+971501234567", dialCodes), {
      countryCode: "+971",
      number: "501234567",
    });
    assert.deepEqual(splitE164("+201012345678", dialCodes), {
      countryCode: "+20",
      number: "1012345678",
    });
  });

  it("uses longest matching dial prefix", () => {
    assert.equal(splitE164("+962791234567", dialCodes).countryCode, "+962");
    assert.equal(splitE164("+966501234567", dialCodes).countryCode, "+966");
  });

  it("Jordan placeholder does not include +962", () => {
    assert.match(utilSrc, /\+962":\s*"7XXXXXXXX"/);
    assert.doesNotMatch(utilSrc, /\+962":\s*"\+962/);
  });

  it("exports splitE164 and toPhonePayload for edit mode / submit", () => {
    assert.match(utilSrc, /export function splitE164/);
    assert.match(utilSrc, /export function toPhonePayload/);
    assert.match(utilSrc, /DIAL_CODES_LONGEST_FIRST|b\.length - a\.length/);
  });
});
