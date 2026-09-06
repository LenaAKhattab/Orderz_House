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
