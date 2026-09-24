import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  JORDAN_CITIES,
  CITY_OTHER_VALUE,
  CITY_OTHER_LABEL_AR,
  isKnownJordanCity,
  canonicalJordanCity,
} from "../../constants/jordanCities.js";
import {
  EDUCATION_LEVEL_OPTIONS,
  GRADUATION_NOT_YET_VALUE,
  buildGraduationYearOptions,
} from "../../constants/legacyEducationOptions.js";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(join(srcRoot, rel), "utf8");

describe("jordan cities frontend constant", () => {
  it("has Jordan cities and other sentinel", () => {
    assert.ok(JORDAN_CITIES.includes("عمّان"));
    assert.equal(CITY_OTHER_VALUE, "__other__");
    assert.equal(CITY_OTHER_LABEL_AR, "أخرى");
    assert.ok(isKnownJordanCity("عمان"));
    assert.equal(canonicalJordanCity("عمان"), "عمّان");
  });
});

describe("education options frontend", () => {
  it("builds year options newest-first with not-yet", () => {
    const opts = buildGraduationYearOptions(new Date("2026-09-24"));
    assert.equal(opts[0].value, "2027");
    assert.ok(opts.some((o) => o.value === GRADUATION_NOT_YET_VALUE));
    assert.ok(EDUCATION_LEVEL_OPTIONS.some((o) => o.value === "بكالوريوس"));
  });
});

describe("component source safety", () => {
  it("smart fields never use dangerouslySetInnerHTML", () => {
    const smart = read("components/legacy/LegacySmartTextField.jsx");
    const select = read("components/legacy/LegacySearchableSelect.jsx");
    const suggest = read("components/legacy/LegacySmartSuggestField.jsx");
    assert.doesNotMatch(smart, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(select, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(suggest, /dangerouslySetInnerHTML/);
    assert.match(smart, /LegacySmartTextField/);
    assert.match(select, /otherInputLabel/);
  });

  it("join page wires smart fields and city other label", () => {
    const join = read("pages/LegacyFreelancerJoinPage.jsx");
    assert.match(join, /LegacySmartSuggestField/);
    assert.match(join, /اكتب اسم المدينة/);
    assert.match(join, /LegacySearchableSelect/);
    assert.doesNotMatch(join, /هل أنت طالب جامعي/);
  });

  it("api exposes suggestions request", () => {
    const api = read("services/api.js");
    assert.match(api, /legacyFreelancerFieldSuggestionsRequest/);
    assert.match(api, /legacy-freelancer-field-suggestions/);
  });
});
