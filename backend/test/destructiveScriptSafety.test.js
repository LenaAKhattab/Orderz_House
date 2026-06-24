const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveDestructiveScriptMode,
  assertMutatingScriptAllowed,
} = require("../scripts/lib/destructiveScriptSafety");

const ROTATE_OPTS = {
  scriptName: "rotateFakeOrdersNow.js",
  specificExecuteVar: "ROTATE_FAKE_ORDERS_EXECUTE",
  confirmVar: "CONFIRM_ROTATE_FAKE_ORDERS_NOW",
  executeCommandExample:
    "ROTATE_FAKE_ORDERS_EXECUTE=true CONFIRM_ROTATE_FAKE_ORDERS_NOW=true node scripts/rotateFakeOrdersNow.js",
};

const CLEANUP_OPTS = {
  scriptName: "cleanupFakeOrdersKeep400.js",
  specificExecuteVar: "CLEANUP_FAKE_ORDERS_EXECUTE",
  confirmVar: "CONFIRM_FAKE_ORDERS_CLEANUP",
  executeCommandExample:
    "CLEANUP_FAKE_ORDERS_EXECUTE=true CONFIRM_FAKE_ORDERS_CLEANUP=true node scripts/cleanupFakeOrdersKeep400.js",
};

describe("destructiveScriptSafety", () => {
  it("no env vars → dry-run", () => {
    const m = resolveDestructiveScriptMode({ ...ROTATE_OPTS, env: {} });
    assert.equal(m.dryRun, true);
    assert.equal(m.execute, false);
    assert.equal(m.mode, "DRY_RUN");
  });

  it("EXECUTE=true only → no execution", () => {
    const m = resolveDestructiveScriptMode({
      ...ROTATE_OPTS,
      env: { EXECUTE: "true" },
    });
    assert.equal(m.dryRun, true);
    assert.equal(m.execute, false);
    assert.ok(m.warnings.some((w) => w.includes("EXECUTE=true")));
  });

  it("CONFIRM_* only → no execution", () => {
    const m = resolveDestructiveScriptMode({
      ...ROTATE_OPTS,
      env: { CONFIRM_ROTATE_FAKE_ORDERS_NOW: "true" },
    });
    assert.equal(m.dryRun, true);
    assert.equal(m.execute, false);
    assert.ok(m.warnings.some((w) => w.includes("CONFIRM_ROTATE_FAKE_ORDERS_NOW")));
  });

  it("EXECUTE=true + CONFIRM_* → execution allowed", () => {
    const m = resolveDestructiveScriptMode({
      ...ROTATE_OPTS,
      env: { EXECUTE: "true", CONFIRM_ROTATE_FAKE_ORDERS_NOW: "true" },
    });
    assert.equal(m.dryRun, false);
    assert.equal(m.execute, true);
    assert.equal(m.mode, "EXECUTE");
    assert.equal(m.warnings.length, 0);
  });

  it("script-specific execute + CONFIRM_* → execution allowed", () => {
    const m = resolveDestructiveScriptMode({
      ...CLEANUP_OPTS,
      env: {
        CLEANUP_FAKE_ORDERS_EXECUTE: "true",
        CONFIRM_FAKE_ORDERS_CLEANUP: "true",
      },
    });
    assert.equal(m.execute, true);
    assert.equal(m.dryRun, false);
  });

  it("script-specific execute without confirm → dry-run", () => {
    const m = resolveDestructiveScriptMode({
      ...CLEANUP_OPTS,
      env: { CLEANUP_FAKE_ORDERS_EXECUTE: "true" },
    });
    assert.equal(m.execute, false);
    assert.equal(m.dryRun, true);
  });

  it("assertMutatingScriptAllowed blocks production without confirm", () => {
    const origExit = process.exit;
    const origEnv = process.env.NODE_ENV;
    let exitCode = null;
    process.exit = (code) => {
      exitCode = code;
      throw new Error("exit");
    };
    process.env.NODE_ENV = "production";
    try {
      assert.throws(
        () =>
          assertMutatingScriptAllowed({
            scriptName: "cleanupProbeFakeOrders.js",
            confirmVar: "CONFIRM_CLEANUP_PROBE_FAKE_ORDERS",
            env: process.env,
          }),
        /exit/,
      );
      assert.equal(exitCode, 1);
    } finally {
      process.exit = origExit;
      process.env.NODE_ENV = origEnv;
    }
  });

  it("assertMutatingScriptAllowed allows production with confirm", () => {
    const out = assertMutatingScriptAllowed({
      scriptName: "cleanupProbeFakeOrders.js",
      confirmVar: "CONFIRM_CLEANUP_PROBE_FAKE_ORDERS",
      env: { NODE_ENV: "production", CONFIRM_CLEANUP_PROBE_FAKE_ORDERS: "true" },
    });
    assert.equal(out.isProduction, true);
    assert.equal(out.confirmed, true);
  });
});
