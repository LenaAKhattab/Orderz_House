/**
 * Integration-test Production DB guard (incident 2026-10-24).
 * Production-looking URLs below use the real host marker with an unresolvable `.invalid` TLD,
 * so no case can ever reach a real database — and the guard refuses before any Pool exists.
 *
 * Run: node --test test/integrationDbGuard.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  INTEGRATION_DB_ENV_VAR,
  INTEGRATION_DISABLED_DATABASE_URL,
  evaluateIntegrationDatabase,
  isIntegrationEnvConfigured,
} = require("./helpers/integrationEnv");
const {
  TEST_RUNTIME_PRODUCTION_DB_REFUSED,
  isAutomatedTestRuntime,
  assertTestRuntimeDatabaseSafe,
} = require("../src/config/testRuntimeDatabaseGuard");

const PROD_LIKE = "postgresql://u:p@ep-wandering-cherry-guardtest.invalid/neondb?sslmode=require";
const SAFE_TEST = "postgresql://u:p@ep-qa-integration-db.invalid/orderz_integration";
const JWT = "x".repeat(32);
const backendRoot = path.join(__dirname, "..");

describe("A. DATABASE_URL = Production, no integration DB configured", () => {
  it("integration tests are not enabled and never fall back to DATABASE_URL", () => {
    const env = { DATABASE_URL: PROD_LIKE, JWT_SECRET: JWT };
    assert.equal(evaluateIntegrationDatabase(env).code, "INTEGRATION_DB_NOT_CONFIGURED");
    assert.equal(isIntegrationEnvConfigured(env), false);
    assert.equal(env.DATABASE_URL, INTEGRATION_DISABLED_DATABASE_URL, "Production URL replaced with inert placeholder");
  });

  it("db.js refuses at module load inside a test runtime (before any Pool/connection)", () => {
    const res = spawnSync(
      process.execPath,
      ["-e", "require('./src/config/db'); console.log('POOL_CREATED')"],
      {
        cwd: backendRoot,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_TEST_CONTEXT: "child-v8", DATABASE_URL: PROD_LIKE },
        encoding: "utf8",
        timeout: 30000,
      },
    );
    assert.notEqual(res.status, 0);
    assert.match(`${res.stderr}`, new RegExp(TEST_RUNTIME_PRODUCTION_DB_REFUSED));
    assert.doesNotMatch(`${res.stdout}`, /POOL_CREATED/);
  });
});

describe("B. explicit safe integration DB", () => {
  it("is authorized and becomes the process DATABASE_URL", () => {
    const env = { DATABASE_URL: PROD_LIKE, [INTEGRATION_DB_ENV_VAR]: SAFE_TEST, JWT_SECRET: JWT };
    assert.equal(evaluateIntegrationDatabase(env).ok, true);
    assert.equal(isIntegrationEnvConfigured(env), true);
    assert.equal(env.DATABASE_URL, SAFE_TEST);
  });

  it("still requires a JWT secret", () => {
    const env = { [INTEGRATION_DB_ENV_VAR]: SAFE_TEST };
    assert.equal(isIntegrationEnvConfigured(env), false);
  });
});

describe("C. Production-looking integration URL supplied explicitly", () => {
  it("hard refusal", () => {
    const env = { [INTEGRATION_DB_ENV_VAR]: PROD_LIKE, JWT_SECRET: JWT };
    const verdict = evaluateIntegrationDatabase(env);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.code, "INTEGRATION_DB_PRODUCTION_REFUSED");
    assert.equal(isIntegrationEnvConfigured(env), false);
  });

  it("configured production host markers are honoured", () => {
    const env = {
      [INTEGRATION_DB_ENV_VAR]: "postgresql://u:p@db.other-prod-host.invalid/app",
      PRODUCTION_DATABASE_HOST: "other-prod-host",
      JWT_SECRET: JWT,
    };
    assert.equal(evaluateIntegrationDatabase(env).code, "INTEGRATION_DB_PRODUCTION_REFUSED");
  });

  it("APP_ENV / NODE_ENV production refuses even a safe URL", () => {
    for (const extra of [{ APP_ENV: "production" }, { NODE_ENV: "production" }]) {
      const env = { [INTEGRATION_DB_ENV_VAR]: SAFE_TEST, JWT_SECRET: JWT, ...extra };
      assert.equal(evaluateIntegrationDatabase(env).code, "INTEGRATION_DB_PRODUCTION_ENV_REFUSED");
    }
  });
});

describe("D. unit tests and the running app are unaffected", () => {
  it("placeholder / local URLs pass the runtime guard", () => {
    assert.doesNotThrow(() =>
      assertTestRuntimeDatabaseSafe("postgresql://127.0.0.1:5432/x_placeholder", {
        env: { NODE_TEST_CONTEXT: "child-v8" },
        execArgv: [],
        argv: ["node", "x"],
      }),
    );
  });

  it("detects node --test children and direct *.test.js runs only", () => {
    assert.equal(isAutomatedTestRuntime({ env: { NODE_TEST_CONTEXT: "child-v8" }, execArgv: [], argv: [] }), true);
    assert.equal(isAutomatedTestRuntime({ env: {}, execArgv: ["--test-isolation=process"], argv: [] }), true);
    assert.equal(isAutomatedTestRuntime({ env: {}, execArgv: [], argv: ["node", "/x/foo.test.js"] }), true);
    assert.equal(isAutomatedTestRuntime({ env: {}, execArgv: [], argv: ["node", "/app/server.js"] }), false);
  });

  it("the Production server process (not a test runtime) is never blocked", () => {
    assert.doesNotThrow(() =>
      assertTestRuntimeDatabaseSafe(PROD_LIKE, { env: { NODE_ENV: "production" }, execArgv: [], argv: ["node", "/app/server.js"] }),
    );
  });

  it("this process (a node --test child) would refuse a Production URL", () => {
    assert.throws(
      () => assertTestRuntimeDatabaseSafe(PROD_LIKE),
      (err) => err.code === TEST_RUNTIME_PRODUCTION_DB_REFUSED,
    );
  });

  it("no integration fixture uses a static repo-known password", () => {
    const src = require("node:fs").readFileSync(
      path.join(__dirname, "internalPricedBiddingLifecycle.integration.test.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /IntegrationTest1!/);
    assert.match(src, /crypto\.randomBytes\(18\)/);
  });
});
