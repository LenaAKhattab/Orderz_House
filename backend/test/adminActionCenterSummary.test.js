/**
 * Admin action-center summary — unit tests (no DB).
 * Run: node --test test/adminActionCenterSummary.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/admin_action_center_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  toCount,
  safeCount,
  withTimeout,
  EMPTY_COUNTS,
  buildEmptySummary,
  COUNT_STATEMENT_TIMEOUT_MS,
} = require("../src/services/adminActionCenterSummaryService");

describe("adminActionCenterSummaryService helpers", () => {
  it("toCount floors and clamps", () => {
    assert.equal(toCount(3.9), 3);
    assert.equal(toCount(-2), 0);
    assert.equal(toCount("4"), 4);
    assert.equal(toCount(null), 0);
  });

  it("safeCount returns fallback 0 + error on failure", async () => {
    const ok = await safeCount("x", async () => 5, { timeoutMs: 1000 });
    assert.equal(ok.ok, true);
    assert.equal(ok.value, 5);

    const bad = await safeCount(
      "y",
      async () => {
        throw new Error("boom");
      },
      { timeoutMs: 1000 },
    );
    assert.equal(bad.ok, false);
    assert.equal(bad.value, 0);
    assert.match(bad.error, /boom/);
  });

  it("withTimeout rejects slow counts", async () => {
    await assert.rejects(
      () =>
        withTimeout(
          new Promise((resolve) => setTimeout(() => resolve(1), 200)),
          30,
          "slow",
        ),
      /slow_timeout/,
    );
  });

  it("EMPTY_COUNTS has all required keys", () => {
    for (const key of [
      "identityPendingCount",
      "paidActivationPendingCount",
      "packageAssignmentCount",
      "pantryPendingCount",
      "articlesPendingCount",
      "feedbackPendingCount",
      "unreadNotificationsCount",
    ]) {
      assert.equal(Object.prototype.hasOwnProperty.call(EMPTY_COUNTS, key), true);
      assert.equal(EMPTY_COUNTS[key], 0);
    }
  });

  it("buildEmptySummary returns stable fallback + partialErrors", () => {
    const summary = buildEmptySummary([{ key: "summary", error: "boom" }]);
    assert.equal(summary.identityPendingCount, 0);
    assert.equal(summary.feedbackPendingCount, 0);
    assert.equal(summary.partialErrors.length, 1);
    assert.ok(summary.updatedAt);
  });

  it("uses statement_timeout helper and pure KYC count (source contract)", () => {
    const root = path.join(__dirname, "..");
    const service = fs.readFileSync(
      path.join(root, "src/services/adminActionCenterSummaryService.js"),
      "utf8",
    );
    assert.match(service, /COUNT_STATEMENT_TIMEOUT_MS/);
    assert.equal(COUNT_STATEMENT_TIMEOUT_MS >= 1000, true);
    assert.match(service, /withDbStatementTimeout/);
    assert.doesNotMatch(service, /listActivationRequestsForAdmin/);

    const kyc = fs.readFileSync(
      path.join(root, "src/services/freelancerAccountActivationKycService.js"),
      "utf8",
    );
    const start = kyc.indexOf("async function countPendingReviewRequestsForAdmin");
    const end = kyc.indexOf("async function getActivationRequestForAdmin", start);
    assert.ok(start >= 0 && end > start);
    const fnBody = kyc.slice(start, end);
    assert.match(fnBody, /SELECT COUNT\(\*\)::int AS c/);
    assert.match(fnBody, /pending_review/);
    assert.doesNotMatch(fnBody, /JOIN users/);
    assert.doesNotMatch(fnBody, /LIMIT /);
  });
});
