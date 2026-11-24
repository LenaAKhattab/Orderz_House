/**
 * Smart Orders S5/S6 — Admin finance UI contracts: money blocks never mix currencies, reward weights in integer
 * hundredths, gated policies need an approval reference, permission-gated actions, unsupported orders,
 * routes/nav/permissions and five-language completeness.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canRoleAccessPath } from "./constants/authRoutes.js";
import {
  buildMoneyBlocks,
  buildPolicyConfig,
  buildWeightsPayload,
  evaluateWeights,
  expectedSettlementVersion,
  financeCapabilities,
  financeTabFromQuery,
  financeTabsFor,
  hundredthsOf,
  isValidAmount,
  policyNeedsApproval,
  settlementViewState,
  validatePolicyDraft,
} from "./components/orders/smart/financeUtils.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));
const LOCALES = ["ar", "en", "de", "nl", "ro"];
const KEYS = {
  financeView: "dashboard.admin.finance_view",
  financeManage: "dashboard.admin.finance_manage",
  financePolicy: "dashboard.admin.finance_policy",
  rewardManage: "dashboard.admin.reward_manage",
  payoutApprove: "dashboard.admin.payout_approve",
  orders: "dashboard.admin.orders",
  createOrder: "dashboard.admin.create_order",
};

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

describe("report money blocks", () => {
  const money = {
    quotedUnpaid: [
      { currency: "JOD", count: 2, amount: "150.000" },
      { currency: "AED", count: 1, amount: "700.000" },
    ],
    receivedQuotePayments: [
      { currency: "JOD", count: 1, amount: "100.000" },
      { currency: "AED", count: 3, amount: "900.000" },
    ],
    unallocatedReceipts: [{ currency: "AED", count: 1, amount: "50.000" }],
    receivedClientMarketplace: { currency: "JOD", count: 4, amount: "80.000" },
    settled: { baseCurrency: "JOD", count: 1, gross: "100.000", net: "90.000", companyShare: "20.000" },
  };
  const blocks = buildMoneyBlocks(money);

  it("keeps quoted / received / settled as three separate blocks", () => {
    assert.deepStrictEqual(Object.keys(blocks), ["quoted", "received", "settled"]);
    assert.strictEqual(blocks.quoted.length, 2);
    assert.strictEqual(blocks.received.quotePayments.length, 2);
    assert.strictEqual(blocks.received.unallocated.length, 1);
    assert.deepStrictEqual(blocks.received.clientMarketplace, { currency: "JOD", count: 4, amount: "80.000" });
    assert.strictEqual(blocks.settled.baseCurrency, "JOD");
  });

  it("never sums across currencies: one row per currency, amounts passed through verbatim", () => {
    for (const rows of [blocks.quoted, blocks.received.quotePayments]) {
      assert.deepStrictEqual(rows.map((r) => r.currency), ["JOD", "AED"]);
    }
    assert.strictEqual(blocks.quoted.find((r) => r.currency === "AED").amount, "700.000");
    assert.strictEqual(blocks.received.quotePayments.find((r) => r.currency === "JOD").amount, "100.000");
  });

  it("the report tab renders the three blocks with their own test ids and no money arithmetic", () => {
    const src = read("pages/dashboard/finance/FinanceReportTab.jsx");
    for (const id of ["finance-money-quoted", "finance-money-received", "finance-money-settled", "finance-report-whatsapp-intake"]) {
      assert.match(src, new RegExp(`data-testid="${id}"`));
    }
    assert.doesNotMatch(src, /parseFloat|Number\(r\.amount|\.reduce\(/);
  });
});

describe("reward weights (integer hundredths)", () => {
  it("parses percent strings without floats", () => {
    assert.strictEqual(hundredthsOf("33.33"), 3333);
    assert.strictEqual(hundredthsOf("50"), 5000);
    assert.strictEqual(hundredthsOf("0.1"), 10);
    assert.strictEqual(hundredthsOf("1.234"), null);
    assert.strictEqual(hundredthsOf("abc"), null);
  });
  it("33.33 + 33.33 + 33.34 = 100.00 → valid", () => {
    const r = evaluateWeights([
      { userId: "1", percent: "33.33" },
      { userId: "2", percent: "33.33" },
      { userId: "3", percent: "33.34" },
    ]);
    assert.strictEqual(r.totalHundredths, 10000);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.totalLabel, "100.00");
  });
  it("50 + 49.99 → invalid", () => {
    const r = evaluateWeights([
      { userId: "1", percent: "50" },
      { userId: "2", percent: "49.99" },
    ]);
    assert.strictEqual(r.totalHundredths, 9999);
    assert.strictEqual(r.valid, false);
  });
  it("rejects duplicates and zero weights; payload normalized to 2 decimals", () => {
    assert.strictEqual(evaluateWeights([{ userId: "1", percent: "50" }, { userId: "1", percent: "50" }]).valid, false);
    assert.strictEqual(evaluateWeights([{ userId: "1", percent: "100" }, { userId: "2", percent: "0" }]).valid, false);
    assert.deepStrictEqual(buildWeightsPayload([{ userId: 7, percent: "33.3" }]), [{ userId: "7", percent: "33.30" }]);
  });
  it("rewards tab shows the policy-disabled banner and blocks approval while disabled", () => {
    const src = read("pages/dashboard/finance/FinanceRewardsTab.jsx");
    assert.match(src, /finance-reward-policy-disabled/);
    assert.match(src, /rewards\.previewOnly/);
    assert.match(src, /disabled=\{busy \|\| !policyActive \|\| !preview\.weightsValid\}/);
    assert.match(src, /copy-previous/);
    const en = json("locales/en/smartOrders.json");
    assert.strictEqual(en.finance.rewards.previewOnly, "Preview only — approval is blocked until management activates the policy.");
  });
});

describe("policies", () => {
  it("gated policies need an approval reference when activating", () => {
    for (const key of ["vat", "revenue_split", "quality_checks", "employee_reward_pool"]) {
      assert.strictEqual(policyNeedsApproval(key, "active"), true, key);
      assert.strictEqual(policyNeedsApproval(key, "disabled"), false, key);
    }
    assert.strictEqual(policyNeedsApproval("payment_fees", "active"), false);
    assert.strictEqual(validatePolicyDraft("vat", { status: "active", config: { ratePercent: "16" }, approvalReference: "" }), "approvalRequired");
    assert.strictEqual(validatePolicyDraft("vat", { status: "active", config: { ratePercent: "16" }, approvalReference: "BOARD-2026-11" }), null);
    assert.strictEqual(validatePolicyDraft("vat", { status: "disabled", config: { ratePercent: "16" }, approvalReference: "" }), null);
  });
  it("core policies cannot be disabled; percent bounds are checked as strings", () => {
    assert.strictEqual(validatePolicyDraft("payment_fees", { status: "disabled", config: {} }), "locked");
    assert.strictEqual(validatePolicyDraft("revenue_split", { status: "disabled", config: { freelancerPercentOfNet: "100.01" } }), "config");
    assert.deepStrictEqual(buildPolicyConfig("vat", { ratePercent: " 16 " }), { ratePercent: "16", pricesIncludeTax: true });
  });
  it("policies tab shows the gated + base-currency notice and hides edit without finance_policy", () => {
    const src = read("pages/dashboard/finance/FinancePoliciesTab.jsx");
    assert.match(src, /finance-policies-gated-notice/);
    assert.match(src, /noticeBaseCurrency/);
    assert.match(src, /canChange && key !== "base_currency"/);
  });
});

describe("permissions", () => {
  const none = financeCapabilities(() => false, KEYS);
  const viewer = financeCapabilities((k) => k === KEYS.financeView, KEYS);
  const superAdmin = financeCapabilities(() => true, KEYS);

  it("capabilities follow the permission check", () => {
    assert.deepStrictEqual(Object.values(none).some(Boolean), false);
    assert.strictEqual(viewer.view, true);
    assert.strictEqual(viewer.manage, false);
    assert.strictEqual(superAdmin.payout, true);
  });
  it("tabs: everyone gets My rewards; finance tabs need finance_view, pool needs reward_manage", () => {
    assert.deepStrictEqual(financeTabsFor(none), ["mine"]);
    assert.deepStrictEqual(financeTabsFor(viewer), ["report", "policies", "fx", "exceptions", "mine"]);
    assert.ok(financeTabsFor(superAdmin).includes("rewards"));
    assert.strictEqual(financeTabFromQuery("myRewards"), "mine");
    assert.strictEqual(financeTabFromQuery("fx"), "fx");
    assert.strictEqual(financeTabFromQuery("__proto__"), "");
  });
  it("order finance panel hides every write action without finance_manage / create_order", () => {
    const src = read("components/orders/smart/AdminOrderFinancePanel.jsx");
    for (const id of ["finance-close-settlement", "finance-cost-form", "finance-adjustment-form"]) {
      assert.match(src, new RegExp(`\\{caps\\.manage \\? \\(\\s*<(div|form)[^>]*data-testid="${id}"`), id);
    }
    assert.match(src, /canResolve=\{caps\.manage\}/);
    assert.match(src, /!it\.removedAt && caps\.createOrder/);
    assert.match(src, /\{caps\.createOrder \? \(/);
    const page = read("pages/dashboard/AdminOrdersPage.jsx");
    assert.match(page, /canViewFinance = userHasPermission\(user, ADMIN_PAGE_PERMISSIONS\.financeView\)/);
    assert.match(page, /\{canViewFinance \? \(\s*<AdminOrderFinancePanel/);
  });
  it("finance permissions are assignable and the finance routes are staff-only", () => {
    const perms = read("constants/dashboardPermissions.js");
    for (const k of ["financeView", "financeManage", "financePolicy", "rewardManage", "payoutApprove"]) {
      assert.match(perms, new RegExp(`ADMIN_PAGE_PERMISSIONS\\.${k},`));
    }
    assert.strictEqual(canRoleAccessPath("/dashboard/admin/finance", "admin"), true);
    assert.strictEqual(canRoleAccessPath("/dashboard/super-admin/finance", "super_admin"), true);
    assert.strictEqual(canRoleAccessPath("/dashboard/admin/finance", "client"), false);
    assert.strictEqual(canRoleAccessPath("/dashboard/super-admin/finance", "freelancer"), false);
  });
});

describe("settlement panel states", () => {
  it("supported:false shows the info message instead of the breakdown", () => {
    assert.strictEqual(settlementViewState({ supported: false, reason: "client_marketplace_existing_rules" }), "unsupported");
    assert.strictEqual(settlementViewState({ supported: true }), "breakdown");
    assert.strictEqual(settlementViewState(null), "loading");
    const src = read("components/orders/smart/AdminOrderFinancePanel.jsx");
    assert.match(src, /viewState === "unsupported" \? \(\s*<FinanceNotice tone="info" testId="finance-unsupported">/);
    assert.match(src, /viewState === "breakdown" \?/);
  });
  it("close sends expectedVersion = latest version or 0", () => {
    assert.strictEqual(expectedSettlementVersion({ latestSettlement: null }), 0);
    assert.strictEqual(expectedSettlementVersion({ latestSettlement: { version: 3 } }), 3);
  });
  it("amount validation is string based; corrections may be negative", () => {
    assert.strictEqual(isValidAmount("12.5"), true);
    assert.strictEqual(isValidAmount("-3"), false);
    assert.strictEqual(isValidAmount("-3", { allowNegative: true }), true);
    assert.strictEqual(isValidAmount("0"), false);
  });
});

describe("five-language S5/S6 strings", () => {
  const en = flatten(json("locales/en/smartOrders.json"));
  const keys = Object.keys(en).filter((k) => k.startsWith("finance."));
  const codes = Object.keys(json("locales/en/apiErrors.json").codes).filter((c) => /^(FINANCE_|REWARD_|SMART_ORDER_ITEM)/.test(c));
  for (const loc of LOCALES) {
    it(`${loc}: finance keys, error codes, permission labels, notification`, () => {
      const m = flatten(json(`locales/${loc}/smartOrders.json`));
      const ph = (s) => (String(s).match(/\{\{\w+\}\}/g) || []).sort().join(",");
      for (const key of keys) {
        assert.ok(String(m[key] || "").trim(), `${loc}:${key}`);
        assert.strictEqual(ph(m[key]), ph(en[key]), `${loc}:${key}`);
      }
      const c = json(`locales/${loc}/apiErrors.json`).codes;
      assert.ok(codes.length >= 41);
      for (const code of codes) assert.ok(String(c[code] || "").trim(), `${loc}:${code}`);
      const nav = json(`locales/${loc}/dashboard.json`).nav.superAdmin;
      for (const k of ["finance", "financeView", "financeManage", "financePolicy", "rewardManage", "payoutApprove"]) {
        assert.ok(String(nav[k] || "").trim(), `${loc}:nav.${k}`);
      }
      assert.ok(json(`locales/${loc}/notificationTypes.json`).types.finance_reward_approved.title);
    });
  }
});
