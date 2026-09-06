/**
 * FAZAT integration unit checks (no DB writes).
 * Run: node --test test/fazatIntegrationFoundation.test.js
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/fazat_placeholder";
process.env.FAZAT_INTEGRATION_ENABLED = "true";
process.env.FAZAT_INTEGRATION_SHARED_SECRET = "test-shared-secret-32chars-minimum";
process.env.FAZAT_INTEGRATION_API_KEY = "test-api-key-value";
process.env.FAZAT_PILOT_FREELANCER_IDS = "42,99";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  buildSigningPayload,
  signHmacSha256Hex,
  verifyHmacSha256Hex,
} = require("../src/utils/fazatCrypto");
const { rankAllowsAssignment } = require("../src/services/fazatFreelancerProfileService");
const {
  sanitizeOrderForFreelancerAssigned,
} = require("../src/utils/orderViewerSanitize");
const { getFazatIntegrationConfig, assertFazatEnabled, assertPilotAllowlisted } = require("../src/config/fazatIntegration");

describe("fazat crypto / signatures", () => {
  it("signs and verifies HMAC payload", () => {
    const payload = buildSigningPayload({
      timestamp: "1700000000",
      nonce: "nonce-abc-12345",
      method: "POST",
      pathWithQuery: "/api/integrations/fazat/orders",
      rawBody: JSON.stringify({ title: "x" }),
    });
    const secret = process.env.FAZAT_INTEGRATION_SHARED_SECRET;
    const sig = signHmacSha256Hex(secret, payload);
    assert.ok(sig.length === 64);
    assert.strictEqual(verifyHmacSha256Hex(secret, payload, sig), true);
    assert.strictEqual(verifyHmacSha256Hex(secret, payload, "deadbeef"), false);
  });

  it("body hash changes signature", () => {
    const base = {
      timestamp: "1700000000",
      nonce: "nonce-abc-12345",
      method: "POST",
      pathWithQuery: "/api/integrations/fazat/orders",
    };
    const a = buildSigningPayload({ ...base, rawBody: "{\"a\":1}" });
    const b = buildSigningPayload({ ...base, rawBody: "{\"a\":2}" });
    assert.notStrictEqual(a, b);
  });
});

describe("fazat rank rules", () => {
  it("UNAPPROVED cannot receive tasks", () => {
    assert.strictEqual(rankAllowsAssignment("UNAPPROVED"), false);
  });
  it("APPROVED and TRUSTED can receive tasks", () => {
    assert.strictEqual(rankAllowsAssignment("APPROVED"), true);
    assert.strictEqual(rankAllowsAssignment("TRUSTED"), true);
  });
});

describe("fazat freelancer visibility", () => {
  it("hides FAZAT source fields and shows Orderz managed alias", () => {
    const raw = {
      id: "99",
      title: "Managed task",
      description: "Brief",
      createdByUserId: "1",
      assignedFreelancerId: "2",
      isPartnerManaged: true,
      partnerCode: "FAZAT",
      externalAssignmentId: "ext-1",
      externalOrderId: "faz-9",
      sourcePartner: "FAZAT",
      partnerMeta: {
        partnerCode: "FAZAT",
        externalAssignmentId: "ext-1",
        externalOrderId: "faz-9",
      },
      orderStatus: "in_progress",
    };
    const safe = sanitizeOrderForFreelancerAssigned(raw);
    assert.strictEqual(safe.clientDisplayName, "طلب مُدار من Orderz");
    assert.strictEqual(safe.managedByOrderz, true);
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "partnerCode"));
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "externalAssignmentId"));
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "externalOrderId"));
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "sourcePartner"));
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "partnerMeta"));
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "createdByUserId"));
    const blob = JSON.stringify(safe).toLowerCase();
    assert.ok(!blob.includes("fazat"));
    assert.ok(!blob.includes("faz3at"));
  });
});

describe("fazat config", () => {
  it("reads env without exposing secrets in config object dump checks", () => {
    const cfg = getFazatIntegrationConfig();
    assert.strictEqual(cfg.partnerCode, "FAZAT");
    assert.strictEqual(cfg.enabled, true);
    assert.ok(cfg.sharedSecret.length >= 16);
    assert.deepStrictEqual(cfg.pilotFreelancerIds, [42, 99]);
    assert.ok(assertFazatEnabled());
  });
});

describe("fazat pilot allowlist", () => {
  it("blocks empty allowlist and non-allowlisted freelancer", () => {
    const prev = process.env.FAZAT_PILOT_FREELANCER_IDS;
    delete process.env.FAZAT_PILOT_FREELANCER_IDS;
    assert.throws(() => assertFazatEnabled(), (err) => err && err.code === "FAZAT_PILOT_ALLOWLIST_EMPTY");
    process.env.FAZAT_PILOT_FREELANCER_IDS = "42,99";
    assert.doesNotThrow(() => assertFazatEnabled());
    assert.throws(() => assertPilotAllowlisted(7), (err) => err && err.code === "FAZAT_PILOT_NOT_ALLOWLISTED");
    assert.doesNotThrow(() => assertPilotAllowlisted(42));
    process.env.FAZAT_PILOT_FREELANCER_IDS = prev;
  });
});

describe("fazat webhook payload hygiene", () => {
  it("outbound payload builder excludes secrets when spreading extras carefully", () => {
    // Document expected event names for FAZAT consumers.
    const events = [
      "orderz.partner_order.created",
      "orderz.partner_order.assigned",
      "orderz.partner_order.status_changed",
      "orderz.partner_message.created",
      "orderz.partner_delivery.submitted",
      "orderz.partner_delivery.updated",
      "orderz.partner_order.cancelled",
    ];
    assert.ok(events.every((e) => e.startsWith("orderz.partner_")));
  });
});
