/**
 * Phase Web-Admin-A2 — Deprecate manual subscription activation from Admin action UX.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE, canRoleAccessPath } from "./constants/authRoutes.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Web-Admin-A2 — deprecate manual membership activation", () => {
  it("Admin action center does not show طلبات تفعيل الاشتراك", () => {
    const home = read("pages/dashboard/AdminDashboardHome.jsx");
    assert.doesNotMatch(home, /طلبات تفعيل الاشتراك/);
    assert.doesNotMatch(home, /membershipActivations|CreditCard|countKey: "membership"/);
    assert.match(home, /طلبات توثيق الهوية/);
    assert.match(home, /إسناد الباقات/);
    assert.match(home, /بيت المونة/);
    assert.match(home, /المقالات/);
    assert.match(home, /المشاكل والاقتراحات/);
    assert.match(home, /الإشعارات/);
    assert.match(home, /acc-actions-grid--admin-center/);
  });

  it("Admin sidebar omits membership activation items", () => {
    const nav = read("constants/adminNav.js");
    assert.match(
      nav,
      /id: "actionCenter"[\s\S]*?itemKeys: \[\s*"identity",\s*"packageAssignment",\s*"pantry",\s*"articles",\s*"feedback",\s*\]/,
    );
    assert.doesNotMatch(nav, /id: "usersSubscriptions"/);
    assert.doesNotMatch(nav, /key: "membershipActivations"/);
    assert.doesNotMatch(nav, /to: ADMIN_ACTION_ROUTES\.membershipActivations/);

    const mainStart = nav.indexOf("export const ADMIN_NAV_MAIN = resolveAdminNavItems([");
    const mainEnd = nav.indexOf("]);", mainStart);
    assert.ok(mainStart >= 0 && mainEnd > mainStart);
    const mainBlock = nav.slice(mainStart, mainEnd);
    assert.doesNotMatch(mainBlock, /membershipActivations|subscriptionActivation/);
  });

  it("Super Admin primary sidebar omits subscriptionActivation", () => {
    const nav = read("constants/superAdminNav.js");
    assert.match(
      nav,
      /id: "usersSubscriptions"[\s\S]*?itemKeys: \[[^\]]*freelancerActivationRequests[^\]]*subscriptions"\s*\]/,
    );
    assert.doesNotMatch(
      nav,
      /id: "usersSubscriptions"[\s\S]*?itemKeys: \[[^\]]*subscriptionActivation/,
    );
  });

  it("legacy activation routes remain reachable for admin/staff but show deprecation copy", () => {
    assert.equal(canRoleAccessPath("/dashboard/admin/membership-activations", ROLE.ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/admin/subscriptions", ROLE.ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/subscriptions/activation", ROLE.ADMIN), true);

    const page = read("pages/dashboard/AdminSubscriptionsActivationPage.jsx");
    assert.match(page, /membership-activation-deprecated/);
    assert.match(
      page,
      /لم تعد هذه الصفحة مستخدمة في النظام الجديد\. الاشتراكات المدفوعة تُفعّل تلقائيًا عبر\s*Stripe/,
    );
    assert.match(page, /لم تعد هذه الصفحة مستخدمة؛ يتم تفعيل الاشتراكات المدفوعة تلقائيًا عبر الدفع/);
    assert.doesNotMatch(page, /listActivationQueueRequest/);
    assert.doesNotMatch(page, /activateSubscriptionCompanyRequest/);
  });

  it("App still mounts deprecated routes without removing backend API consumers elsewhere", () => {
    const app = read("App.jsx");
    assert.match(app, /path="\/dashboard\/admin\/membership-activations"/);
    assert.match(app, /path="\/dashboard\/admin\/subscriptions"/);
    assert.match(app, /path="\/dashboard\/super-admin\/subscriptions\/activation"/);
    assert.match(app, /AdminSubscriptionsActivationPage/);

    const api = read("services/api.js");
    assert.match(api, /\/admin\/subscriptions\/activation-queue/);
  });

  it("action center summary mapper ignores paidActivationPendingCount for UI", () => {
    const summary = read("lib/staff/adminActionCenterSummary.js");
    assert.doesNotMatch(summary, /membership:/);
    assert.match(summary, /legacy API-only|paidActivationPendingCount is legacy/i);
  });
});
