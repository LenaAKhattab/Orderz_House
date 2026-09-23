/**
 * Institutions V2 Phase 1 — source guards (no DB required).
 * Run: node --test test/institutionsV2Phase1.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/institutions_v2_phase1_placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "institutions-v2-phase1-secret";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("migration 192 legacy campaign institution", () => {
  const sql = read("sql/migrations/192_legacy_campaign_institution.sql");

  it("adds nullable institution_id FK additively", () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS institution_id BIGINT NULL/);
    assert.match(sql, /REFERENCES institutions\(id\) ON DELETE SET NULL/);
    assert.match(sql, /lfic_institution_id_idx/);
    assert.match(sql, /192_legacy_campaign_institution/);
    assert.doesNotMatch(sql, /^\s*DROP TABLE\b/im);
    assert.doesNotMatch(sql, /UPDATE.*used_count/i);
    assert.doesNotMatch(sql, /secure_token_hash/);
  });
});

describe("institutionsService V2 APIs", () => {
  const src = read("src/services/institutionsService.js");

  it("exports membership, archive, and institution orders helpers", () => {
    assert.match(src, /ensureActiveMembership/);
    assert.match(src, /softDeleteOrArchiveInstitution/);
    assert.match(src, /listReleasedOrdersForInstitution/);
    assert.match(src, /updateMember/);
    assert.match(src, /resolveAssignableInstitutionId/);
    assert.match(src, /visibility_scope = 'institution'/);
    assert.match(src, /سيتم تعطيل المؤسسة مع الاحتفاظ بالسجلات والطلبات السابقة/);
    assert.match(src, /archived_via_delete/);
    assert.match(src, /member_role_changed/);
  });

  it("manager role remains a membership classification only", () => {
    assert.match(src, /memberRole === "manager" \? "manager" : "member"/);
    assert.doesNotMatch(src, /INSTITUTION_MANAGER_PERMISSION/);
  });
});

describe("institution routes and controller", () => {
  const routes = read("src/routes/institutionalStorageRoutes.js");
  const controller = read("src/controllers/institutionalStorageController.js");

  it("wires DELETE institution, PATCH member, GET orders", () => {
    assert.match(routes, /router\.delete\("\/institutions\/:id"/);
    assert.match(routes, /router\.patch\(\s*"\/institutions\/:id\/members\/:userId"/);
    assert.match(routes, /router\.get\("\/institutions\/:id\/orders"/);
    assert.match(controller, /deleteInstitution/);
    assert.match(controller, /updateMember/);
    assert.match(controller, /listInstitutionOrders/);
    assert.match(controller, /softDeleteOrArchiveInstitution/);
  });
});

describe("legacy campaign → institution wiring", () => {
  const invite = read("src/services/legacyFreelancerInviteService.js");
  const admin = read("src/services/legacyFreelancerAdminService.js");
  const controller = read("src/controllers/legacyFreelancerInviteController.js");

  it("maps institution fields and auto-joins on registration", () => {
    assert.match(invite, /institutionId: row\.institution_id/);
    assert.match(invite, /ensureActiveMembership/);
    assert.match(invite, /legacy_invite_registration/);
    assert.match(invite, /CAMPAIGN_INSTITUTION_CHANGED/);
    assert.match(invite, /REGISTRATION_JOINED_INSTITUTION/);
    assert.match(invite, /institution_id/);
  });

  it("manual legacy create can assign institution without seats", () => {
    assert.match(admin, /legacy_admin_manual/);
    assert.match(admin, /ensureActiveMembership/);
    assert.doesNotMatch(admin, /used_count = used_count \+ 1/);
  });

  it("controllers pass institutionId on create/update", () => {
    assert.match(controller, /institutionId: req\.body\.institutionId/);
    assert.match(controller, /institution_id/);
  });

  it("does not auto-backfill existing users or mutate Campaign 2 tokens", () => {
    assert.doesNotMatch(invite, /backfill.*institution/i);
    assert.doesNotMatch(invite, /campaign.?2/i);
  });
});
