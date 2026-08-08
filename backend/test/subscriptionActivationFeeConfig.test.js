/**
 * Configurable subscription activation fee (system_settings-backed).
 * Run: node --test test/subscriptionActivationFeeConfig.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/subscription_activation_fee_config_test";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SETTINGS = new Map();

function installSettingsMock() {
  SETTINGS.clear();
  const systemSettingsPath = require.resolve("../src/services/systemSettingsService");
  require.cache[systemSettingsPath] = {
    id: systemSettingsPath,
    filename: systemSettingsPath,
    loaded: true,
    exports: {
      getSetting: async (key) => {
        if (!SETTINGS.has(key)) return null;
        return SETTINGS.get(key);
      },
      setSetting: async (key, value) => {
        const normalized = value == null || String(value).trim() === "" ? null : String(value).trim();
        if (normalized == null) SETTINGS.delete(key);
        else SETTINGS.set(key, normalized);
        return normalized;
      },
    },
  };
  const feePath = require.resolve("../src/services/subscriptionActivationFeeService");
  delete require.cache[feePath];
  return require("../src/services/subscriptionActivationFeeService");
}

function mockDbClient(extraHandlers = []) {
  return {
    query: async (sql, params) => {
      const key = String(sql).replace(/\s+/g, " ").trim();
      for (const [pattern, fn] of extraHandlers) {
        if (typeof pattern === "string" ? key.includes(pattern) : pattern.test(key)) {
          return fn(sql, params);
        }
      }
      if (key.includes("freelancer_subscription_checkout_sessions")) {
        return { rows: [] };
      }
      if (key.includes("FROM users u")) {
        return { rows: [{ user_paid_at: null, audit_paid_at: null }] };
      }
      if (key.includes("FROM subscription_activation_fee_payments")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${key.slice(0, 140)}`);
    },
  };
}

describe("activation fee config defaults and updates", () => {
  let fee;

  beforeEach(() => {
    fee = installSettingsMock();
  });

  it("defaults to enabled=true and 25 JOD when settings absent", async () => {
    const cfg = await fee.getActivationFeeConfig();
    assert.strictEqual(cfg.enabled, true);
    assert.strictEqual(cfg.amountMinor, fee.DEFAULT_ACTIVATION_FEE_AMOUNT_MINOR);
    assert.strictEqual(cfg.amountMinor, 25000);
    assert.strictEqual(cfg.amountJod, 25);
    assert.strictEqual(cfg.validityDays, 365);
    assert.strictEqual(await fee.activationFeeMinorUnits(), 25000);
  });

  it("admin change 25 → 15 updates current config only", async () => {
    const client = mockDbClient();
    const result = await fee.updateActivationFeeSettings(
      { enabled: true, amountJod: 15, updatedByUserId: 1, stripe: null },
      client,
    );
    assert.strictEqual(result.config.amountMinor, 15000);
    assert.strictEqual(result.config.amountJod, 15);
    assert.strictEqual(result.previous.amountMinor, 25000);
    const cfg = await fee.getActivationFeeConfig();
    assert.strictEqual(cfg.amountMinor, 15000);
  });

  it("disabled sets needsPayment false without inventing paidAt", async () => {
    const client = mockDbClient();
    await fee.updateActivationFeeSettings({ enabled: false, amountJod: 15, stripe: null }, client);
    assert.strictEqual(await fee.freelancerNeedsSubscriptionActivationFee(9, client), false);
    const status = await fee.getActivationFeeStatus(9, client);
    assert.strictEqual(status.enabled, false);
    assert.strictEqual(status.needsPayment, false);
    assert.strictEqual(status.paidAt, null);
    assert.strictEqual(status.isCurrent, false);
    assert.strictEqual(status.amountJod, 15);
  });

  it("disabled preserves configured amount", async () => {
    const client = mockDbClient();
    await fee.updateActivationFeeSettings({ enabled: true, amountJod: 20, stripe: null }, client);
    await fee.updateActivationFeeSettings({ enabled: false, stripe: null }, client);
    const cfg = await fee.getActivationFeeConfig();
    assert.strictEqual(cfg.enabled, false);
    assert.strictEqual(cfg.amountMinor, 20000);
  });

  it("re-enable resumes 365-day validity; last paid amount stays historical", async () => {
    const clientBase = mockDbClient();
    await fee.updateActivationFeeSettings({ enabled: true, amountJod: 20, stripe: null }, clientBase);
    const recent = new Date("2026-06-01T12:00:00Z");
    const client = mockDbClient([
      [
        "FROM users u",
        () => ({ rows: [{ user_paid_at: recent, audit_paid_at: recent }] }),
      ],
      [
        "FROM subscription_activation_fee_payments",
        () => ({ rows: [{ amount_minor: 15000, paid_at: recent }] }),
      ],
    ]);
    assert.strictEqual(
      await fee.freelancerNeedsSubscriptionActivationFee(3, client, new Date("2026-06-22T12:00:00Z")),
      false,
    );
    const status = await fee.getActivationFeeStatus(3, client);
    assert.strictEqual(status.needsPayment, false);
    assert.strictEqual(status.amountJod, 20);
    assert.strictEqual(status.lastPaidAmountJod, 15);
  });

  it("expired historical payment after re-enable requires fee at new amount", async () => {
    const clientBase = mockDbClient();
    await fee.updateActivationFeeSettings({ enabled: true, amountJod: 20, stripe: null }, clientBase);
    const old = new Date("2025-01-01T12:00:00Z");
    const client = mockDbClient([
      ["FROM users u", () => ({ rows: [{ user_paid_at: old, audit_paid_at: old }] })],
      [
        "FROM subscription_activation_fee_payments",
        () => ({ rows: [{ amount_minor: 25000, paid_at: old }] }),
      ],
    ]);
    assert.strictEqual(
      await fee.freelancerNeedsSubscriptionActivationFee(3, client, new Date("2026-06-22T12:00:00Z")),
      true,
    );
    assert.strictEqual(await fee.activationFeeMinorUnits(), 20000);
  });

  it("rejects invalid amounts", async () => {
    const client = mockDbClient();
    await assert.rejects(
      () => fee.updateActivationFeeSettings({ enabled: true, amountJod: -1, stripe: null }, client),
      (err) => err.statusCode === 400,
    );
    await assert.rejects(
      () => fee.updateActivationFeeSettings({ enabled: true, amountJod: 0, stripe: null }, client),
      (err) => err.statusCode === 400,
    );
  });

  it("markActivationFeePaidOffline skips when disabled", async () => {
    const client = mockDbClient();
    await fee.updateActivationFeeSettings({ enabled: false, amountJod: 25, stripe: null }, client);
    const result = await fee.markActivationFeePaidOffline(
      { adminUserId: 1, freelancerUserId: 55 },
      client,
    );
    assert.strictEqual(result.recorded, false);
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, "activation_fee_disabled");
  });

  it("markActivationFeePaidOffline stores current configured amount when enabled", async () => {
    let insertedMinor = null;
    const clientBase = mockDbClient();
    await fee.updateActivationFeeSettings({ enabled: true, amountJod: 15, stripe: null }, clientBase);
    const client = mockDbClient([
      ["FROM users u", () => ({ rows: [{ user_paid_at: null, audit_paid_at: null }] })],
      ["subscription_activation_fee_payments WHERE stripe_session_id", () => ({ rows: [] })],
      ["subscription_activation_fee_payments WHERE stripe_payment_intent_id", () => ({ rows: [] })],
      [
        "INSERT INTO subscription_activation_fee_payments",
        (_sql, params) => {
          insertedMinor = params[3];
          return { rows: [{ id: 1, amount_minor: params[3], source: params[6] }] };
        },
      ],
      ["UPDATE users", () => ({ rows: [] })],
    ]);
    const result = await fee.markActivationFeePaidOffline(
      { adminUserId: 1, freelancerUserId: 55 },
      client,
    );
    assert.strictEqual(result.recorded, true);
    assert.strictEqual(insertedMinor, 15000);
  });

  it("Stripe session recording uses metadata amount, not live setting", async () => {
    let insertedMinor = null;
    const clientBase = mockDbClient();
    await fee.updateActivationFeeSettings({ enabled: true, amountJod: 15, stripe: null }, clientBase);
    const client = mockDbClient([
      ["FROM users u", () => ({ rows: [{ user_paid_at: null, audit_paid_at: null }] })],
      ["subscription_activation_fee_payments WHERE stripe_session_id", () => ({ rows: [] })],
      ["subscription_activation_fee_payments WHERE stripe_payment_intent_id", () => ({ rows: [] })],
      [
        "INSERT INTO subscription_activation_fee_payments",
        (_sql, params) => {
          insertedMinor = params[3];
          return { rows: [{ id: 2, amount_minor: params[3] }] };
        },
      ],
      ["UPDATE users", () => ({ rows: [] })],
    ]);
    const result = await fee.recordActivationFeeFromStripeSession(
      {
        freelancerUserId: 7,
        stripeSessionId: "cs_old_25",
        stripePaymentIntentId: "pi_old_25",
        activationFeeMinor: 25000,
        paidAt: new Date("2026-06-22T12:00:00Z"),
      },
      client,
    );
    assert.strictEqual(result.recorded, true);
    assert.strictEqual(insertedMinor, 25000);
  });

  it("eligibility gate passes when fee disabled", () => {
    const { applyActivationFeeEligibilityGate } = require("../src/services/subscriptionsService");
    const base = { eligible: true, reason: "active" };
    const gated = applyActivationFeeEligibilityGate(base, {
      enabled: false,
      needsPayment: false,
      isCurrent: false,
    });
    assert.strictEqual(gated.eligible, true);
  });

  it("eligibility gate still blocks when fee enabled and unpaid", () => {
    const { applyActivationFeeEligibilityGate } = require("../src/services/subscriptionsService");
    const base = { eligible: true, reason: "active" };
    const gated = applyActivationFeeEligibilityGate(base, {
      enabled: true,
      needsPayment: true,
      isCurrent: false,
    });
    assert.strictEqual(gated.eligible, false);
    assert.strictEqual(gated.reason, "activation_fee_unpaid");
  });

  it("other blockers are not cleared by disabled fee status", () => {
    const { applyActivationFeeEligibilityGate } = require("../src/services/subscriptionsService");
    const base = { eligible: false, reason: "company_activation_pending" };
    const gated = applyActivationFeeEligibilityGate(base, {
      enabled: false,
      needsPayment: false,
    });
    assert.strictEqual(gated.eligible, false);
    assert.strictEqual(gated.reason, "company_activation_pending");
  });

  it("analysis SQL uses stored amount_minor not live constant", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "superAdminDashboardAnalysisService.js"),
      "utf8",
    );
    assert.ok(src.includes("afp.amount_minor"));
    assert.ok(!src.includes("THEN ${SUBSCRIPTION_ACTIVATION_FEE_JOD}"));
    assert.ok(!/THEN \$\{SUBSCRIPTION_ACTIVATION_FEE_JOD\}/.test(src));
  });

  it("checkout services await activationFeeMinorUnits / buildActivationFeeStripeLineItem", () => {
    const checkout = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "stripeCheckoutService.js"),
      "utf8",
    );
    const recurring = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "stripeRecurringSubscriptionService.js"),
      "utf8",
    );
    assert.ok(checkout.includes("await activationFeeMinorUnits"));
    assert.ok(checkout.includes("await buildActivationFeeStripeLineItem"));
    assert.ok(recurring.includes("await activationFeeMinorUnits"));
    assert.ok(recurring.includes("await buildActivationFeeStripeLineItem"));
  });

  it("migration seeds defaults 25000 / enabled true", () => {
    const mig = fs.readFileSync(
      path.join(__dirname, "..", "sql", "migrations", "131_subscription_activation_fee_settings.sql"),
      "utf8",
    );
    assert.ok(mig.includes("subscription_activation_fee_enabled"));
    assert.ok(mig.includes("subscription_activation_fee_amount_minor"));
    assert.ok(mig.includes("'25000'"));
    assert.ok(mig.includes("'true'"));
  });
});
