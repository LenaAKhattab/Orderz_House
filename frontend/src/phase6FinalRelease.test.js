/**
 * UI/UX Phase 6 — final release pass contracts: no unscoped physical alignment left, neutral held-offer status,
 * navigation guards, and no duplicate / looping API requests.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { shareInFlight } from "./services/shareInFlight.js";
import { formatAdminDateTime, formatJoDateTime } from "./pages/dashboard/trainingOrders/trainingOrdersDisplayUtils.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8").replace(/\r\n/g, "\n");
const json = (p) => JSON.parse(read(p));
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".css")) out.push(p);
  }
  return out;
}

describe("final RTL/LTR pass", () => {
  it("no rule right-aligns text in both languages (Arabic alignment is scoped to [dir=rtl])", () => {
    const offenders = [];
    for (const f of walk(here)) {
      for (const m of readFileSync(f, "utf8").matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
        if (!sel || sel.startsWith("@") || /\[dir|:dir\(|\.rtl\b|\[lang/i.test(sel)) continue;
        if (/text-align\s*:\s*right/i.test(m[2])) offenders.push(`${relative(here, f).split(sep).join("/")}: ${sel.slice(0, 60)}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});

describe("navigation guards mirror the router", () => {
  it("super-admin-only pages are not offered to admins; referrals deep link returns after login", async () => {
    const { canRoleAccessPath, ROLE } = await import("./constants/authRoutes.js");
    for (const p of ["users", "referrals", "account-restrictions", "rate-limit-exemptions", "feedback", "feedback/topics", "notifications", "settings", "onboarding"]) {
      const path = `/dashboard/super-admin/${p}`;
      assert.equal(canRoleAccessPath(path, ROLE.SUPER_ADMIN), true, path);
      assert.equal(canRoleAccessPath(path, ROLE.ADMIN), false, path);
    }
    assert.equal(canRoleAccessPath("/dashboard/super-admin/orders", ROLE.ADMIN), true, "permission-delegated pages unchanged");
    assert.equal(canRoleAccessPath("/dashboard/referrals", ROLE.CLIENT), true);
    assert.equal(canRoleAccessPath("/dashboard/referrals", ROLE.FREELANCER), true);
    assert.equal(canRoleAccessPath("/dashboard/referrals", ROLE.ADMIN), false);
  });
});

describe("restricted / held offers", () => {
  it("a held offer shows a neutral 'under review' status (no moderation reasons)", () => {
    const page = read("pages/dashboard/FreelancerOrderDetailsPage.jsx");
    assert.ok(page.includes("order?.myBid?.underReview"));
    assert.ok(page.includes('t("freelancerDashboard.orders.bidUnderReview")'));
    const ar = json("locales/ar/freelancerDashboard.json").orders.bidUnderReview;
    const en = json("locales/en/freelancerDashboard.json").orders.bidUnderReview;
    assert.ok(ar.includes("قيد المراجعة") && en.includes("reviewed"));
    for (const text of [ar, en]) assert.ok(!/قيد|restrict|moderat|حظر|مقيد/i.test(text.replace("قيد المراجعة", "")), text);
  });
});

describe("network: no duplicate or looping requests", () => {
  it("concurrent identical reads share one request; nothing is cached after it settles", async () => {
    let calls = 0;
    const run = () => new Promise((r) => setTimeout(() => r(++calls), 5));
    const [a, b] = await Promise.all([shareInFlight("k", run), shareInFlight("k", run)]);
    assert.equal(calls, 1);
    assert.equal(a, b);
    assert.equal(await shareInFlight("k", run), 2, "a later call fetches fresh data");
    assert.equal(await shareInFlight("other", run), 3, "different keys do not share");
    await assert.rejects(shareInFlight("k", () => Promise.reject(new Error("x"))));
    assert.equal(await shareInFlight("k", run), 4, "a failed request is not reused");
  });

  it("duplicated dashboard reads go through shareInFlight", () => {
    assert.ok(read("services/notificationsApi.js").includes('shareInFlight("notifications:unread-count"'));
    const api = read("services/api.js");
    for (const key of ["public:marketplace-membership-plans", "freelancer:membership-checkout-attempts", "institution:membership", "public:popup-ads:", "portal:done-projects:"]) {
      assert.ok(api.includes(key), key);
    }
    assert.ok(read("services/referralsApi.js").includes("referrals:overview:"));
    assert.ok(read("hooks/useSuperAdminDashboardHomeBundle.js").includes("executiveLoading || executiveAbortRef.current"));
  });

  it("plans page: the checkout-attempts loader does not depend on the caller's inline membership callback", () => {
    const src = read("hooks/useMarketplaceMembershipCheckout.js");
    assert.ok(src.includes("onMembershipUpdatedRef.current(snap);"));
    const body = src.slice(src.indexOf("const refreshMembership = useCallback"), src.indexOf("const refreshCheckoutAttempts"));
    assert.match(body, /\}, \[user\?\.id\]\);/);
    assert.ok(!body.includes("[onMembershipUpdated"));
  });

  it("articles translator is stable (it is an effect dependency of the article page loader)", () => {
    const src = read("admin/marketplaceArticles/useArticlesT.js");
    assert.ok(src.includes("useCallback((key, values) => baseT(`articles.${key}`, values), [baseT])"));
  });
});

describe("payment trust: membership status load failure", () => {
  it("a failed membership load is not presented as 'no active membership' (would invite a duplicate purchase)", () => {
    const src = read("components/freelancer/FreelancerMarketplaceMembershipCard.jsx");
    const errBranch = src.slice(src.indexOf("if (error && !snapshot)"), src.indexOf("const snap = snapshot;"));
    assert.ok(errBranch.includes("marketplaceMembership.loadErrorTitle") && !errBranch.includes("marketplaceMembership.none"));
    for (const l of ["ar", "en"]) {
      const m = json(`locales/${l}/freelancerDashboard.json`).marketplaceMembership;
      assert.ok(m.loadErrorTitle && m.loadErrorHint, l);
    }
  });
});

describe("training orders admin: one date format per page", () => {
  it("round cards / rounds table use the UI-locale format (status bar already did): no 10/28 vs 28/10 on one page", () => {
    const iso = "2026-10-28T08:44:00Z";
    assert.equal(formatAdminDateTime(iso, "ar"), formatJoDateTime(iso, "ar"));
    assert.equal(formatAdminDateTime(iso, "en"), formatJoDateTime(iso, "en"));
    assert.ok(!/AM|PM/.test(formatAdminDateTime(iso, "ar")));
    assert.equal(formatAdminDateTime("not-a-date", "ar"), "—");
    for (const f of ["TrainingOrdersOverviewPage.jsx", "TrainingOrderRoundsSection.jsx"]) {
      const src = read(`pages/dashboard/trainingOrders/${f}`);
      assert.ok(!/formatAdminDateTime\([^,)]+\)/.test(src), `${f}: every call passes the UI locale`);
    }
  });
});
