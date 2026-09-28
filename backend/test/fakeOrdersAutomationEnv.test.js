const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");

describe("fakeOrdersAutomation env defaults", () => {
  const original = { ...process.env };

  function loadModule() {
    const path = require("node:path");
    const modPath = path.join(__dirname, "..", "src", "config", "fakeOrdersAutomation.js");
    delete require.cache[require.resolve(modPath)];
    return require(modPath);
  }

  it("enables in-process ticks in non-production when env unset", () => {
    process.env.NODE_ENV = "development";
    delete process.env.FAKE_ORDERS_AUTOMATION_ENABLED;
    delete process.env.DATABASE_URL;
    const mod = loadModule();
    assert.equal(mod.isInProcessAutomationIntervalEnabled(), true);
    assert.equal(mod.shouldRunStartupTrainingBootstrap(), true);
    assert.equal(mod.isAutomationDriverConfigured(), true);
  });

  it("does not auto-start ticks when development points at a remote database", () => {
    process.env.NODE_ENV = "development";
    delete process.env.FAKE_ORDERS_AUTOMATION_ENABLED;
    process.env.DATABASE_URL = "postgres://user:pass@db.example.internal:5432/staging";
    const mod = loadModule();
    assert.equal(mod.isNonProductionRemoteDatabase(), true);
    assert.equal(mod.isInProcessAutomationIntervalEnabled(), false);
    assert.equal(mod.shouldRunStartupTrainingBootstrap(), false);
  });

  it("allows an explicit opt-in against a remote database", () => {
    process.env.NODE_ENV = "development";
    process.env.FAKE_ORDERS_AUTOMATION_ENABLED = "true";
    process.env.DATABASE_URL = "postgres://user:pass@db.example.internal:5432/staging";
    const mod = loadModule();
    assert.equal(mod.isInProcessAutomationIntervalEnabled(), true);
    assert.equal(mod.shouldRunStartupTrainingBootstrap(), true);
  });

  it("disables in-process ticks in production when env unset", () => {
    process.env.NODE_ENV = "production";
    delete process.env.FAKE_ORDERS_AUTOMATION_ENABLED;
    delete process.env.FAKE_ORDERS_AUTOMATION_CRON_SECRET;
    const mod = loadModule();
    assert.equal(mod.isInProcessAutomationIntervalEnabled(), false);
    assert.equal(mod.shouldRunStartupTrainingBootstrap(), true);
    assert.equal(mod.isAutomationDriverConfigured(), false);
  });

  it("respects explicit FAKE_ORDERS_AUTOMATION_ENABLED=false in development", () => {
    process.env.NODE_ENV = "development";
    process.env.FAKE_ORDERS_AUTOMATION_ENABLED = "false";
    const mod = loadModule();
    assert.equal(mod.isInProcessAutomationIntervalEnabled(), false);
  });

  after(() => {
    process.env = { ...original };
  });
});
