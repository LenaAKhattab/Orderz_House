import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("account-deletion public page compliance", () => {
  it("registers public /account-deletion route", () => {
    const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
    assert.match(app, /path="\/account-deletion"/);
    assert.match(app, /AccountDeletion/);
  });

  it("page names Orderz House and explains retention", () => {
    const page = fs.readFileSync(path.join(root, "src/pages/AccountDeletion.jsx"), "utf8");
    const ar = JSON.parse(fs.readFileSync(path.join(root, "src/locales/ar/accountDeletion.json"), "utf8"));
    const en = JSON.parse(fs.readFileSync(path.join(root, "src/locales/en/accountDeletion.json"), "utf8"));

    assert.match(page, /support@orderzhouse\.com/);
    assert.match(page, /mailto:\$\{SUPPORT_EMAIL\}|mailto:/);
    assert.match(page, /public-site-page/);
    assert.ok(ar.title.includes("أوردرز هاوس"));
    assert.ok(en.title.toLowerCase().includes("orderz house"));
    assert.ok(ar.bullets.retention.includes("الطلبات"));
    assert.ok(en.bullets.retention.toLowerCase().includes("orders"));
  });

  it("privacy policy links to account-deletion appendix", () => {
    const privacy = fs.readFileSync(path.join(root, "src/pages/PrivacyPolicy.jsx"), "utf8");
    assert.match(privacy, /\/account-deletion/);
    assert.match(privacy, /PrivacyAccountDeletionAppendix|privacyAppendix/);
  });

  it("does not touch Stripe or ordersService for this page", () => {
    const page = fs.readFileSync(path.join(root, "src/pages/AccountDeletion.jsx"), "utf8");
    assert.doesNotMatch(page, /Stripe|ordersService/i);
  });
});
