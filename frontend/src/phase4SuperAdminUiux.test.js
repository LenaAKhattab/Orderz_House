import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const json = (p) => JSON.parse(read(p));

describe("UI/UX Phase 4 — Super Admin", () => {
  it("marketplace plan cards own their stylesheet (unstyled on direct load before)", () => {
    assert.match(read("admin/marketplaceMembership/MarketplaceMembershipPlanCard.jsx"), /import "\.\/marketplace-membership-plans\.css";/);
  });

  it("admin page headers use the compact control-center pattern", () => {
    const header = read("components/dashboard/DashboardPageHeader.jsx");
    for (const hook of ["dph__crumbs", "dph__eyebrow", "dph__title", "dph__desc"]) assert.match(header, new RegExp(hook));
    const css = read("styles/adminDashboardHub.css");
    assert.match(css, /\.oh-sa-outlet \[data-dashboard-header\] \.dph__eyebrow \{\s*display: none;/);
    assert.match(css, /\.oh-sa-outlet \[data-dashboard-header\] \.dph__title \{/);
  });

  it("topbar breadcrumb names every main Super Admin page", () => {
    const nav = read("constants/superAdminNav.js");
    for (const seg of ["/account-restrictions", "/referrals", "/pantry", "/notifications", "/settings"]) {
      assert.ok(nav.includes(`pathname.includes("${seg}")`), seg);
    }
  });

  it("identity queue uses the shared table, status badges and the UI locale for dates", () => {
    const page = read("pages/dashboard/SuperAdminFreelancerActivationRequestsPage.jsx");
    assert.match(page, /className="dash-ui-table /);
    assert.match(page, /<StatusBadge tone=\{KYC_STATUS_TONE\[row\.status\]/);
    assert.match(page, /formatDate\(row\.submittedAt, locale\)/);
    assert.ok(!/<table style=/.test(page));
  });

  it("user drawer never claims 'no restriction' before the check returns", () => {
    const page = read("pages/dashboard/SuperAdminUsersPage.jsx");
    assert.match(page, /const \[restrictionStatus, setRestrictionStatus\] = useState\("loading"\)/);
    assert.match(page, /restrictionStatus === "ready" \?/);
    for (const l of ["ar", "en"]) {
      const r = json(`locales/${l}/accountRestrictions.json`);
      assert.ok(r.checking && r.checkFailed, l);
    }
  });

  it("admin requests table shows operational, translated columns (no raw dev fields)", () => {
    const page = read("pages/dashboard/AdminOrdersPage.jsx");
    for (const raw of ['"assignedFreelancerId",', '"createdAt",', '"files",', '"skills",', "String(Boolean(o.isOpenForPool))"]) {
      assert.ok(!page.includes(raw), raw);
    }
    assert.match(page, /formatOrderProjectType\(o\.projectType, t\)/);
    assert.match(page, /formatOrderDuration\(o, locale, t\)/);
    assert.match(read("styles/adminDashboardHub.css"), /\.oh-sa-outlet \.oh-internal-orders__list \.oh-pool-card \{\s*min-height: 0;/);
  });

  it("admins no longer call the Super Admin-only campaigns endpoint", () => {
    assert.match(read("components/admin/MarketplaceArticlesAdminPanel.jsx"), /canEditPackageRequirements \? listSuperAdminActivationCampaignsRequest\(\)/);
  });

  it("subscription row actions stay compact inside the admin shell", () => {
    assert.match(read("pages/dashboard/superAdminSubscriptionsPage.css"), /\.oh-sa-outlet \.oh-sa-subs-actions--compact \.btn\.oh-sa-subs-actions__btn \{/);
  });

  it("users/restrictions tables align with the UI direction", () => {
    assert.ok(!/text-align: right;/.test(read("pages/dashboard/superAdminUsersPage.css")));
  });
});
