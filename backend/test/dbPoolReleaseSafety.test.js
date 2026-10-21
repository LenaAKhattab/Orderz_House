/**
 * Regression: pool release must not schedule deferred unlock queries.
 * Concurrent client.query after release races with the next checkout (pg@8+ warning / pg@9 break).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("db pool release safety", () => {
  it("db.js has no asynchronous unlock-on-release handler", () => {
    const dbSrc = fs.readFileSync(path.join(__dirname, "..", "src", "config", "db.js"), "utf8");
    assert.doesNotMatch(dbSrc, /pool\.on\(\s*["']release["']/);
    assert.doesNotMatch(dbSrc, /setImmediate\s*\(\s*\(\)\s*=>\s*\{[\s\S]*pg_advisory_unlock/);
  });

  it("resolvePoolOptions fails acquisition and recycles idle clients", () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL || "postgres://u:p@127.0.0.1:5432/orderz_pool_test";
    const dbPath = require.resolve("../src/config/db");
    delete require.cache[dbPath];
    const { resolvePoolOptions } = require("../src/config/db");
    const opts = resolvePoolOptions("postgres://u:p@127.0.0.1:5432/orderz_pool_test");
    assert.equal(opts.max, 10);
    assert.equal(opts.connectionTimeoutMillis, 10000);
    assert.equal(opts.idleTimeoutMillis, 30000);
    assert.equal(opts.maxUses, 7500);
    assert.equal(opts.allowExitOnIdle, true);
    assert.equal(opts.keepAlive, true);
    assert.equal(opts.options, undefined);
    const dbSrc = fs.readFileSync(path.join(__dirname, "..", "src", "config", "db.js"), "utf8");
    assert.match(dbSrc, /connectWithStatementTimeout/);
    assert.match(dbSrc, /SET statement_timeout TO/);
    assert.doesNotMatch(dbSrc, /options:\s*`-c statement_timeout/);
  });

  it("health exposes runtime diagnostics only when allowed", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "healthService.js"),
      "utf8",
    );
    assert.match(src, /exposeRuntimeDiagnostics/);
    assert.match(src, /HEALTH_RUNTIME_DIAGNOSTICS/);
    assert.match(src, /runtime/);
    assert.match(src, /nodeEnv/);
  });
});
