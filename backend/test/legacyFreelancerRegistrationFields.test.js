/**
 * Legacy Freelancer registration fields patch — static/unit tests (no DB).
 * Signed docs Admin-owned, unified phone, work areas in users.legacy_work_areas
 * (separate from detailed users.skills / skills_programs).
 * Run: node --test test/legacyFreelancerRegistrationFields.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/legacy_reg_fields_test_placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "legacy-reg-fields-test-secret16";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const {
  LEGACY_WORK_FIELDS,
  LEGACY_WORK_FIELD_KEYS,
  WORK_FIELDS_REQUIRED_MESSAGE,
  normalizeLegacyWorkFields,
  mapLegacyWorkFieldsPublic,
  resolveLegacyWorkAreasFromUserRow,
  partitionSkillsAndWorkAreas,
  parseDetailedSkillsPrograms,
} = require("../src/constants/legacyFreelancerWorkFields");

const { composeE164 } = require("../src/services/legacyFreelancerInviteService");

describe("legacy work fields constants", () => {
  it("exposes stable machine keys with Arabic labels", () => {
    assert.deepStrictEqual(LEGACY_WORK_FIELD_KEYS, ["content_writing", "design", "programming"]);
    assert.strictEqual(LEGACY_WORK_FIELDS[0].labelAr, "كتابة محتوى");
    assert.strictEqual(LEGACY_WORK_FIELDS[1].labelAr, "تصميم");
    assert.strictEqual(LEGACY_WORK_FIELDS[2].labelAr, "برمجة");
  });

  it("requires at least one work field", () => {
    assert.throws(
      () => normalizeLegacyWorkFields([], { required: true }),
      (err) => err.code === "WORK_FIELDS_REQUIRED" && err.message === WORK_FIELDS_REQUIRED_MESSAGE,
    );
    assert.throws(
      () => normalizeLegacyWorkFields(null, { required: true }),
      (err) => err.message === WORK_FIELDS_REQUIRED_MESSAGE,
    );
  });

  it("accepts multiple valid work fields and drops unknowns", () => {
    const keys = normalizeLegacyWorkFields(
      ["design", "programming", "design", "unknown_skill"],
      { required: true },
    );
    assert.deepStrictEqual(keys, ["design", "programming"]);
  });

  it("maps empty skills as غير محدد-compatible empty public shape", () => {
    const empty = mapLegacyWorkFieldsPublic(null);
    assert.strictEqual(empty.isEmpty, true);
    assert.deepStrictEqual(empty.keys, []);
    assert.deepStrictEqual(empty.labels, []);
    const filled = mapLegacyWorkFieldsPublic(["content_writing", "legacy_noise"]);
    assert.strictEqual(filled.isEmpty, false);
    assert.deepStrictEqual(filled.keys, ["content_writing"]);
    assert.deepStrictEqual(filled.labels, ["كتابة محتوى"]);
  });
});

describe("users.skills vs legacy_work_areas coexistence", () => {
  it("partitions mixed arrays without destroying either concept", () => {
    const mixed = ["Photoshop", "content_writing", "Word", "design", "content_writing"];
    const { workAreas, detailedSkills } = partitionSkillsAndWorkAreas(mixed);
    assert.deepStrictEqual(workAreas, ["content_writing", "design"]);
    assert.deepStrictEqual(detailedSkills, ["Photoshop", "Word"]);
  });

  it("parseDetailedSkillsPrograms strips work-area keys from skills_programs text", () => {
    const parsed = parseDetailedSkillsPrograms("Photoshop\ndesign\nCanva, programming");
    assert.deepStrictEqual(parsed, ["Photoshop", "Canva"]);
  });

  it("selecting work areas does not erase detailed skills (resolve prefers dedicated column)", () => {
    const row = {
      skills: ["Adobe Premiere", "Excel"],
      legacy_work_areas: ["programming", "design"],
    };
    const wf = resolveLegacyWorkAreasFromUserRow(row);
    assert.deepStrictEqual(wf.keys, ["programming", "design"]);
    assert.deepStrictEqual(row.skills, ["Adobe Premiere", "Excel"]);
  });

  it("editing detailed skills conceptually leaves work areas untouched", () => {
    const workAreas = ["content_writing"];
    const detailedAfterEdit = parseDetailedSkillsPrograms("Figma\nAfter Effects");
    assert.deepStrictEqual(workAreas, ["content_writing"]);
    assert.deepStrictEqual(detailedAfterEdit, ["Figma", "After Effects"]);
  });

  it("old Legacy user with only users.skills still resolves work areas as fallback", () => {
    const oldRow = { skills: ["content_writing", "Illustrator"], legacy_work_areas: null };
    const wf = resolveLegacyWorkAreasFromUserRow(oldRow);
    assert.deepStrictEqual(wf.keys, ["content_writing"]);
    assert.strictEqual(wf.labels[0], "كتابة محتوى");
  });

  it("migration 196 separates the columns additively", () => {
    const sql = read("sql/migrations/196_legacy_work_areas.sql");
    assert.match(sql, /legacy_work_areas/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS/);
    assert.match(sql, /content_writing/);
    assert.doesNotMatch(sql, /DROP TABLE/i);
    assert.match(sql, /196_legacy_work_areas/);
  });

  it("registration writes work areas to legacy_work_areas and skills from skills_programs", () => {
    const invite = read("src/services/legacyFreelancerInviteService.js");
    assert.match(invite, /legacy_work_areas = \$1::text\[\]/);
    assert.match(invite, /parseDetailedSkillsPrograms/);
    assert.match(invite, /Do NOT persist signed docs from public registration/);
    assert.doesNotMatch(
      invite,
      /Prefer freelancer-declared work fields \(users\.skills\)/,
    );
  });
});

describe("unified phone composeE164", () => {
  it("accepts canonical E.164 string", () => {
    assert.strictEqual(composeE164("+962791234567"), "+962791234567");
  });

  it("still accepts legacy countryCode + number object", () => {
    assert.strictEqual(
      composeE164({ countryCode: "+962", number: "791234567" }),
      "+962791234567",
    );
  });

  it("composes non-Jordan countryCode + number", () => {
    assert.strictEqual(
      composeE164({ countryCode: "+971", number: "501234567" }),
      "+971501234567",
    );
  });

  it("rejects invalid phone", () => {
    assert.throws(() => composeE164("791234567"), (err) => err.statusCode === 400);
    assert.throws(() => composeE164("+962"), (err) => err.statusCode === 400);
    assert.throws(
      () => composeE164({ countryCode: "+962", number: "12" }),
      (err) => err.statusCode === 400,
    );
  });

  it("registration still enforces phone uniqueness before seat claim", () => {
    const invite = read("src/services/legacyFreelancerInviteService.js");
    assert.match(invite, /Uniqueness before seat claim/);
    assert.match(invite, /SELECT id FROM users WHERE phone = \$1/);
  });
});

describe("admin signed-document ownership + audit", () => {
  it("audits set/remove with previous and new state", () => {
    const svc = read("src/services/legacyFreelancerAdminService.js");
    assert.match(svc, /SIGNED_DOC_SET:\s*["']LEGACY_SIGNED_DOCUMENT_SET["']/);
    assert.match(svc, /SIGNED_DOC_REMOVED:\s*["']LEGACY_SIGNED_DOCUMENT_REMOVED["']/);
    assert.match(svc, /previousState/);
    assert.match(svc, /newState/);
    assert.match(svc, /confirmationSource:\s*["']ADMIN["']/);
  });

  it("keeps document type tables and does not drop them", () => {
    const sql = read("sql/migrations/190_legacy_freelancer_admin_center.sql");
    assert.match(sql, /legacy_freelancer_document_types/);
    assert.match(sql, /legacy_freelancer_signed_documents/);
    assert.match(sql, /legacy_freelancer_campaign_document_requirements/);
    assert.doesNotMatch(sql, /^\s*DROP\s+TABLE\s+legacy_freelancer_signed/im);
  });

  it("public register ignores client signedDocumentTypeIds", () => {
    const invite = read("src/services/legacyFreelancerInviteService.js");
    assert.match(invite, /Intentionally ignore any client-submitted signedDocumentTypeIds/);
    assert.match(invite, /Do NOT persist signed docs from public registration/);
    assert.match(invite, /documentRequirements:\s*\[\]/);
  });

  it("campaign doc requirements no longer block via SIGNED_DOCUMENT_REQUIRED", () => {
    const svc = read("src/services/legacyFreelancerAdminService.js");
    assert.doesNotMatch(svc, /SIGNED_DOCUMENT_REQUIRED/);
  });
});

describe("frontend registration UX", () => {
  it("public join uses shared LegacyPhoneInput with country selector; no contract checkboxes", () => {
    const join = read("../frontend/src/pages/LegacyFreelancerJoinPage.jsx");
    const phoneComp = read("../frontend/src/components/legacy/LegacyPhoneInput.jsx");
    const phoneCss = read("../frontend/src/components/legacy/LegacyPhoneInput.css");
    const phoneUtil = read("../frontend/src/utils/legacyPhone.js");
    assert.match(join, /رقم الهاتف \*/);
    assert.match(join, /LegacyPhoneInput/);
    assert.match(join, /toPhonePayload/);
    assert.match(join, /DEFAULT_DIAL_CODE/);
    assert.match(join, /مجال العمل/);
    assert.match(join, /اختر مجال أو مجالات العمل التي تمارسها/);
    assert.match(join, /WORK_FIELDS_REQUIRED_MESSAGE/);
    assert.doesNotMatch(join, /عقد مقاولة/);
    assert.doesNotMatch(join, /عقد تدريب/);
    assert.doesNotMatch(join, /signedDocumentTypeIds/);
    assert.doesNotMatch(join, /documentRequirements/);
    assert.doesNotMatch(join, /\+9627XXXXXXXX/);
    assert.match(phoneComp, /dir=["']ltr["']/);
    assert.match(phoneComp, /legacy-phone-country/);
    assert.match(phoneComp, /legacy-phone-number/);
    assert.match(phoneCss, /direction:\s*ltr/);
    assert.match(phoneCss, /flex-direction:\s*row/);
    assert.match(phoneUtil, /DEFAULT_DIAL_CODE/);
    assert.match(phoneUtil, /splitE164/);
    assert.match(phoneUtil, /DIAL_CODES_LONGEST_FIRST|longest/i);
  });

  it("admin freelancers panel manages signed docs and uses shared phone input", () => {
    const panel = read("../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyFreelancersPanel.jsx");
    assert.match(panel, /الأوراق والعقود الموقعة/);
    assert.match(panel, /setLegacyFreelancerSignedDocumentRequest|toggleSignedDoc/);
    assert.match(panel, /مجال العمل/);
    assert.match(panel, /غير محدد/);
    assert.match(panel, /workFields/);
    assert.match(panel, /رقم الهاتف \*/);
    assert.match(panel, /LegacyPhoneInput/);
    assert.match(panel, /toPhonePayload/);
    assert.doesNotMatch(panel, /\+9627XXXXXXXX/);
  });

  it("signed-document APIs are per-freelancer userId (not campaign-only)", () => {
    const routes = read("src/routes/superAdminLegacyFreelancerInviteRoutes.js");
    assert.match(routes, /\/legacy-freelancers\/:userId\/signed-documents/);
    assert.match(routes, /setSignedDocument|removeSignedDocument/);
    const panel = read("../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyFreelancersPanel.jsx");
    assert.match(panel, /toggleSignedDoc/);
    assert.match(panel, /detailTab === ["']docs["']/);
  });

  it("documents panel labels admin checklist (not freelancer confirmation)", () => {
    const docs = read("../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyDocumentsPanel.jsx");
    assert.match(docs, /أوراق يجب على الإدارة التحقق منها/);
    assert.match(docs, /الإدارة فقط/);
  });

  it("campaign workspace registrants reuse freelancers panel with campaignId", () => {
    const ws = read("../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyCampaignWorkspacePage.jsx");
    assert.match(ws, /LegacyFreelancersPanel campaignId=\{campaign\.id\}/);
    assert.match(ws, /أوراق يجب على الإدارة التحقق منها/);
    assert.match(ws, /يجب على الإدارة التحقق/);
  });
});

describe("financial / campaign token isolation", () => {
  it("registration fields patch does not touch Stripe or wallets", () => {
    const invite = read("src/services/legacyFreelancerInviteService.js");
    const admin = read("src/services/legacyFreelancerAdminService.js");
    assert.doesNotMatch(invite, /require\(["']stripe["']\)/i);
    assert.doesNotMatch(admin, /require\(["']stripe["']\)/i);
    assert.doesNotMatch(admin, /work_token|bid_credit|stripe\.checkout/i);
  });

  it("uses additive migration 196 for legacy_work_areas (not Production auto-applied)", () => {
    const sql = read("sql/migrations/196_legacy_work_areas.sql");
    assert.match(sql, /Staging application only|do not apply to Production/i);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS legacy_work_areas/);
  });
});
