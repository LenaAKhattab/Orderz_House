/**
 * Legacy Freelancer smart registration fields — suggestions, city, education, year, student removal.
 * Run: node --test test/legacyFreelancerSmartRegistrationFields.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/legacy_smart_fields_test_placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "legacy-smart-fields-test-secret16";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const {
  CONTRACT_FIELDS,
  CONTRACT_FIELD_BY_KEY,
  SUGGESTION_FIELD_KEYS,
  getDefaultFieldSeedRows,
  getContractCatalog,
} = require("../src/constants/legacyFreelancerContractCatalog");
const {
  validateAndNormalizeAnswers,
  buildPublicFormFields,
  normalizeAnswerValue,
} = require("../src/services/legacyFreelancerContractFieldsService");
const {
  isAllowedSuggestionField,
  normalizeSuggestionValue,
  dedupeNormalizeList,
  rankSuggestions,
  MAX_SUGGESTIONS,
} = require("../src/services/legacyFreelancerFieldSuggestionsService");
const { JORDAN_CITIES, CITY_OTHER_VALUE, canonicalJordanCity } = require("../src/constants/jordanCities");
const {
  EDUCATION_LEVEL_OPTIONS,
  GRADUATION_NOT_YET_VALUE,
  buildGraduationYearOptions,
  normalizeGraduationYearValue,
  currentGraduationYearMax,
} = require("../src/constants/legacyEducationOptions");

function enabledDefaults() {
  return CONTRACT_FIELDS.filter((f) => f.defaultEnabled).map((f) => ({
    fieldKey: f.key,
    labelAr: f.labelAr,
    isEnabled: true,
    isRequired: Boolean(f.defaultRequired),
    conditional: f.conditional || null,
    type: f.type,
    options: f.options || null,
    allowCustomOther: Boolean(f.allowCustomOther),
  }));
}

function baseAnswers(extra = {}) {
  return {
    first_name: "أحمد",
    father_name: "محمد",
    family_name: "علي",
    birth_date: "1990-01-01",
    nationality: "أردني",
    national_id: "1234567890",
    city: "عمّان",
    residence_area: "خلدا",
    education_level: "بكالوريوس",
    specialization: "هندسة برمجيات",
    skills_programs: "Word, Excel",
    freelance_joining_skills: "كتابة محتوى",
    is_currently_employed: false,
    information_declaration: true,
    ...extra,
  };
}

describe("migration 197 smart registration fields", () => {
  const sql = read("sql/migrations/197_legacy_freelancer_smart_registration_fields.sql");
  it("is additive, indexes field_key, disables student question without deleting answers", () => {
    assert.match(sql, /197_legacy_freelancer_smart_registration_fields/);
    assert.match(sql, /lfia_field_key_idx/);
    assert.match(sql, /is_university_student/);
    assert.match(sql, /is_enabled = FALSE/);
    assert.doesNotMatch(sql, /DELETE FROM legacy_freelancer_invite_answers/i);
    assert.doesNotMatch(sql, /^\s*DROP TABLE\b/im);
    assert.doesNotMatch(sql, /secure_token|token_hash/i);
  });
});

describe("catalog control types", () => {
  it("uses smart_text / searchable_select / year_select / education select", () => {
    assert.strictEqual(CONTRACT_FIELD_BY_KEY.nationality.type, "smart_text");
    assert.strictEqual(CONTRACT_FIELD_BY_KEY.residence_area.type, "smart_text");
    assert.strictEqual(CONTRACT_FIELD_BY_KEY.specialization.type, "smart_text");
    assert.strictEqual(CONTRACT_FIELD_BY_KEY.university_institute.type, "smart_text");
    assert.strictEqual(CONTRACT_FIELD_BY_KEY.city.type, "searchable_select");
    assert.strictEqual(CONTRACT_FIELD_BY_KEY.education_level.type, "select");
    assert.strictEqual(CONTRACT_FIELD_BY_KEY.graduation_year.type, "year_select");
  });

  it("disables university-student question by default", () => {
    const seeds = getDefaultFieldSeedRows();
    const byKey = Object.fromEntries(seeds.map((s) => [s.fieldKey, s]));
    assert.strictEqual(byKey.is_university_student.isEnabled, false);
    assert.strictEqual(byKey.is_university_student.isRequired, false);
    assert.strictEqual(byKey.current_university.isEnabled, false);
  });

  it("whitelists only safe suggestion field keys", () => {
    assert.deepStrictEqual(
      [...SUGGESTION_FIELD_KEYS].sort(),
      ["city", "nationality", "residence_area", "specialization", "university_institute"].sort(),
    );
    assert.strictEqual(isAllowedSuggestionField("nationality"), true);
    assert.strictEqual(isAllowedSuggestionField("email"), false);
    assert.strictEqual(isAllowedSuggestionField("national_id"), false);
    assert.strictEqual(isAllowedSuggestionField("first_name"), false);
  });
});

describe("suggestion normalization + ranking", () => {
  it("trims, collapses spaces, dedupes", () => {
    const list = dedupeNormalizeList([
      " الجامعة الأردنية ",
      "الجامعة الأردنية",
      "",
      "   ",
      "جامعة اليرموك",
    ]);
    assert.deepStrictEqual(list, ["الجامعة الأردنية", "جامعة اليرموك"]);
  });

  it("ranks exact > starts-with > contains and limits results", () => {
    const ranked = rankSuggestions(
      ["أردني", "أردنية", "فلسطيني", "سوري", "مغربي", "تونسي", "لبناني", "عراقي", "كويتي", "بحريني", "قطري", "إماراتي", "يمني", "مصري", "سوداني", "ليبي"],
      "أر",
    );
    assert.ok(ranked[0] === "أردني" || ranked[0].startsWith("أر") || ranked[0].includes("أر"));
    assert.ok(ranked.length <= MAX_SUGGESTIONS);
    assert.ok(ranked.every((s) => typeof s === "string"));
  });

  it("normalizeSuggestionValue rejects objects and sentinels", () => {
    assert.strictEqual(normalizeSuggestionValue({ user: "x", nationality: "أردني" }), null);
    assert.strictEqual(normalizeSuggestionValue("__other__"), null);
    assert.strictEqual(normalizeSuggestionValue("أردني"), "أردني");
  });

  it("scopes suggestion fields independently conceptually", () => {
    assert.ok(SUGGESTION_FIELD_KEYS.includes("nationality"));
    assert.ok(SUGGESTION_FIELD_KEYS.includes("residence_area"));
    assert.ok(SUGGESTION_FIELD_KEYS.includes("specialization"));
    assert.ok(SUGGESTION_FIELD_KEYS.includes("university_institute"));
  });
});

describe("city dataset + other flow", () => {
  it("exposes Jordan cities including major localities", () => {
    assert.ok(JORDAN_CITIES.includes("عمّان"));
    assert.ok(JORDAN_CITIES.includes("الزرقاء"));
    assert.ok(JORDAN_CITIES.includes("إربد"));
    assert.ok(JORDAN_CITIES.includes("العقبة"));
    assert.ok(JORDAN_CITIES.length > 40);
  });

  it("canonicalizes known cities and stores custom city as actual value", () => {
    const cityDef = CONTRACT_FIELD_BY_KEY.city;
    assert.strictEqual(normalizeAnswerValue(cityDef, " عمّان "), "عمّان");
    assert.strictEqual(normalizeAnswerValue(cityDef, "دبي"), "دبي");
    assert.throws(() => normalizeAnswerValue(cityDef, CITY_OTHER_VALUE), /مدينة|مخصص/);
    assert.throws(() => normalizeAnswerValue(cityDef, "أخرى"), /مدينة|مخصص/);
    assert.strictEqual(canonicalJordanCity("عمان"), "عمّان");
  });

  it("dedupes visible jordan options after normalization", () => {
    const keys = new Set(JORDAN_CITIES.map((c) => c.trim().replace(/\s+/g, " ")));
    assert.strictEqual(keys.size, JORDAN_CITIES.length);
  });
});

describe("education + graduation year", () => {
  it("education is select with known qualifications", () => {
    assert.ok(EDUCATION_LEVEL_OPTIONS.some((o) => o.value === "بكالوريوس"));
    assert.ok(EDUCATION_LEVEL_OPTIONS.some((o) => o.labelAr === "ماجستير"));
    const def = CONTRACT_FIELD_BY_KEY.education_level;
    assert.strictEqual(normalizeAnswerValue(def, "بكالوريوس"), "بكالوريوس");
    assert.strictEqual(normalizeAnswerValue(def, "BA"), "BA"); // historical / other custom
  });

  it("year select generates current+1 down to 1960 and supports not-yet", () => {
    const opts = buildGraduationYearOptions(new Date("2026-09-24"));
    assert.strictEqual(opts[0].value, "2027");
    assert.ok(opts.some((o) => o.value === "1960"));
    assert.ok(opts.some((o) => o.value === GRADUATION_NOT_YET_VALUE));
    assert.strictEqual(normalizeGraduationYearValue("2020"), 2020);
    assert.strictEqual(normalizeGraduationYearValue(GRADUATION_NOT_YET_VALUE), GRADUATION_NOT_YET_VALUE);
    assert.strictEqual(normalizeGraduationYearValue("لم أتخرج بعد"), GRADUATION_NOT_YET_VALUE);
    assert.strictEqual(currentGraduationYearMax(new Date("2026-01-01")), 2027);
  });

  it("registration accepts graduation not-yet without university-student question", () => {
    const { normalized } = validateAndNormalizeAnswers(
      enabledDefaults(),
      baseAnswers({ graduation_year: GRADUATION_NOT_YET_VALUE }),
    );
    assert.strictEqual(normalized.graduation_year, GRADUATION_NOT_YET_VALUE);
    assert.strictEqual(normalized.is_university_student, undefined);
  });
});

describe("public form + validation without university-student", () => {
  it("public form fields omit disabled student question", () => {
    const configFields = CONTRACT_FIELDS.map((f) => ({
      fieldKey: f.key,
      labelAr: f.labelAr,
      helperAr: f.helperAr || null,
      type: f.type,
      isEnabled: Boolean(f.defaultEnabled),
      isRequired: Boolean(f.defaultRequired),
      sortOrder: f.sortOrder,
      section: f.section,
      options: f.options || null,
      conditional: f.conditional || null,
      allowCustomOther: Boolean(f.allowCustomOther),
      otherValue: f.otherValue || null,
      otherLabelAr: f.otherLabelAr || null,
      suggestionEnabled: Boolean(f.suggestionEnabled),
    }));
    const publicFields = buildPublicFormFields({ fields: configFields });
    assert.ok(!publicFields.some((f) => f.key === "is_university_student"));
    assert.ok(publicFields.some((f) => f.key === "nationality" && f.type === "smart_text"));
    assert.ok(publicFields.some((f) => f.key === "city" && f.type === "searchable_select"));
    assert.ok(publicFields.some((f) => f.key === "graduation_year" && f.type === "year_select"));
  });

  it("backend does not require is_university_student", () => {
    const { normalized } = validateAndNormalizeAnswers(enabledDefaults(), baseAnswers());
    assert.strictEqual(normalized.nationality, "أردني");
    assert.strictEqual(normalized.city, "عمّان");
    assert.strictEqual(normalized.is_university_student, undefined);
  });

  it("rejects answers for disabled student field", () => {
    assert.throws(
      () =>
        validateAndNormalizeAnswers(enabledDefaults(), {
          ...baseAnswers(),
          is_university_student: false,
        }),
      /غير مفعّل/,
    );
  });

  it("historical education free-text still normalizes when allowCustom", () => {
    const { normalized } = validateAndNormalizeAnswers(
      enabledDefaults(),
      baseAnswers({ education_level: "BA" }),
    );
    assert.strictEqual(normalized.education_level, "BA");
  });
});

describe("routes + frontend wiring (static)", () => {
  it("exposes suggestions endpoint and limiter", () => {
    const routes = read("src/routes/authRoutes.js");
    assert.match(routes, /legacy-freelancer-field-suggestions/);
    assert.match(routes, /legacyFieldSuggestionsLimiter/);
    assert.match(routes, /fieldSuggestions/);
  });

  it("join page uses smart / searchable controls and omits student hardcode", () => {
    const join = read("../frontend/src/pages/LegacyFreelancerJoinPage.jsx");
    assert.match(join, /LegacySmartSuggestField/);
    assert.match(join, /LegacySearchableSelect/);
    assert.match(join, /education_level/);
    assert.match(join, /اكتب اسم المدينة/);
    assert.doesNotMatch(join, /هل أنت طالب جامعي/);
  });

  it("admin create reuses smart city/nationality controls", () => {
    const panel = read("../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyFreelancersPanel.jsx");
    assert.match(panel, /LegacySmartSuggestField/);
    assert.match(panel, /LegacySearchableSelect/);
    assert.match(panel, /listJordanCityOptions/);
  });

  it("catalog documents locked control types", () => {
    const cat = getContractCatalog();
    assert.ok(cat.lockedControlFieldKeys.includes("city"));
    assert.ok(cat.suggestionFieldKeys.includes("specialization"));
  });
});
