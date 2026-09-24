/**
 * Legacy Freelancer contract fields — catalog, validation, conditionals, privacy.
 * Run: node --test test/legacyFreelancerContractFields.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/legacy_contract_fields_test_placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "legacy-contract-test-secret16";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {
  getContractCatalog,
  getDefaultFieldSeedRows,
  CONTRACT_FIELDS,
  SENSITIVE_FIELD_KEYS,
  SYSTEM_ACCOUNT_FIELDS,
} = require("../src/constants/legacyFreelancerContractCatalog");
const {
  validateAndNormalizeAnswers,
  conditionMet,
  maskSensitiveValue,
  buildPublicFormFields,
  extractNamesFromAnswersOrPayload,
} = require("../src/services/legacyFreelancerContractFieldsService");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("migration 188 contract fields", () => {
  const sql = read("sql/migrations/188_legacy_freelancer_contract_fields.sql");
  it("is additive and registers schema_migrations", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS legacy_freelancer_invite_campaign_fields/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS legacy_freelancer_invite_answers/);
    assert.match(sql, /188_legacy_freelancer_contract_fields/);
    assert.doesNotMatch(sql, /^\s*DROP TABLE\b/im);
    assert.doesNotMatch(sql, /^\s*TRUNCATE\b/im);
    assert.doesNotMatch(sql, /secure_token/);
  });
});

describe("contract field catalog", () => {
  it("exposes complete catalog and system locked fields", () => {
    const cat = getContractCatalog();
    assert.ok(cat.fields.length >= 30);
    assert.strictEqual(SYSTEM_ACCOUNT_FIELDS.length, 6);
    assert.ok(cat.fields.some((f) => f.key === "national_id"));
    assert.ok(cat.fields.some((f) => f.key === "information_declaration"));
    assert.ok(SENSITIVE_FIELD_KEYS.includes("national_id"));
    assert.ok(SENSITIVE_FIELD_KEYS.includes("social_security_number"));
  });

  it("default seed enables minimal set and disables references by default", () => {
    const seeds = getDefaultFieldSeedRows();
    const byKey = Object.fromEntries(seeds.map((s) => [s.fieldKey, s]));
    assert.strictEqual(byKey.first_name.isEnabled, true);
    assert.strictEqual(byKey.first_name.isRequired, true);
    assert.strictEqual(byKey.university_institute.isEnabled, true);
    assert.strictEqual(byKey.university_institute.isRequired, false);
    assert.strictEqual(byKey.reference_1_name.isEnabled, false);
    assert.strictEqual(byKey.marital_status.isEnabled, false);
    assert.strictEqual(byKey.birth_date.isEnabled, true);
  });
});

describe("validateAndNormalizeAnswers", () => {
  const enabledDefaults = CONTRACT_FIELDS.filter((f) => f.defaultEnabled).map((f) => ({
    fieldKey: f.key,
    labelAr: f.labelAr,
    isEnabled: true,
    isRequired: Boolean(f.defaultRequired),
    conditional: f.conditional || null,
    type: f.type,
  }));

  it("rejects unknown fields", () => {
    assert.throws(
      () => validateAndNormalizeAnswers(enabledDefaults, { hacker_field: "x" }),
      /غير مسموح|غير مفعّل/,
    );
  });

  it("rejects missing required field", () => {
    assert.throws(
      () =>
        validateAndNormalizeAnswers(enabledDefaults, {
          first_name: "أ",
          father_name: "ب",
          family_name: "ج",
        }),
      /مطلوب/,
    );
  });

  it("accepts optional missing university_institute", () => {
    const answers = {
      first_name: "أحمد",
      father_name: "محمد",
      family_name: "علي",
      birth_date: "1990-01-01",
      nationality: "أردني",
      national_id: "1234567890",
      city: "عمّان",
      residence_area: "خلدا",
      education_level: "بكالوريوس",
      specialization: "حاسوب",
      skills_programs: "Word, Excel",
      freelance_joining_skills: "كتابة محتوى",
      is_currently_employed: false,
      information_declaration: true,
    };
    const { normalized } = validateAndNormalizeAnswers(enabledDefaults, answers);
    assert.strictEqual(normalized.first_name, "أحمد");
    assert.strictEqual(normalized.university_institute, undefined);
    assert.strictEqual(normalized.is_university_student, undefined);
  });

  it("does not require university-student question on default public fields", () => {
    const answers = {
      first_name: "أحمد",
      father_name: "محمد",
      family_name: "علي",
      birth_date: "1990-01-01",
      nationality: "أردني",
      national_id: "1234567890",
      city: "عمّان",
      residence_area: "خلدا",
      education_level: "بكالوريوس",
      specialization: "حاسوب",
      skills_programs: "Word",
      freelance_joining_skills: "تصميم",
      is_currently_employed: false,
      information_declaration: true,
    };
    const { normalized } = validateAndNormalizeAnswers(enabledDefaults, answers);
    assert.ok(!Object.prototype.hasOwnProperty.call(normalized, "is_university_student"));
  });

  it("student conditional still works when student field is enabled for a campaign", () => {
    const fields = enabledDefaults.concat([
      {
        fieldKey: "is_university_student",
        labelAr: "هل أنت طالب جامعي؟",
        isEnabled: true,
        isRequired: true,
        conditional: null,
      },
      {
        fieldKey: "current_university",
        labelAr: "أين تدرس؟",
        isEnabled: true,
        isRequired: true,
        conditional: { fieldKey: "is_university_student", equals: true },
      },
    ]);
    const answers = {
      first_name: "أحمد",
      father_name: "محمد",
      family_name: "علي",
      birth_date: "1990-01-01",
      nationality: "أردني",
      national_id: "1234567890",
      city: "عمّان",
      residence_area: "خلدا",
      education_level: "بكالوريوس",
      specialization: "حاسوب",
      skills_programs: "Word",
      freelance_joining_skills: "تصميم",
      is_university_student: true,
      is_currently_employed: false,
      information_declaration: true,
    };
    assert.throws(() => validateAndNormalizeAnswers(fields, answers), /أين تدرس|مطلوب/);
  });

  it("student yes with university succeeds when student fields enabled", () => {
    const fields = enabledDefaults.concat([
      {
        fieldKey: "is_university_student",
        labelAr: "هل أنت طالب جامعي؟",
        isEnabled: true,
        isRequired: true,
        conditional: null,
      },
      {
        fieldKey: "current_university",
        labelAr: "أين تدرس؟",
        isEnabled: true,
        isRequired: true,
        conditional: { fieldKey: "is_university_student", equals: true },
      },
    ]);
    const answers = {
      first_name: "أحمد",
      father_name: "محمد",
      family_name: "علي",
      birth_date: "1990-01-01",
      nationality: "أردني",
      national_id: "1234567890",
      city: "عمّان",
      residence_area: "خلدا",
      education_level: "بكالوريوس",
      specialization: "حاسوب",
      skills_programs: "Word",
      freelance_joining_skills: "تصميم",
      is_university_student: true,
      current_university: "الجامعة الأردنية",
      is_currently_employed: true,
      current_employer: "شركة",
      information_declaration: true,
    };
    // current_employer also needs is_currently_employed enabled — already in defaults
    const withEmployer = fields.concat([
      {
        fieldKey: "current_employer",
        labelAr: "أين تعمل؟",
        isEnabled: true,
        isRequired: true,
        conditional: { fieldKey: "is_currently_employed", equals: true },
      },
    ]);
    // Avoid duplicate keys from enabledDefaults
    const byKey = new Map();
    for (const f of withEmployer) byKey.set(f.fieldKey, f);
    const { normalized } = validateAndNormalizeAnswers([...byKey.values()], answers);
    assert.strictEqual(normalized.current_university, "الجامعة الأردنية");
    assert.strictEqual(normalized.current_employer, "شركة");
  });

  it("hidden conditional child does not fail when parent is no", () => {
    assert.strictEqual(conditionMet({ fieldKey: "is_university_student", equals: true }, { is_university_student: false }), false);
  });

  it("referral friend condition", () => {
    const fields = [
      {
        fieldKey: "how_heard_about_freelance",
        labelAr: "كيف سمعت",
        isEnabled: true,
        isRequired: true,
        conditional: null,
      },
      {
        fieldKey: "referral_friend_name",
        labelAr: "اسم الصديق",
        isEnabled: true,
        isRequired: true,
        conditional: { fieldKey: "how_heard_about_freelance", equals: "friend" },
      },
    ];
    assert.throws(
      () => validateAndNormalizeAnswers(fields, { how_heard_about_freelance: "friend" }),
      /صديق|مطلوب/,
    );
    const ok = validateAndNormalizeAnswers(fields, {
      how_heard_about_freelance: "friend",
      referral_friend_name: "سامي",
    });
    assert.strictEqual(ok.normalized.referral_friend_name, "سامي");
    const skip = validateAndNormalizeAnswers(fields, { how_heard_about_freelance: "website" });
    assert.strictEqual(skip.normalized.referral_friend_name, undefined);
  });
});

describe("public form fields + PII masking", () => {
  it("buildPublicFormFields returns only enabled safe shape", () => {
    const publicFields = buildPublicFormFields({
      fields: [
        {
          fieldKey: "first_name",
          labelAr: "الاسم الأول",
          helperAr: null,
          type: "text",
          isEnabled: true,
          isRequired: true,
          sortOrder: 1,
          section: "personal",
          options: null,
          conditional: null,
        },
        {
          fieldKey: "marital_status",
          labelAr: "الحالة",
          type: "select",
          isEnabled: false,
          isRequired: false,
          sortOrder: 2,
          section: "personal",
          options: [{ value: "single", labelAr: "أعزب" }],
          conditional: null,
        },
      ],
    });
    assert.strictEqual(publicFields.length, 1);
    assert.strictEqual(publicFields[0].key, "first_name");
    assert.ok(!("sensitive" in publicFields[0]));
  });

  it("masks sensitive values", () => {
    const masked = maskSensitiveValue("national_id", "1234567890");
    assert.match(masked, /\*+7890/);
    assert.doesNotMatch(String(masked), /^1234567890$/);
  });
});

describe("names extraction", () => {
  it("uses first/father/family", () => {
    const n = extractNamesFromAnswersOrPayload(
      { first_name: "أ", father_name: "ب", family_name: "ج" },
      {},
    );
    assert.deepStrictEqual(n, { firstName: "أ", fatherName: "ب", familyName: "ج" });
  });
});

describe("wiring / auth isolation", () => {
  it("admin routes expose fields and answers endpoints", () => {
    const routes = read("src/routes/superAdminLegacyFreelancerInviteRoutes.js");
    assert.match(routes, /fields\/restore-defaults/);
    assert.match(routes, /redemptions\/:userId\/answers/);
    assert.match(routes, /legacy-freelancer-invite-field-catalog/);
    assert.match(routes, /legacy_freelancers\.manage/);
    assert.match(routes, /requirePermission/);
    assert.doesNotMatch(routes, /requireSuperAdmin/);
  });

  it("normal register route unchanged in authRoutes", () => {
    const auth = read("src/routes/authRoutes.js");
    assert.match(auth, /router\.post\(\s*"\/register"/);
    assert.match(auth, /legacy-freelancer-register/);
  });

  it("audit write does not include national_id key in invite service redeem detail template", () => {
    const svc = read("src/services/legacyFreelancerInviteService.js");
    assert.match(svc, /contractAnswerKeys/);
    assert.doesNotMatch(svc, /national_id:\s*normalized/);
  });

  it("frontend pages wire dynamic form and admin config", () => {
    const join = read("../frontend/src/pages/LegacyFreelancerJoinPage.jsx");
    const admin = read("../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyCampaignsPanel.jsx");
    const workspace = read(
      "../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyCampaignWorkspacePage.jsx",
    );
    assert.match(join, /formFields/);
    assert.match(join, /answers/);
    assert.match(admin, /بيانات التسجيل/);
    assert.match(admin, /putLegacyFreelancerInviteFieldsRequest/);
    assert.match(workspace, /حقول التسجيل/);
    assert.match(workspace, /putLegacyFreelancerInviteFieldsRequest/);
  });

  it("fee waiver constants remain", () => {
    const fee = read("src/services/subscriptionActivationFeeService.js");
    assert.match(fee, /legacy_company_invite/);
    assert.match(fee, /getActivationFeeWaiver/);
  });
});
