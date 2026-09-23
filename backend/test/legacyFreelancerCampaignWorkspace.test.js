/**
 * Legacy Freelancer Campaign Workspace — static + crypto policy tests.
 * Run: node --test test/legacyFreelancerCampaignWorkspace.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/legacy_invite_test_placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "legacy-invite-test-secret-16chars";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {
  AUDIT_ACTIONS,
  INVITE_LINK_UNRECOVERABLE_MESSAGE,
  sha256Hex,
  generateSecureToken,
  buildPublicJoinUrl,
} = require("../src/services/legacyFreelancerInviteService");
const {
  encryptInviteToken,
  decryptInviteToken,
  isInviteTokenCryptoAvailable,
  VERSION,
} = require("../src/utils/legacyInviteTokenCrypto");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("legacy campaign workspace — migration 195", () => {
  it("adds link_view_count, encrypted token, and archive columns additively", () => {
    const sql = read("sql/migrations/195_legacy_campaign_workspace.sql");
    assert.match(sql, /link_view_count/);
    assert.match(sql, /invite_token_encrypted/);
    assert.match(sql, /archived_at/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS/);
    assert.doesNotMatch(sql, /DROP TABLE/i);
  });
});

describe("legacy invite token crypto", () => {
  it("is available when JWT_SECRET is set", () => {
    assert.equal(isInviteTokenCryptoAvailable(), true);
  });

  it("round-trips token without storing plaintext shape", () => {
    const token = generateSecureToken();
    const wrapped = encryptInviteToken(token);
    assert.ok(wrapped.startsWith(`${VERSION}:`));
    assert.notEqual(wrapped, token);
    assert.equal(decryptInviteToken(wrapped), token);
  });

  it("returns null for tampered ciphertext", () => {
    const wrapped = encryptInviteToken("abc");
    const parts = wrapped.split(":");
    parts[3] = parts[3].slice(0, -2) + "xx";
    assert.equal(decryptInviteToken(parts.join(":")), null);
  });
});

describe("legacy campaign workspace — service wiring", () => {
  it("exports link recovery, stats, and safe delete helpers", () => {
    const src = read("src/services/legacyFreelancerInviteService.js");
    assert.match(src, /getCampaignInviteLink/);
    assert.match(src, /getCampaignWorkspaceStats/);
    assert.match(src, /deleteOrArchiveCampaign/);
    assert.match(src, /link_view_count = COALESCE\(link_view_count, 0\) \+ 1/);
    assert.match(src, /encryptInviteToken|wrapInviteTokenForStorage/);
    assert.match(src, /legacy_invite_campaign_id = \$1/);
    assert.ok(AUDIT_ACTIONS.CAMPAIGN_ARCHIVED);
    assert.ok(AUDIT_ACTIONS.CAMPAIGN_DELETED);
    assert.ok(AUDIT_ACTIONS.CAMPAIGN_TOKEN_REGENERATED);
    assert.ok(INVITE_LINK_UNRECOVERABLE_MESSAGE.includes("إعادة توليد"));
  });

  it("exposes invite-link and workspace routes", () => {
    const routes = read("src/routes/superAdminLegacyFreelancerInviteRoutes.js");
    assert.match(routes, /\/invite-link/);
    assert.match(routes, /\/workspace/);
    assert.match(routes, /controller\.deleteCampaign/);
  });

  it("scopes admin list by campaignId filter", () => {
    const admin = read("src/services/legacyFreelancerAdminService.js");
    assert.match(admin, /filters\.campaignId/);
    assert.match(admin, /u\.legacy_invite_campaign_id/);
    const ctrl = read("src/controllers/legacyFreelancerAdminController.js");
    assert.match(ctrl, /campaignId: req\.query\.campaignId/);
  });

  it("prevents cross-campaign registrant leakage via campaignId filter", () => {
    const admin = read("src/services/legacyFreelancerAdminService.js");
    assert.match(admin, /legacy_invite_campaign_id = \$\$\{params\.length\}::bigint/);
    const workspace = read(
      "../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyCampaignWorkspacePage.jsx",
    );
    assert.match(workspace, /LegacyFreelancersPanel campaignId=\{campaign\.id\}/);
    assert.match(workspace, /hideManualCreate/);
  });
});

describe("legacy campaign workspace — frontend", () => {
  it("uses cards UI and dedicated workspace route", () => {
    const panel = read("../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyCampaignsPanel.jsx");
    assert.match(panel, /oh-legacy-campaigns__grid/);
    assert.match(panel, /إدارة/);
    assert.match(panel, /عرض الرابط/);
    assert.match(panel, /LegacyCampaignLinkModal/);
    assert.match(panel, /\/dashboard\/legacy-freelancers\/campaigns\//);

    const workspace = read(
      "../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyCampaignWorkspacePage.jsx",
    );
    assert.match(workspace, /المسجلون/);
    assert.match(workspace, /campaignId=\{campaign\.id\}/);
    assert.match(workspace, /hideManualCreate/);
    assert.match(workspace, /legacy_invite_campaign_id/);

    const app = read("../frontend/src/App.jsx");
    assert.match(app, /legacy-freelancers\/campaigns\/:campaignId/);
  });

  it("link modal shows regenerate message for unrecoverable tokens", () => {
    const modal = read(
      "../frontend/src/pages/dashboard/legacyFreelancerAdmin/LegacyCampaignLinkModal.jsx",
    );
    assert.match(modal, /لا يمكن عرض الرابط الحالي/);
    assert.match(modal, /إعادة توليد/);
    assert.match(modal, /getLegacyFreelancerInviteLinkRequest/);
  });
});

describe("legacy invite crypto does not leak into public URL builder", () => {
  it("buildPublicJoinUrl still uses plaintext only at call site", () => {
    const token = generateSecureToken();
    const url = buildPublicJoinUrl("demo-slug", token);
    assert.ok(url.includes(token));
    assert.equal(sha256Hex(token).length, 64);
  });
});
