import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "..");
const read = (rel) => fs.readFileSync(path.join(src, rel), "utf8");
const en = JSON.parse(read("locales/en/referrals.json"));
const ar = JSON.parse(read("locales/ar/referrals.json"));

function flatKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const PAGES = [
  "pages/dashboard/ReferralsDashboardPage.jsx",
  "pages/dashboard/SuperAdminReferralsPage.jsx",
  "pages/ReferralLanding.jsx",
  "utils/referralMoney.js",
];

describe("referrals UI", () => {
  it("keeps Arabic and English referral keys in parity", () => {
    assert.deepEqual(flatKeys(ar).sort(), flatKeys(en).sort());
  });

  it("has no Arabic text in the English referral locale", () => {
    const arabic = flatKeys(en).filter((key) => {
      const value = key.split(".").reduce((o, k) => o[k], en);
      return /[؀-ۿ]/.test(String(value));
    });
    assert.deepEqual(arabic, []);
  });

  it("resolves every static referral translation key used by the pages", () => {
    const keys = new Set(flatKeys(en).map((k) => `referrals.${k}`));
    for (const page of PAGES) {
      const used = [...read(page).matchAll(/t\("(referrals\.[A-Za-z0-9_.]+)"/g)].map((m) => m[1]);
      const missing = used.filter((k) => !keys.has(k));
      assert.deepEqual(missing, [], page);
    }
  });

  it("translates every status, payment type, mode and API error code", () => {
    for (const s of ["pending", "available", "paid", "reversed", "cancelled"]) assert.ok(en.common.commissionStatus[s]);
    for (const s of ["pending", "approved", "paid", "rejected", "cancelled"]) assert.ok(en.common.withdrawalStatus[s]);
    for (const p of ["training_package_purchase", "marketplace_membership_purchase"]) assert.ok(en.common.paymentTypes[p]);
    for (const c of ["BELOW_MINIMUM", "INSUFFICIENT_AVAILABLE", "WITHDRAWAL_ALREADY_OPEN", "PAYOUT_REFERENCE_REQUIRED", "REFERRAL_POLICY_INVALID", "BONUS_RULE_ALREADY_AWARDED"]) {
      assert.ok(en.common.errors[c] && ar.common.errors[c], c);
    }
  });

  it("shows the required non-retroactive warning in Arabic", () => {
    assert.equal(
      ar.admin.confirmBody,
      "سيُطبق هذا الإعداد على الإحالات الجديدة فقط. الإحالات المسجلة سابقاً ستستمر وفق السياسة التي كانت سارية وقت تسجيلها.",
    );
    assert.equal(ar.dashboard.programOffTitle, "برنامج الإحالات غير مفعّل حالياً");
  });

  it("reuses the shared dashboard components instead of raw browser UI", () => {
    const user = read("pages/dashboard/ReferralsDashboardPage.jsx");
    const admin = read("pages/dashboard/SuperAdminReferralsPage.jsx");
    for (const source of [user, admin]) {
      assert.match(source, /DashboardStatCard/);
      assert.match(source, /DashboardTable/);
      assert.match(source, /StatusBadge/);
      assert.doesNotMatch(source, /window\.prompt|JSON\.stringify\(detail/);
    }
    assert.match(admin, /oh-sa-users-drawer/);
    assert.match(admin, /oh-sa-users-modal/);
    assert.match(admin, /ConfirmDialog/);
    assert.match(admin, /Pagination/);
    assert.match(user, /navigator\.share/);
  });

  it("never computes money from floats in the UI beyond display", () => {
    const util = read("utils/referralMoney.js");
    assert.match(util, /minor\) \/ 1000|n \/ 1000/);
    const user = read("pages/dashboard/ReferralsDashboardPage.jsx");
    assert.doesNotMatch(user, /\* 1000|Math\.round/);
  });
});
