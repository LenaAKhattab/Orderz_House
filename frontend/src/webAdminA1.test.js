/**
 * Phase Web-Admin-A1 — Web Admin action dashboard (Flutter Super Admin parity).
 * Web-Admin-A2: manual membership activation removed from action center/nav.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE, canRoleAccessPath } from "./constants/authRoutes.js";
import { ADMIN_ACTION_ROUTES } from "./lib/staff/staffDashboardPaths.js";
import {
  countPendingKycIdentity,
  countArticlesAttention,
  countFeedbackNew,
  bidCollectionNeedsAttention,
} from "./lib/staff/adminActionCenterCounts.js";
import {
  mapActionCenterSummary,
  mergeCountsPreservingPrevious,
  EMPTY_ACTION_CENTER_COUNTS,
} from "./lib/staff/adminActionCenterSummary.js";
import {
  countPaidSubscriptionActivations,
  isPaidSubscriptionActivationActionable,
} from "./admin/subscriptions/subscriptionAdminDisplay.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Web-Admin-A1 routes and guards", () => {
  const actionPaths = [
    ADMIN_ACTION_ROUTES.home,
    ADMIN_ACTION_ROUTES.actionCenter,
    ADMIN_ACTION_ROUTES.identity,
    ADMIN_ACTION_ROUTES.membershipActivations,
    ADMIN_ACTION_ROUTES.packageAssignment,
    ADMIN_ACTION_ROUTES.pantry,
    ADMIN_ACTION_ROUTES.articles,
    ADMIN_ACTION_ROUTES.feedback,
    ADMIN_ACTION_ROUTES.notifications,
  ];

  it("admin can access action routes; freelancer/client cannot", () => {
    for (const p of actionPaths) {
      assert.equal(canRoleAccessPath(p, ROLE.ADMIN), true, p);
      assert.equal(canRoleAccessPath(p, ROLE.FREELANCER), false, p);
      assert.equal(canRoleAccessPath(p, ROLE.CLIENT), false, p);
    }
  });

  it("App.jsx mounts admin action pages under /dashboard/admin/*", () => {
    const app = read("App.jsx");
    assert.match(app, /path="\/dashboard\/admin\/action-center"/);
    assert.match(app, /path="\/dashboard\/admin\/identity"/);
    assert.match(app, /path="\/dashboard\/admin\/membership-activations"/);
    assert.match(app, /path="\/dashboard\/admin\/package-assignment"/);
    assert.match(app, /path="\/dashboard\/admin\/articles"/);
    assert.match(app, /path="\/dashboard\/admin\/feedback"/);
    assert.match(app, /path="\/dashboard\/admin\/pantry"/);
    assert.match(app, /AdminArticlesReviewPage/);
    assert.match(app, /SuperAdminFreelancerActivationRequestsPage/);
    assert.match(app, /SuperAdminSubscriptionsPage/);
    assert.match(app, /SuperAdminFeedbackPage/);
  });

  it("admin nav exposes Arabic action labels keys without membership activations", () => {
    const nav = read("constants/adminNav.js");
    assert.match(nav, /dashboard\.nav\.admin\.actionCenter/);
    assert.match(nav, /dashboard\.nav\.admin\.identity/);
    assert.doesNotMatch(nav, /key: "membershipActivations"/);
    assert.doesNotMatch(nav, /to: ADMIN_ACTION_ROUTES\.membershipActivations/);
    assert.match(nav, /itemKeys: \[\s*"identity",\s*"packageAssignment"/);
    assert.match(nav, /dashboard\.nav\.admin\.packageAssignment/);
    assert.match(nav, /dashboard\.nav\.admin\.pantry/);
    assert.match(nav, /dashboard\.nav\.admin\.articles/);
    assert.match(nav, /dashboard\.nav\.admin\.feedback/);
    const ar = read("locales/ar/dashboard.json");
    assert.match(ar, /"actionCenter": "مركز المهام"/);
    assert.match(ar, /"identity": "طلبات توثيق الهوية"/);
    assert.match(ar, /"packageAssignment": "إسناد الباقات"/);
  });

  it("admin does not mount dangerous system tools", () => {
    const app = read("App.jsx");
    assert.doesNotMatch(app, /path="\/dashboard\/admin\/.*migration/);
    assert.doesNotMatch(app, /path="\/dashboard\/admin\/.*deploy/);
    assert.doesNotMatch(app, /path="\/dashboard\/admin\/.*seed/);
    const nav = read("constants/adminNav.js");
    assert.doesNotMatch(nav, /migration|deploy|seed|env\/secret/i);
  });

  it("Action Center home renders for admin without membership activation card", () => {
    const home = read("pages/dashboard/AdminDashboardHome.jsx");
    assert.doesNotMatch(home, /DashboardPageHeader/);
    assert.doesNotMatch(home, /title="مركز المهام"/);
    assert.match(home, /admin-action-center/);
    assert.match(home, /acc-actions-grid--admin-center/);
    assert.match(home, /acc-action-card__count/);
    assert.match(home, /getAdminActionCenterSummaryRequest/);
    assert.match(home, /mapActionCenterSummary/);
    assert.match(home, /acc-counts-soft-note/);
    assert.match(home, /لم نتمكن من تحديث العدادات الآن/);
    assert.match(home, /بعض العدادات لم تُحدّث الآن/);
    assert.match(home, /AbortController/);
    assert.match(home, /readActionCenterCountsCache|writeActionCenterCountsCache/);
    assert.match(home, /SUMMARY_TIMEOUT_MS = 15000/);
    assert.doesNotMatch(home, /تعذر تحميل بعض عدّادات مركز المهام/);
    assert.doesNotMatch(home, /admin-action-fatal-error/);
    assert.doesNotMatch(home, /acc-notice--error/);
    assert.doesNotMatch(home, /failed \? "—"/);
    assert.doesNotMatch(home, /listActivationQueueRequest/);
    assert.doesNotMatch(home, /err\?\.message/);
    assert.doesNotMatch(home, /طلبات تفعيل الاشتراك/);
    assert.doesNotMatch(home, /id: "membership"/);
    assert.match(home, /طلبات توثيق الهوية/);
    assert.match(home, /إسناد الباقات/);
    assert.match(home, /بيت المونة/);
    assert.match(home, /المقالات/);
    assert.match(home, /المشاكل والاقتراحات/);
    assert.match(home, /الإشعارات/);
  });

  it("action center styles use 3-column grid and red counts", () => {
    const css = read("styles/adminControlCenter.css");
    assert.match(css, /\.admin-ops-home \.acc-actions-grid--admin-center/);
    assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, /\.admin-ops-home \.acc-action-card__count[\s\S]*color:\s*#dc2626/);
    assert.match(css, /\.admin-ops-home \.acc-counts-soft-note/);
  });

  it("api exposes action-center summary helper with 15s timeout", () => {
    const api = read("services/api.js");
    assert.match(api, /getAdminActionCenterSummaryRequest/);
    assert.match(api, /\/admin\/action-center\/summary/);
    assert.match(api, /timeout = 15000/);
    assert.doesNotMatch(api, /getAdminActionCenterSummaryRequest[\s\S]*timeout = 8000/);
  });

  it("notifications select/delete does not rely on opening detail", () => {
    const page = read("pages/dashboard/NotificationsPage.jsx");
    assert.match(page, /canSelectDelete/);
    assert.match(page, /stopPropagation/);
    assert.match(page, /deleteNotificationsBulkRequest|deleteNotificationRequest/);
    assert.match(page, /notification-select/);
    assert.match(page, /ConfirmDialog/);
    assert.match(page, /confirmDeleteOpen/);
  });
});

describe("Web-Admin-A1 count helpers (no misleading free/legacy totals)", () => {
  it("identity count uses pending_review only", () => {
    assert.equal(
      countPendingKycIdentity([
        { status: "pending_review" },
        { status: "approved" },
        { status: "pending_review" },
      ]),
      2,
    );
  });

  it("paid activation count excludes free/starter and admin-assigned", () => {
    const rows = [
      {
        planName: "PRO",
        paymentStatus: "paid",
        activationStatus: "company_pending",
        source: "checkout",
      },
      {
        planName: "STARTER",
        paymentStatus: "not_required",
        activationStatus: "company_pending",
        source: "system",
      },
      {
        planName: "SILVER",
        paymentStatus: "paid",
        activationStatus: "company_pending",
        source: "admin",
        assignedByUserId: "9",
        notes: "manual",
      },
      {
        planName: "orderzhouse_free",
        paymentStatus: "not_required",
        activationStatus: "company_pending",
        notes: "auto_default_free_plan",
      },
    ];
    assert.equal(isPaidSubscriptionActivationActionable(rows[0]), true);
    assert.equal(isPaidSubscriptionActivationActionable(rows[1]), false);
    assert.equal(isPaidSubscriptionActivationActionable(rows[2]), false);
    assert.equal(countPaidSubscriptionActivations(rows), 1);
  });

  it("articles attention uses bidCollection.needsAttention", () => {
    assert.equal(
      countArticlesAttention({
        data: {
          articles: [
            { id: 1, bidCollection: { needsAttention: true } },
            { id: 2, bidCollection: { needsAttention: false } },
          ],
        },
      }),
      1,
    );
  });

  it("articles attention derives from status/outcome when needsAttention missing", () => {
    assert.equal(bidCollectionNeedsAttention({ status: "eligible_for_assignment" }), true);
    assert.equal(bidCollectionNeedsAttention({ status: "assigned" }), false);
    assert.equal(
      countArticlesAttention({
        data: {
          articles: [
            { id: 1, bidCollection: { status: "minimum_not_met" } },
            { id: 2, bidCollection: { status: "collecting" } },
          ],
        },
      }),
      1,
    );
  });

  it("feedback new count prefers summary.new", () => {
    assert.equal(countFeedbackNew({ data: { summary: { new: 4 }, feedback: [] } }), 4);
  });
});

describe("Web-Admin-A1 action center summary mapping", () => {
  it("maps successful summary counts without membership or dash placeholders", () => {
    const mapped = mapActionCenterSummary({
      success: true,
      data: {
        identityPendingCount: 3,
        paidActivationPendingCount: 2,
        pantryPendingCount: 1,
        articlesPendingCount: 4,
        feedbackPendingCount: 5,
        unreadNotificationsCount: 6,
        partialErrors: [],
      },
    });
    assert.deepEqual(mapped.counts, {
      identity: 3,
      pantry: 1,
      articles: 4,
      feedback: 5,
      notifications: 6,
    });
    assert.equal(mapped.counts.membership, undefined);
    assert.equal(mapped.partialErrors.length, 0);
    assert.equal(mapped.allFailed, false);
    assert.doesNotMatch(JSON.stringify(mapped.counts), /—/);
  });

  it("partial failure keeps other counts and marks soft errors only", () => {
    const mapped = mapActionCenterSummary({
      data: {
        identityPendingCount: 2,
        paidActivationPendingCount: 0,
        pantryPendingCount: 7,
        articlesPendingCount: 0,
        feedbackPendingCount: 1,
        unreadNotificationsCount: 0,
        partialErrors: [
          { key: "articlesPendingCount", error: "timeout" },
          { key: "unreadNotificationsCount", error: "timeout" },
        ],
      },
    });
    assert.equal(mapped.counts.identity, 2);
    assert.equal(mapped.counts.pantry, 7);
    assert.equal(mapped.counts.articles, 0);
    assert.equal(mapped.counts.notifications, 0);
    assert.deepEqual(mapped.partialErrors, ["articles", "notifications"]);
    assert.equal(mapped.allFailed, false);
  });

  it("refresh merge preserves previous values for missing keys", () => {
    const prev = { ...EMPTY_ACTION_CENTER_COUNTS, identity: 9, pantry: 4 };
    const next = { ...EMPTY_ACTION_CENTER_COUNTS, identity: 1 };
    const merged = mergeCountsPreservingPrevious(prev, next);
    assert.equal(merged.identity, 1);
    assert.equal(merged.pantry, 0);
  });

  it("session cache helpers round-trip counts with TTL", async () => {
    const store = new Map();
    globalThis.sessionStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    const {
      readActionCenterCountsCache,
      writeActionCenterCountsCache,
      ACTION_CENTER_COUNTS_CACHE_TTL_MS,
    } = await import("./lib/staff/adminActionCenterCountsCache.js");
    writeActionCenterCountsCache(
      { ...EMPTY_ACTION_CENTER_COUNTS, identity: 11, feedback: 3 },
      { now: 1_000 },
    );
    const hit = readActionCenterCountsCache({ now: 1_000 + 1_000, ttlMs: ACTION_CENTER_COUNTS_CACHE_TTL_MS });
    assert.equal(hit.counts.identity, 11);
    assert.equal(hit.counts.feedback, 3);
    const miss = readActionCenterCountsCache({
      now: 1_000 + ACTION_CENTER_COUNTS_CACHE_TTL_MS + 1,
      ttlMs: ACTION_CENTER_COUNTS_CACHE_TTL_MS,
    });
    assert.equal(miss, null);
  });
});
