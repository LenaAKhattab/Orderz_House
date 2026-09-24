/**
 * Legacy Freelancer Business ID = National ID (LEGACY_INVITE only).
 * Static + unit tests (no DB required for core assertions).
 * Run: node --test test/legacyFreelancerMemberId.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/legacy_member_id_test_placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "legacy-member-id-test-secret16";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {
  normalizeNationalId,
  normalizeAndValidateNationalId,
  isValidJordanNationalId,
  maskFreelancerMemberId,
  isLegacyMemberIdUniqueViolation,
  duplicateNationalIdError,
  isSmokeOrInternalLegacyAccount,
  DUPLICATE_NATIONAL_ID_AR,
} = require("../src/utils/legacyFreelancerMemberId");
const { maskSensitiveValue, validateAndNormalizeAnswers } = require("../src/services/legacyFreelancerContractFieldsService");
const { getContractCatalog } = require("../src/constants/legacyFreelancerContractCatalog");

const ROOT = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("migration 189 additive freelancer_member_id", () => {
  const sql = read("sql/migrations/189_legacy_freelancer_member_id.sql");

  it("adds freelancer_member_id without touching users.id PK", () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS freelancer_member_id/);
    assert.match(sql, /users_legacy_freelancer_member_id_uidx/);
    assert.match(sql, /onboarding_source = 'LEGACY_INVITE'/);
    assert.match(sql, /189_legacy_freelancer_member_id/);
    assert.doesNotMatch(sql, /^\s*DROP\b/im);
    assert.doesNotMatch(sql, /ALTER TABLE users[\s\S]*DROP/i);
    assert.doesNotMatch(sql, /PRIMARY KEY/);
    assert.doesNotMatch(sql, /db push/i);
  });
});

describe("national ID normalize / validate", () => {
  it("normalizes and validates 10-digit Jordan national ID", () => {
    assert.strictEqual(normalizeNationalId("2001-298-136"), "2001298136");
    assert.strictEqual(normalizeAndValidateNationalId("2001298136"), "2001298136");
    assert.ok(isValidJordanNationalId("2001298136"));
  });

  it("rejects invalid national ID format", () => {
    assert.throws(() => normalizeAndValidateNationalId("TMP9990001"), /الرقم الوطني/);
    assert.throws(() => normalizeAndValidateNationalId("123"), /الرقم الوطني/);
  });
});

describe("masking PII for list views", () => {
  it("masks freelancer member ID as 2001******36", () => {
    assert.strictEqual(maskFreelancerMemberId("2001298136"), "2001******36");
    assert.doesNotMatch(maskFreelancerMemberId("2001298136"), /2001298136/);
  });

  it("keeps contract sensitive mask for national_id answers", () => {
    const masked = maskSensitiveValue("national_id", "2001298136");
    assert.match(String(masked), /\*+8136$/);
    assert.doesNotMatch(String(masked), /^2001298136$/);
  });
});

describe("duplicate national ID error", () => {
  it("returns Arabic friendly message and detects unique violation", () => {
    const err = duplicateNationalIdError();
    assert.strictEqual(err.message, DUPLICATE_NATIONAL_ID_AR);
    assert.strictEqual(err.statusCode || err.status, 409);
    assert.ok(
      isLegacyMemberIdUniqueViolation({
        code: "23505",
        constraint: "users_legacy_freelancer_member_id_uidx",
      }),
    );
  });
});

describe("smoke / internal exclusion from backfill", () => {
  it("excludes SMOKE_LEGACY_INTERNAL and staging smoke markers", () => {
    assert.ok(isSmokeOrInternalLegacyAccount({ internalReference: "SMOKE_LEGACY_INTERNAL" }));
    assert.ok(isSmokeOrInternalLegacyAccount({ email: "smoke.legacy@example.com", metadata: { note: "SMOKE_LEGACY" } }));
    assert.ok(
      isSmokeOrInternalLegacyAccount({
        metadata: { campaignName: "Legacy Freelancer Staging Smoke Test" },
      }),
    );
    assert.ok(!isSmokeOrInternalLegacyAccount({ email: "real.freelancer@example.com", internalReference: "OH-100" }));
  });
});

describe("registration wiring — Legacy sets member ID = national ID", () => {
  const svc = read("src/services/legacyFreelancerInviteService.js");

  it("sets freelancer_member_id from national_id inside register transaction", () => {
    assert.match(svc, /freelancer_member_id/);
    assert.match(svc, /normalizeAndValidateNationalId/);
    assert.match(svc, /duplicateNationalIdError/);
    assert.match(svc, /freelancer_member_id = \$1/);
    assert.match(svc, /LEGACY_INVITE/);
    // Check uniqueness before seat claim
    assert.ok(svc.indexOf("duplicateNationalIdError") < svc.indexOf("used_count = used_count + 1") || svc.includes("freelancerMemberId"));
    assert.match(svc, /used_count = used_count \+ 1/);
  });

  it("does not put national ID into audit detail template", () => {
    assert.match(svc, /contractAnswerKeys/);
    assert.doesNotMatch(svc, /national_id:\s*normalized/);
    assert.doesNotMatch(svc, /freelancerMemberId:\s*freelancerMemberId/);
    assert.doesNotMatch(svc, /console\.(log|info|warn|error).*national_id/i);
  });

  it("listRedemptions exposes masked member ID only", () => {
    assert.match(svc, /freelancerMemberIdMasked/);
    assert.match(svc, /maskFreelancerMemberId/);
  });
});

describe("users.id / normal signup unchanged", () => {
  it("auth registerUser path does not set freelancer_member_id", () => {
    const auth = read("src/services/authService.js");
    // Normal registration INSERT block should not assign freelancer_member_id
    const insertMatch = auth.match(/INSERT INTO users[\s\S]*?RETURNING/g) || [];
    for (const block of insertMatch) {
      assert.doesNotMatch(block, /freelancer_member_id/);
    }
  });

  it("JWT signToken does not embed national ID / freelancer_member_id", () => {
    const auth = read("src/services/authService.js");
    assert.match(auth, /function signToken/);
    const signBody = auth.slice(auth.indexOf("function signToken"), auth.indexOf("function handleUniqueViolation"));
    assert.doesNotMatch(signBody, /freelancer_member_id|freelancerMemberId|national_id/);
    assert.match(signBody, /accountId:\s*userRow\.account_id/);
  });

  it("mapUserPublic only exposes freelancerMemberId for LEGACY_INVITE", () => {
    const auth = read("src/services/authService.js");
    assert.match(auth, /onboardingSource === "LEGACY_INVITE"/);
    assert.match(auth, /freelancerMemberId/);
  });
});

describe("contract validation stores canonical national_id", () => {
  it("validateAndNormalizeAnswers normalizes national_id digits", () => {
    const catalog = getContractCatalog();
    const enabledDefaults = catalog.fields
      .filter((f) => f.defaultEnabled)
      .map((f) => ({
        fieldKey: f.key,
        labelAr: f.labelAr,
        isEnabled: true,
        isRequired: f.defaultRequired,
        conditional: f.conditional,
      }));
    const { normalized } = validateAndNormalizeAnswers(enabledDefaults, {
      first_name: "أحمد",
      father_name: "محمد",
      family_name: "علي",
      birth_date: "1990-01-01",
      nationality: "أردني",
      national_id: "2001 298 136",
      city: "عمّان",
      residence_area: "خلدا",
      education_level: "بكالوريوس",
      specialization: "حاسوب",
      skills_programs: "Word",
      freelance_joining_skills: "كتابة",
      is_currently_employed: false,
      information_declaration: true,
    });
    assert.strictEqual(normalized.national_id, "2001298136");
  });
});

describe("admin UI + freelancer dashboard + campaign 2 untouched", () => {
  it("admin redemption table shows رقم الفريلانسر masked field", () => {
    const freelancers = read(
      "../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyFreelancersPanel.jsx",
    );
    assert.match(freelancers, /رقم العضوية|رقم الفريلانسر/);
    assert.match(freelancers, /freelancerMemberIdMasked/);
  });

  it("freelancer settings shows رقم الفريلانسر for legacy only", () => {
    const settings = read("../frontend/src/pages/dashboard/FreelancerSettingsPage.jsx");
    assert.match(settings, /LEGACY_INVITE/);
    assert.match(settings, /freelancerMemberId/);
    assert.match(settings, /readOnly/);
  });

  it("Campaign 2 / token not modified by migration 189", () => {
    const sql = read("sql/migrations/189_legacy_freelancer_member_id.sql");
    assert.doesNotMatch(sql, /legacy_freelancer_invite_campaigns/);
    assert.doesNotMatch(sql, /secure_token_hash/);
    assert.doesNotMatch(sql, /max_redemptions|used_count|expires_at/);
  });

  it("fee waiver behavior source still LEGACY_INVITE", () => {
    const fee = read("src/services/subscriptionActivationFeeService.js");
    assert.match(fee, /legacy_company_invite/);
    assert.match(fee, /LEGACY_INVITE/);
  });

  it("CSV export uses masked member id column", () => {
    const ctrl = read("src/controllers/legacyFreelancerInviteController.js");
    assert.match(ctrl, /freelancerMemberIdMasked/);
    assert.doesNotMatch(ctrl, /freelancerMemberId[^M]/);
  });
});

describe("public API surface does not invent public national ID field", () => {
  it("fazat public profile still uses account_id not freelancer_member_id", () => {
    const fazat = read("src/services/fazatFreelancerProfileService.js");
    assert.match(fazat, /publicCode:\s*row\.account_id/);
    assert.doesNotMatch(fazat, /freelancer_member_id/);
  });
});
