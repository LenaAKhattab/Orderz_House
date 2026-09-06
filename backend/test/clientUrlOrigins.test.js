/**
 * Origin allowlist shared by CORS and originGuard.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/client_url_test_placeholder";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const {
  parseAllowedClientOrigins,
  isTrustedBrowserOrigin,
  appendWwwSiblingOrigins,
  getPrimaryClientUrl,
} = require("../src/config/clientUrl");

describe("parseAllowedClientOrigins www sibling + trust helpers", () => {
  let prevClientUrl;
  let prevCorsOrigins;

  beforeEach(() => {
    prevClientUrl = process.env.CLIENT_URL;
    prevCorsOrigins = process.env.CORS_ORIGINS;
  });

  afterEach(() => {
    if (prevClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = prevClientUrl;
    if (prevCorsOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = prevCorsOrigins;
  });

  it("keeps CLIENT_URL as primary canonical origin", () => {
    process.env.CLIENT_URL = "https://orderzhouse.com";
    delete process.env.CORS_ORIGINS;
    assert.strictEqual(getPrimaryClientUrl(), "https://orderzhouse.com");
  });

  it("auto-trusts www sibling of apex CLIENT_URL", () => {
    process.env.CLIENT_URL = "https://orderzhouse.com";
    delete process.env.CORS_ORIGINS;
    const origins = parseAllowedClientOrigins();
    assert.ok(origins.includes("https://orderzhouse.com"));
    assert.ok(origins.includes("https://www.orderzhouse.com"));
  });

  it("accepts both apex and www via isTrustedBrowserOrigin", () => {
    process.env.CLIENT_URL = "https://orderzhouse.com";
    delete process.env.CORS_ORIGINS;
    assert.strictEqual(isTrustedBrowserOrigin("https://orderzhouse.com"), true);
    assert.strictEqual(isTrustedBrowserOrigin("https://www.orderzhouse.com"), true);
    assert.strictEqual(isTrustedBrowserOrigin("https://evil.example"), false);
  });

  it("rejects untrusted origins", () => {
    process.env.CLIENT_URL = "https://orderzhouse.com";
    delete process.env.CORS_ORIGINS;
    assert.strictEqual(isTrustedBrowserOrigin("https://attacker.test"), false);
    assert.strictEqual(isTrustedBrowserOrigin("null"), false);
  });

  it("merges explicit CORS_ORIGINS without dropping www sibling", () => {
    process.env.CLIENT_URL = "https://orderzhouse.com";
    process.env.CORS_ORIGINS = "https://preview.example.com";
    const origins = parseAllowedClientOrigins();
    assert.ok(origins.includes("https://orderzhouse.com"));
    assert.ok(origins.includes("https://www.orderzhouse.com"));
    assert.ok(origins.includes("https://preview.example.com"));
  });

  it("does not invent www for multi-label hosts like staging.orderzhouse.com", () => {
    const out = appendWwwSiblingOrigins(["https://staging.orderzhouse.com"]);
    assert.deepStrictEqual(out, ["https://staging.orderzhouse.com"]);
  });

  it("does not duplicate www when CLIENT_URL is already www", () => {
    process.env.CLIENT_URL = "https://www.orderzhouse.com";
    delete process.env.CORS_ORIGINS;
    const origins = parseAllowedClientOrigins();
    assert.deepStrictEqual(
      origins.filter((o) => o.includes("orderzhouse.com")),
      ["https://www.orderzhouse.com"],
    );
  });
});
