/**
 * Phase 1C.4A — Admin/Super Admin operational dashboard contracts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE, canRoleAccessPath } from "./constants/authRoutes.js";
import { resolveSafeInternalNavPath } from "./utils/safeInternalNavPath.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Phase 1C.4A admin operational routes", () => {
  it("admin settings renders for admin; super-admin-only pages deny admin", () => {
    const app = read("App.jsx");
    assert.match(app, /path="\/dashboard\/admin\/settings"/);
    assert.match(app, /<AdminSettingsPage \/>/);
    assert.equal(canRoleAccessPath("/dashboard/admin/settings", ROLE.ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/admin/settings", ROLE.FREELANCER), false);
    const saOnly = [
      "/dashboard/super-admin/training-packages",
      "/dashboard/super-admin/marketplace-articles",
      "/dashboard/super-admin/freelancer-activation",
      "/dashboard/super-admin/bid-credits",
      "/dashboard/super-admin/onboarding",
      "/dashboard/super-admin/marketplace-economy",
      "/dashboard/super-admin/plans",
    ];
    for (const p of saOnly) {
      assert.equal(canRoleAccessPath(p, ROLE.SUPER_ADMIN), true, p);
      assert.equal(canRoleAccessPath(p, ROLE.ADMIN), false, p);
    }
  });

  it("admin and super-admin pantry routes stay protected", () => {
    assert.equal(canRoleAccessPath("/dashboard/admin/pantry", ROLE.ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/admin/pantry", ROLE.FREELANCER), false);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/pantry", ROLE.SUPER_ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/pantry", ROLE.ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/pantry", ROLE.FREELANCER), false);
  });

  it("no dedicated freelancer pantry nav", () => {
    const nav = read("constants/freelancerNav.js");
    assert.doesNotMatch(nav, /pantry|بيت المونة/);
    const pantryPage = read("pages/dashboard/FreelancerPantryPage.jsx");
    assert.match(pantryPage, /Navigate to="\/dashboard\/freelancer\/orders"/);
  });

  it("training package code is immutable in edit UI", () => {
    const modal = read("admin/trainingPackages/TrainingPackageFormModal.jsx");
    assert.match(modal, /disabled=\{mode === "edit"\}/);
  });

  it("marketplace economy page has no Work Token UI", () => {
    const page = read("pages/dashboard/SuperAdminMarketplaceEconomyPage.jsx");
    assert.doesNotMatch(page, /Work Token/i);
    assert.doesNotMatch(page, /Article Token/i);
    assert.doesNotMatch(page, /program_admin/);
  });

  it("pantry and article admin require override dialog for non-rank-#1", () => {
    const pantry = read("pages/dashboard/AdminPantryPage.jsx");
    const articles = read("admin/marketplaceArticles/MarketplaceArticleApplicationsPanel.jsx");
    const dialog = read("admin/marketplaceArticles/FairSelectionOverrideDialog.jsx");
    assert.match(pantry, /FairSelectionOverrideDialog/);
    assert.match(pantry, /isRecommendedPantryBid/);
    assert.match(articles, /FairSelectionOverrideDialog/);
    assert.match(articles, /isRecommendedArticleApplicant/);
    assert.match(dialog, /disabled=\{!valid \|\| submitting\}/);
    assert.match(dialog, /z-\[1200\]/);
    assert.doesNotMatch(pantry, /auto-assign/);
    assert.doesNotMatch(articles, /auto-assign/);
  });

  it("relist UI is gated by canRelistBidCollection", () => {
    const pantry = read("pages/dashboard/AdminPantryPage.jsx");
    const articles = read("admin/marketplaceArticles/MarketplaceArticleApplicationsPanel.jsx");
    assert.match(pantry, /canRelistBidCollection/);
    assert.match(articles, /canRelistBidCollection/);
  });

  it("onboarding CTA URLs use the safe internal path resolver", () => {
    const src = read("pages/dashboard/SuperAdminOnboardingPage.jsx");
    assert.match(src, /resolveSafeInternalNavPath/);
    assert.match(src, /savingRef/);
    assert.equal(resolveSafeInternalNavPath("https://evil.test", ""), "");
    assert.equal(resolveSafeInternalNavPath("/dashboard/freelancer/getting-started", ""), "/dashboard/freelancer/getting-started");
  });
});
