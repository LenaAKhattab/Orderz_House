/**
 * Activation queue page — server-side search UI wiring.
 * Run: node --test src/pages/dashboard/subscriptionsActivationSearchUi.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("subscriptions activation search UI", () => {
  const page = read("src/pages/dashboard/AdminSubscriptionsActivationPage.jsx");
  const api = read("src/services/api.js");
  const css = read("src/pages/dashboard/superAdminSubscriptionsPage.css");

  it("renders accessible search bar with clear control and Escape handling", () => {
    assert.match(page, /role="search"/);
    assert.match(page, /البحث عن مستقل/);
    assert.match(page, /ابحث بالاسم أو البريد الإلكتروني/);
    assert.match(page, /oh-sa-activation-search/);
    assert.match(page, /مسح البحث|clearSearch/);
    assert.match(page, /Escape/);
    assert.match(page, /aria-label="البحث عن مستقل"/);
  });

  it("debounces search before requesting and resets page to 1", () => {
    assert.match(page, /SEARCH_DEBOUNCE_MS\s*=\s*350/);
    assert.match(page, /setDebouncedSearch\(searchInput\.trim\(\)\)/);
    assert.match(page, /setPage\(1\)/);
    assert.match(page, /debouncedSearch/);
  });

  it("passes search to listActivationQueueRequest and keeps it on refresh/activate/pagination", () => {
    assert.match(page, /listActivationQueueRequest\(/);
    assert.match(page, /\.\.\.\(debouncedSearch \? \{ search: debouncedSearch \} : \{\}\)/);
    assert.match(page, /onPageChange=\{setPage\}/);
    assert.match(page, /activateSubscriptionCompanyRequest/);
    assert.match(page, /loadQueue\(page,\s*\{\s*soft:\s*true\s*\}\)/);
    assert.match(api, /listActivationQueueRequest\s*=\s*async\s*\(params\s*=\s*\{\},\s*options/);
    assert.match(api, /\/admin\/subscriptions\/activation-queue/);
  });

  it("cancels in-flight requests with AbortController", () => {
    assert.match(page, /AbortController/);
    assert.match(page, /signal:\s*controller\.signal/);
    assert.match(page, /isAxiosCanceledError/);
    assert.match(api, /signal/);
  });

  it("shows search-specific empty state and never Empty with Error together", () => {
    assert.match(page, /لم يتم العثور على نتائج/);
    assert.match(page, /لا يوجد مستقل يطابق الاسم أو البريد الإلكتروني/);
    assert.match(page, /لا توجد اشتراكات بانتظار التفعيل حالياً/);
    assert.match(page, /showSearchEmpty/);
    assert.match(page, /showQueueEmpty/);
    assert.match(page, /\{error \? \([\s\S]*DashboardErrorState/);
    assert.match(page, /showQueueEmpty \? .*DashboardEmptyState/);
    assert.match(page, /!error &&/);
  });

  it("keeps view toggle independent of search and uses soft loading while searching", () => {
    assert.match(page, /setView\("cards"\)/);
    assert.match(page, /setView\("table"\)/);
    assert.match(page, /soft:\s*hasLoadedOnceRef\.current|soft = hasLoadedOnceRef\.current/);
    assert.match(page, /oh-sa-subs-list-loading|جارٍ تحديث النتائج/);
    assert.match(page, /oh-sa-activation-search__spinner/);
  });

  it("styles search for RTL and responsive layout without fixed page-breaking widths", () => {
    assert.match(css, /\.oh-sa-activation-search__/);
    assert.match(css, /inset-inline-start/);
    assert.match(css, /inset-inline-end/);
    assert.match(css, /\[dir="rtl"\]\s*\.oh-sa-activation-search__input/);
    assert.match(css, /max-width:\s*min\(36rem,\s*100%\)/);
    assert.match(css, /@media \(max-width:\s*767px\)/);
  });
});
