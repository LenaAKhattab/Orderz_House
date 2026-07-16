/**
 * Rate limit exemptions UI constants.
 * Run via: node --test src/constants/rateLimitExemptions.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RATE_LIMIT_EXEMPTION_FORBIDDEN_SCOPES,
  RATE_LIMIT_EXEMPTION_SCOPES,
  exemptionStatus,
  isAllowedRateLimitExemptionScope,
} from "./rateLimitExemptions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("rate limit exemptions UI constants", () => {
  it("allows only trusted write scopes", () => {
    assert.equal(isAllowedRateLimitExemptionScope("fake_order_create"), true);
    assert.equal(isAllowedRateLimitExemptionScope("auth_login"), false);
    assert.ok(RATE_LIMIT_EXEMPTION_FORBIDDEN_SCOPES.includes("auth_login"));
    assert.ok(
      RATE_LIMIT_EXEMPTION_SCOPES.every(
        (s) => !RATE_LIMIT_EXEMPTION_FORBIDDEN_SCOPES.includes(s.value),
      ),
    );
  });

  it("marks revoked and expired statuses", () => {
    assert.equal(exemptionStatus({ isActive: false }), "revoked");
    assert.equal(
      exemptionStatus({
        isActive: true,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
      "expired",
    );
    assert.equal(exemptionStatus({ isActive: true, expiresAt: null }), "active");
  });

  it("rateLimitExemptions permission is defined and not assignable", () => {
    const permsSrc = fs.readFileSync(path.join(__dirname, "dashboardPermissions.js"), "utf8");
    assert.ok(permsSrc.includes("rateLimitExemptions:"));
    const assignableStart = permsSrc.indexOf("export const ASSIGNABLE_DASHBOARD_PERMISSIONS");
    const assignableEnd = permsSrc.indexOf("];", assignableStart);
    const assignableBlock = permsSrc.slice(assignableStart, assignableEnd + 2);
    assert.ok(!assignableBlock.includes("rateLimitExemptions"));
  });
});
