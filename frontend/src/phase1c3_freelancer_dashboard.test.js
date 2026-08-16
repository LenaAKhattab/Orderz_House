/**
 * Phase 1C.3 — freelancer dashboard / orders / articles / pantry-merged contracts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE, canRoleAccessPath } from "./constants/authRoutes.js";
import { resolveSafeInternalNavPath } from "./utils/safeInternalNavPath.js";
import { mapPantryRequestToPoolOrder } from "./components/open-orders/mapPantryRequestToPoolOrder.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Phase 1C.3 freelancer routes", () => {
  it("freelancer-only dashboard routes deny client", () => {
    const paths = [
      "/dashboard/freelancer",
      "/dashboard/freelancer/my-orders",
      "/dashboard/freelancer/my-orders/3",
      "/dashboard/freelancer/pantry",
      "/dashboard/freelancer/articles",
      "/dashboard/freelancer/articles/8",
      "/dashboard/freelancer/financial-claims",
      "/dashboard/freelancer/plans",
      "/dashboard/freelancer/courses",
      "/dashboard/freelancer/getting-started",
      "/dashboard/freelancer/activate-account",
      "/dashboard/freelancer/settings",
      "/dashboard/freelancer/notifications",
      "/dashboard/freelancer/feedback",
      "/dashboard/freelancer/institution-orders",
    ];
    for (const p of paths) {
      assert.equal(canRoleAccessPath(p, ROLE.FREELANCER), true, p);
      assert.equal(canRoleAccessPath(p, ROLE.CLIENT), false, p);
    }
  });

  it("App.jsx pantry route redirects to available orders", () => {
    const page = read("pages/dashboard/FreelancerPantryPage.jsx");
    assert.match(page, /Navigate to="\/dashboard\/freelancer\/orders"/);
    const app = read("App.jsx");
    assert.match(app, /path="\/dashboard\/freelancer\/pantry"/);
    assert.match(app, /<FreelancerPantryPage \/>/);
  });

  it("freelancer article list/detail routes render apply UI without admin controls", () => {
    const app = read("App.jsx");
    assert.match(app, /<FreelancerMarketplaceArticlesPage \/>/);
    assert.match(app, /<FreelancerMarketplaceArticleDetailPage \/>/);
    const list = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(list, /formatArticleBidCollectionLabel/);
    assert.match(detail, /isBidCollectionClosedForApply/);
    assert.match(detail, /busyRef/);
    assert.doesNotMatch(list, /FairSelectionOverrideDialog|overrideReason|fairRanking/);
    assert.doesNotMatch(detail, /FairSelectionOverrideDialog|overrideReason|auto-assign/);
    assert.doesNotMatch(list, /Article Token|Work Token/i);
    assert.doesNotMatch(detail, /Article Token|Work Token/i);
  });

  it("pantry-merged mapper has no dedicated pantry branding and maps bid collection", () => {
    const src = read("components/open-orders/mapPantryRequestToPoolOrder.js");
    assert.doesNotMatch(src, /بيت المونة/);
    const mapped = mapPantryRequestToPoolOrder({
      id: 12,
      title: "Opportunity",
      pricingType: "bidding",
      requiredBidCount: 10,
      validApplicantCount: 3,
      bidCollectionOutcome: null,
      applyEligible: true,
    });
    assert.equal(mapped.isPantryPoolItem, true);
    assert.equal(mapped.bidCollection.requiredBidCount, 10);
    assert.equal(mapped.bidCollection.currentBidCount, 3);
    assert.equal(mapped.collectionClosed, false);
    const closed = mapPantryRequestToPoolOrder({
      id: 13,
      title: "Closed",
      pricingType: "fixed",
      bidCollection: { bidCollectionStatus: "threshold_reached", requiredBidCount: 10, currentBidCount: 10 },
      applyEligible: true,
    });
    assert.equal(closed.collectionClosed, true);
  });

  it("marketplace freelancer actions are not client CTAs", () => {
    const src = read("components/open-orders/OpenOrdersMarketplace.jsx");
    assert.match(src, /showPoolRowActions = Boolean\(!user \|\| isFreelancer\)/);
    assert.doesNotMatch(src, /ادفع الآن|Pay Now|ClientFixedOrderPayNowButton/);
    assert.match(src, /mergePantryIntoPool = Boolean\(isFreelancer && layout === "dashboard"\)/);
  });

  it("getting-started and notifications use the safe internal path resolver", () => {
    const gs = read("pages/dashboard/FreelancerGettingStartedPage.jsx");
    assert.match(gs, /resolveSafeInternalNavPath/);
    assert.equal(resolveSafeInternalNavPath("https://evil.test", ""), "");
    assert.equal(resolveSafeInternalNavPath("/dashboard/freelancer/orders", ""), "/dashboard/freelancer/orders");
  });

  it("freelancer claims and article apply have duplicate-submit guards", () => {
    const claims = read("pages/dashboard/FreelancerFinancialClaimsPage.jsx");
    assert.match(claims, /submittingRef/);
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(detail, /if \(busy \|\| busyRef\.current\) return/);
  });

  it("approximate currency remains display-only", () => {
    const src = read("components/money/JodMoneyDisplay.jsx");
    assert.match(src, /display-only/);
    assert.doesNotMatch(src, /startCheckout/);
  });
});
