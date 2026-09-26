/**
 * FAZAT freelancer export mode unit tests (no DB).
 * Run: node --test test/fazatFreelancerExportMode.test.js
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/fazat_export_test_placeholder";
process.env.FAZAT_INTEGRATION_ENABLED = "true";
process.env.FAZAT_INTEGRATION_SHARED_SECRET = "test-shared-secret-32chars-minimum";
process.env.FAZAT_INTEGRATION_API_KEY = "test-api-key-value";
process.env.FAZAT_PILOT_FREELANCER_IDS = "42,99";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const {
  getFazatIntegrationConfig,
  assertFazatEnabled,
  parseFreelancerExportMode,
} = require("../src/config/fazatIntegration");
const {
  evaluateFreelancerTakeOrdersEligibility,
  SUBSCRIPTION_PAYMENT_STATUSES,
  SUBSCRIPTION_ACTIVATION_STATUSES,
  SUBSCRIPTION_STATUSES,
} = require("../src/services/subscriptionsService");

describe("FAZAT_FREELANCER_EXPORT_MODE", () => {
  const prev = process.env.FAZAT_FREELANCER_EXPORT_MODE;

  afterEach(() => {
    if (prev == null) delete process.env.FAZAT_FREELANCER_EXPORT_MODE;
    else process.env.FAZAT_FREELANCER_EXPORT_MODE = prev;
  });

  it("defaults to pilot", () => {
    delete process.env.FAZAT_FREELANCER_EXPORT_MODE;
    assert.strictEqual(parseFreelancerExportMode(), "pilot");
    assert.strictEqual(getFazatIntegrationConfig().freelancerExportMode, "pilot");
    assert.strictEqual(getFazatIntegrationConfig().requirePilotAllowlist, true);
  });

  it("accepts eligible mode and does not require pilot allowlist", () => {
    process.env.FAZAT_FREELANCER_EXPORT_MODE = "eligible";
    delete process.env.FAZAT_PILOT_FREELANCER_IDS;
    const cfg = getFazatIntegrationConfig();
    assert.strictEqual(cfg.freelancerExportMode, "eligible");
    assert.strictEqual(cfg.requirePilotAllowlist, false);
    assert.doesNotThrow(() => assertFazatEnabled());
    process.env.FAZAT_PILOT_FREELANCER_IDS = "42,99";
  });

  it("pilot mode still requires allowlist when enabled", () => {
    process.env.FAZAT_FREELANCER_EXPORT_MODE = "pilot";
    const prevIds = process.env.FAZAT_PILOT_FREELANCER_IDS;
    delete process.env.FAZAT_PILOT_FREELANCER_IDS;
    assert.throws(() => assertFazatEnabled(), (err) => err && err.code === "FAZAT_PILOT_ALLOWLIST_EMPTY");
    process.env.FAZAT_PILOT_FREELANCER_IDS = prevIds;
  });
});

describe("eligible export mirrors take-orders gates (unit)", () => {
  it("excludes company_pending (identity/activation incomplete)", () => {
    const r = evaluateFreelancerTakeOrdersEligibility({
      paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED,
      activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING,
      status: SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
      expiryDate: null,
    });
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "company_activation_pending");
  });

  it("includes not_required + company_approved (free/waived/admin access)", () => {
    const r = evaluateFreelancerTakeOrdersEligibility({
      paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED,
      activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
      status: SUBSCRIPTION_STATUSES.ACTIVE,
      expiryDate: null,
    });
    assert.strictEqual(r.eligible, true);
  });

  it("excludes expired subscription", () => {
    const r = evaluateFreelancerTakeOrdersEligibility({
      paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.PAID,
      activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
      status: SUBSCRIPTION_STATUSES.EXPIRED,
      expiryDate: null,
    });
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "expired");
  });
});
