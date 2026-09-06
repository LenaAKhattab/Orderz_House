/**
 * Phase Web-Admin-List-Timeout-05 — refresh enabled state, debounce, 429 UX.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_LIST_RATE_LIMIT_COOLDOWN_MS,
  ADMIN_LIST_RATE_LIMIT_NOTE,
  ADMIN_LIST_REFRESH_SOFT_NOTE,
  ADMIN_LIST_SEARCH_DEBOUNCE_MS,
  createAdminListRequestGate,
  isAdminListAbortError,
  resolveAdminListFailure,
} from "./lib/staff/adminListLoad.js";
import { getSafeApiErrorMessage, isRateLimitedError } from "./utils/apiErrorMessage.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Web-Admin-List-Timeout-05 — helpers", () => {
  it("debounce is 450–600ms", () => {
    assert.ok(ADMIN_LIST_SEARCH_DEBOUNCE_MS >= 450);
    assert.ok(ADMIN_LIST_SEARCH_DEBOUNCE_MS <= 600);
  });

  it("429 soft note is Arabic and non-destructive", () => {
    assert.match(ADMIN_LIST_RATE_LIMIT_NOTE, /طلبات كثيرة/);
    assert.doesNotMatch(ADMIN_LIST_RATE_LIMIT_NOTE, /timeout|ECONNABORTED|429/i);
    assert.ok(ADMIN_LIST_RATE_LIMIT_COOLDOWN_MS >= 10000);
    assert.ok(ADMIN_LIST_RATE_LIMIT_COOLDOWN_MS <= 20000);
  });

  it("resolveAdminListFailure keeps rows on 429 and marks rateLimited", () => {
    const err = { response: { status: 429, data: { code: "RATE_LIMITED", message: "too many" } } };
    assert.equal(isRateLimitedError(err), true);
    const resolved = resolveAdminListFailure({
      hasExistingRows: true,
      error: err,
      mapError: (e) => getSafeApiErrorMessage(e),
    });
    assert.equal(resolved.shouldClearRows, false);
    assert.equal(resolved.rateLimited, true);
    assert.equal(resolved.softNote, ADMIN_LIST_RATE_LIMIT_NOTE);
    assert.equal(resolved.hardError, "");
  });

  it("aborted request is ignored and does not clear rows", () => {
    const resolved = resolveAdminListFailure({
      hasExistingRows: true,
      error: { code: "ERR_CANCELED", name: "CanceledError" },
    });
    assert.equal(isAdminListAbortError({ code: "ERR_CANCELED", name: "CanceledError" }), true);
    assert.equal(resolved.shouldClearRows, false);
    assert.equal(resolved.softNote, "");
    assert.equal(resolved.rateLimited, false);
  });

  it("stale gate: later ticket wins; earlier abort does not clear busy without successor", () => {
    const gate = createAdminListRequestGate();
    let busy = false;
    let inFlight = 0;
    const start = () => {
      const t = gate.begin();
      inFlight += 1;
      busy = true;
      return t;
    };
    const finish = (ticket) => {
      inFlight = Math.max(0, inFlight - 1);
      if (inFlight === 0) busy = false;
      return ticket.isCurrent();
    };
    const a = start();
    const b = start();
    assert.equal(a.isCurrent(), false);
    finish(a); // aborted/stale — inFlight still 1
    assert.equal(busy, true);
    finish(b);
    assert.equal(busy, false);
  });
});

describe("Web-Admin-List-Timeout-05 — page/hook contracts", () => {
  it("useAdminListLoad stabilizes run and clears busy via inFlight counter", () => {
    const src = read("hooks/useAdminListLoad.js");
    assert.match(src, /mapErrorRef/);
    assert.match(src, /inFlightRef/);
    assert.match(src, /inFlightRef\.current === 0/);
    assert.match(src, /ADMIN_LIST_RATE_LIMIT_COOLDOWN_MS/);
    assert.match(src, /rateLimited/);
    // run must be stable (empty deps) so identity load effect does not loop
    assert.match(src, /const run = useCallback\(async \(fetcher, meta = \{\}\) => \{[\s\S]*?\}, \[\]\);/);
  });

  it("identity: refresh uses refreshing/rateLimited; debounce constant; soft 429 UX", () => {
    const src = read("pages/dashboard/SuperAdminFreelancerActivationRequestsPage.jsx");
    assert.match(src, /ADMIN_LIST_SEARCH_DEBOUNCE_MS/);
    assert.match(src, /controlsDisabled = refreshing \|\| rateLimited/);
    assert.match(src, /data-testid="admin-identity-refresh"/);
    assert.match(src, /admin-list-rate-limit-cooldown/);
    assert.match(src, /جاري البحث/);
    assert.doesNotMatch(src, /disabled=\{initialLoading \|\| refreshing\}/);
  });

  it("identity search depends on debouncedSearch not raw input for load", () => {
    const src = read("pages/dashboard/SuperAdminFreelancerActivationRequestsPage.jsx");
    assert.match(src, /search: debouncedSearch/);
    assert.match(src, /\[runListLoad, statusFilter, debouncedSearch\]/);
    assert.doesNotMatch(src, /\[runListLoad, statusFilter, searchInput\]/);
  });

  it("articles/feedback pick up shared rateLimited / debounce", () => {
    const articles = read("components/admin/MarketplaceArticlesAdminPanel.jsx");
    assert.match(articles, /rateLimited/);
    assert.match(articles, /disabled=\{refreshing \|\| rateLimited\}/);
    const feedback = read("pages/dashboard/SuperAdminFeedbackPage.jsx");
    assert.match(feedback, /ADMIN_LIST_SEARCH_DEBOUNCE_MS/);
    assert.match(feedback, /rateLimited/);
  });

  it("timeout02 regression: soft note and no raw axios still hold", () => {
    assert.match(ADMIN_LIST_REFRESH_SOFT_NOTE, /تعذر تحديث القائمة/);
    const msg = getSafeApiErrorMessage({
      code: "ECONNABORTED",
      message: "timeout of 10000ms exceeded",
    });
    assert.doesNotMatch(msg, /timeout of \d+ms|ECONNABORTED/i);
  });

  it("3-column admin action center unaffected", () => {
    const home = read("pages/dashboard/AdminDashboardHome.jsx");
    assert.match(home, /acc-actions-grid--admin-center|action-center|مركز المهام/);
  });
});
