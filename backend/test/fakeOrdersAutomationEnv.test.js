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
    const mod = loadModule();
    assert.equal(mod.isInProcessAutomationIntervalEnabled(), true);
    assert.equal(mod.isAutomationDriverConfigured(), true);
  });

  it("disables in-process ticks in production when env unset", () => {
    process.env.NODE_ENV = "production";
    delete process.env.FAKE_ORDERS_AUTOMATION_ENABLED;
    delete process.env.FAKE_ORDERS_AUTOMATION_CRON_SECRET;
    const mod = loadModule();
    assert.equal(mod.isInProcessAutomationIntervalEnabled(), false);
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
