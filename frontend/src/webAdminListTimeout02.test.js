/**
 * Phase Web-Admin-List-Timeout-02 — safe Admin list loading (races, soft refresh, timeouts).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_LIST_HEAVY_TIMEOUT_MS,
  ADMIN_LIST_REFRESH_SOFT_NOTE,
  ADMIN_LIST_SEARCH_DEBOUNCE_MS,
  ADMIN_LIST_TIMEOUT_MS,
  createAdminListRequestGate,
  isAdminListAbortError,
  resolveAdminListFailure,
} from "./lib/staff/adminListLoad.js";
import { getSafeApiErrorMessage } from "./utils/apiErrorMessage.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Web-Admin-List-Timeout-02 — shared helpers", () => {
  it("exports admin list timeouts 20s / 25s", () => {
    assert.equal(ADMIN_LIST_TIMEOUT_MS, 20000);
    assert.equal(ADMIN_LIST_HEAVY_TIMEOUT_MS, 25000);
    assert.ok(ADMIN_LIST_SEARCH_DEBOUNCE_MS >= 400 && ADMIN_LIST_SEARCH_DEBOUNCE_MS <= 600);
  });

  it("soft refresh note is Arabic and non-destructive", () => {
    assert.match(ADMIN_LIST_REFRESH_SOFT_NOTE, /تعذر تحديث القائمة/);
    assert.doesNotMatch(ADMIN_LIST_REFRESH_SOFT_NOTE, /timeout|ECONNABORTED/i);
  });

  it("resolveAdminListFailure keeps rows on refresh timeout", () => {
    const timeoutErr = { code: "ECONNABORTED", message: "timeout of 10000ms exceeded" };
    const resolved = resolveAdminListFailure({
      hasExistingRows: true,
      error: timeoutErr,
      mapError: (e) => getSafeApiErrorMessage(e),
    });
    assert.equal(resolved.shouldClearRows, false);
    assert.equal(resolved.softNote, ADMIN_LIST_REFRESH_SOFT_NOTE);
    assert.equal(resolved.hardError, "");
  });

  it("resolveAdminListFailure shows initial error when no rows", () => {
    const timeoutErr = { code: "ECONNABORTED", message: "timeout of 10000ms exceeded" };
    const resolved = resolveAdminListFailure({
      hasExistingRows: false,
      error: timeoutErr,
      mapError: (e) => getSafeApiErrorMessage(e),
    });
    assert.equal(resolved.shouldClearRows, true);
    assert.equal(resolved.softNote, "");
    assert.match(resolved.hardError, /استغرق الطلب/);
    assert.doesNotMatch(resolved.hardError, /timeout of 10000ms|ECONNABORTED/i);
  });

  it("timeout errors never surface raw Axios messages", () => {
    const msg = getSafeApiErrorMessage({
      code: "ECONNABORTED",
      message: "timeout of 10000ms exceeded",
    });
    assert.doesNotMatch(msg, /timeout of \d+ms/i);
    assert.doesNotMatch(msg, /ECONNABORTED/i);
    assert.match(msg, /استغرق الطلب|الاتصال/);
  });

  it("stale response guard: later ticket wins; earlier failure ignored", async () => {
    const gate = createAdminListRequestGate();
    const a = gate.begin();
    const b = gate.begin();
    assert.equal(a.isCurrent(), false);
    assert.equal(b.isCurrent(), true);

    let uiRows = [];
    // B succeeds
    if (b.isCurrent()) uiRows = [{ id: "b" }];
    // A times out late
    const lateFail = resolveAdminListFailure({
      hasExistingRows: uiRows.length > 0,
      error: { code: "ECONNABORTED", message: "timeout of 10000ms exceeded" },
    });
    if (a.isCurrent() && lateFail.shouldClearRows) uiRows = [];
    assert.deepEqual(uiRows, [{ id: "b" }]);
    assert.equal(lateFail.shouldClearRows, false);
  });

  it("begin() aborts prior controller; abort errors are ignored", () => {
    const gate = createAdminListRequestGate();
    const first = gate.begin();
    assert.ok(first.signal);
    const second = gate.begin();
    assert.equal(first.signal.aborted, true);
    assert.equal(second.signal.aborted, false);
    assert.equal(isAdminListAbortError({ code: "ERR_CANCELED", name: "CanceledError" }), true);
    assert.equal(
      resolveAdminListFailure({
        hasExistingRows: true,
        error: { code: "ERR_CANCELED", name: "CanceledError" },
      }).shouldClearRows,
      false,
    );
  });
});

describe("Web-Admin-List-Timeout-02 — page contracts", () => {
  it("identity: useAdminListLoad, debounce, soft note, keep rows on failure", () => {
    const src = read("pages/dashboard/SuperAdminFreelancerActivationRequestsPage.jsx");
    assert.match(src, /useAdminListLoad/);
    assert.match(src, /ADMIN_LIST_SEARCH_DEBOUNCE_MS/);
    assert.match(src, /admin-list-refresh-soft-note/);
    assert.match(src, /جاري التحديث/);
    assert.match(src, /items\.length === 0/);
    assert.doesNotMatch(src, /catch\s*\([^)]*\)\s*\{[^}]*setItems\(\[\]\)/s);
    assert.match(src, /hasExistingRows:\s*itemsLenRef/);
  });

  it("pantry: request gate, soft note, heavy list timeout via API, keep rows", () => {
    const src = read("pages/dashboard/AdminPantryPage.jsx");
    assert.match(src, /createAdminListRequestGate|listGateRef/);
    assert.match(src, /ADMIN_LIST_REFRESH_SOFT_NOTE/);
    assert.match(src, /جاري التحديث/);
    assert.match(src, /hasExisting/);
    assert.match(src, /if\s*\(!hasExisting\)\s*\{[\s\S]*?setRequests\(\[\]\)/);
    const api = read("services/api.js");
    assert.match(
      api,
      /listAdminPantryRequestsRequest[\s\S]*?ADMIN_LIST_HEAVY_TIMEOUT_MS/,
    );
  });

  it("articles: useAdminListLoad keeps list visible with soft note", () => {
    const src = read("components/admin/MarketplaceArticlesAdminPanel.jsx");
    assert.match(src, /useAdminListLoad/);
    assert.match(src, /admin-list-refresh-soft-note/);
    assert.match(src, /articles\.length > 0/);
    assert.match(src, /hasExistingRows:\s*articlesLenRef/);
    assert.match(src, /if\s*\(!result\.ok\)\s*return;/);
  });

  it("feedback: useAdminListLoad + soft refresh UX", () => {
    const src = read("pages/dashboard/SuperAdminFeedbackPage.jsx");
    assert.match(src, /useAdminListLoad/);
    assert.match(src, /admin-list-refresh-soft-note/);
    assert.match(src, /initialLoading && items\.length === 0/);
    assert.match(src, /items\.length > 0/);
    assert.match(src, /hasExistingRows:\s*itemsLenRef/);
  });

  it("package assignment: gate, soft note, ADMIN_LIST_TIMEOUT, keep subs on refresh fail", () => {
    const src = read("pages/dashboard/SuperAdminSubscriptionsPage.jsx");
    assert.match(src, /createAdminListRequestGate/);
    assert.match(src, /ADMIN_LIST_REFRESH_SOFT_NOTE/);
    assert.match(src, /ADMIN_LIST_TIMEOUT_MS/);
    assert.match(src, /admin-list-refresh-soft-note/);
    assert.match(src, /subs\.length > 0/);
    assert.match(src, /resolved\.shouldClearRows/);
    assert.match(src, /جاري التحديث/);
  });

  it("notifications: request gate and does not clear items on catch", () => {
    const src = read("pages/dashboard/NotificationsPage.jsx");
    assert.match(src, /createAdminListRequestGate/);
    assert.match(src, /Keep previous rows/);
    assert.doesNotMatch(src, /setItems\(\[\]\)/);
  });

  it("httpClient keeps global axios timeout at 10s while exporting admin list timeouts", () => {
    const src = read("services/httpClient.js");
    assert.match(src, /ADMIN_LIST_TIMEOUT_MS\s*=\s*20000/);
    assert.match(src, /ADMIN_LIST_HEAVY_TIMEOUT_MS\s*=\s*25000/);
    assert.match(src, /timeout:\s*10000/);
  });

  it("identity/articles/feedback/subscriptions list APIs use ADMIN_LIST_TIMEOUT_MS", () => {
    const api = read("services/api.js");
    assert.match(
      api,
      /listSuperAdminFreelancerActivationRequestsRequest[\s\S]*?ADMIN_LIST_TIMEOUT_MS/,
    );
    assert.match(api, /listAdminMarketplaceArticlesRequest[\s\S]*?ADMIN_LIST_TIMEOUT_MS/);
    assert.match(api, /listSuperAdminFeedbackRequest[\s\S]*?ADMIN_LIST_TIMEOUT_MS/);
    assert.match(api, /listSubscriptionsRequest[\s\S]*?ADMIN_LIST_TIMEOUT_MS/);
  });
});

describe("Web-Admin-List-Timeout-02 — race / clear-on-error simulation", () => {
  it("identity-style: success then timeout does not clear rows", () => {
    let items = [];
    const applySuccess = (rows, requestId, currentId) => {
      if (requestId !== currentId) return;
      items = rows;
    };
    const applyFailure = (hasRows, requestId, currentId) => {
      if (requestId !== currentId) return;
      const r = resolveAdminListFailure({
        hasExistingRows: hasRows,
        error: { code: "ECONNABORTED", message: "timeout of 10000ms exceeded" },
      });
      if (r.shouldClearRows) items = [];
      return r;
    };

    // Request 1 succeeds
    applySuccess([{ id: 1 }], 1, 1);
    assert.equal(items.length, 1);
    // Request 2 times out while rows exist (StrictMode race without abort)
    const fail = applyFailure(items.length > 0, 2, 2);
    assert.equal(fail.shouldClearRows, false);
    assert.equal(items.length, 1);
  });

  it("identity-style: initial timeout with no rows yields hard error", () => {
    let items = [];
    let hard = "";
    const r = resolveAdminListFailure({
      hasExistingRows: false,
      error: { code: "ECONNABORTED", message: "timeout of 10000ms exceeded" },
      mapError: (e) => getSafeApiErrorMessage(e),
    });
    if (r.shouldClearRows) items = [];
    hard = r.hardError;
    assert.equal(items.length, 0);
    assert.match(hard, /استغرق الطلب/);
  });

  it("stale older success must not overwrite newer success", () => {
    const gate = createAdminListRequestGate();
    let items = [];
    const a = gate.begin();
    const b = gate.begin();
    // B finishes first
    if (b.isCurrent()) items = [{ id: "new" }];
    // A finishes late with old payload
    if (a.isCurrent()) items = [{ id: "old" }];
    assert.deepEqual(items, [{ id: "new" }]);
  });

  it("loading/refresh states do not blank existing table (contract)", () => {
    const identity = read("pages/dashboard/SuperAdminFreelancerActivationRequestsPage.jsx");
    assert.match(identity, /initialLoading && items\.length === 0/);
    const feedback = read("pages/dashboard/SuperAdminFeedbackPage.jsx");
    assert.match(feedback, /initialLoading && items\.length === 0/);
    const articles = read("components/admin/MarketplaceArticlesAdminPanel.jsx");
    assert.match(articles, /initialLoading && articles\.length === 0/);
    const subs = read("pages/dashboard/SuperAdminSubscriptionsPage.jsx");
    assert.match(subs, /listLoading && listLoading && subs\.length === 0|plansLoading && listLoading && subs\.length === 0/);
    assert.match(subs, /\{subs\.length > 0 \?/);
  });
});
