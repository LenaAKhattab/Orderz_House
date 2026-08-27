/**
 * Web-Admin-A2 — activation queue page replaced by deprecation notice.
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

describe("subscriptions activation page (deprecated)", () => {
  const page = read("src/pages/dashboard/AdminSubscriptionsActivationPage.jsx");

  it("shows Arabic deprecation copy instead of activation queue UI", () => {
    assert.match(page, /membership-activation-deprecated/);
    assert.match(page, /لم تعد هذه الصفحة مستخدمة في النظام الجديد/);
    assert.match(page, /Stripe/);
    assert.match(page, /توثيق الهوية وإكمال التدريب/);
    assert.doesNotMatch(page, /listActivationQueueRequest/);
    assert.doesNotMatch(page, /activateSubscriptionCompanyRequest/);
    assert.doesNotMatch(page, /oh-sa-activation-search/);
  });

  it("keeps activation-queue API helper for legacy/mobile compatibility", () => {
    const api = read("src/services/api.js");
    assert.match(api, /listActivationQueueRequest/);
    assert.match(api, /\/admin\/subscriptions\/activation-queue/);
  });
});
