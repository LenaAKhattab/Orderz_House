import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const json = (p) => JSON.parse(read(p));

describe("UI/UX Phase 2 — Freelancer dashboard", () => {
  it("membership card never renders backend Arabic-only status text (English leak)", () => {
    const card = read("components/freelancer/FreelancerMarketplaceMembershipCard.jsx");
    assert.ok(!/\{statusMessageAr\s*\|\|/.test(card), "statusMessageAr must not be rendered directly");
    assert.match(card, /pendingStartBody/);
    assert.ok(json("locales/en/freelancerDashboard.json").marketplaceMembership.pendingStartBody);
  });

  it("KYC pending message from the backend is shown only in Arabic", () => {
    const page = read("pages/dashboard/FreelancerActivateAccountPage.jsx");
    assert.match(page, /locale === "ar" && status\?\.messageAr/);
    assert.match(page, /oh-kyc-status--/);
    const panel = read("components/dashboard/FreelancerActivationPolicyPanel.jsx");
    assert.match(panel, /policyTitle/);
    assert.ok(!/FREELANCER_ORDER_TENDER_POLICY_TITLE/.test(panel), "policy title must come from i18n");
  });

  it("delivery uses the shared OrderFilesPicker and safe error messages", () => {
    const page = read("pages/dashboard/FreelancerMyOrderDetailsPage.jsx");
    assert.match(page, /<OrderFilesPicker/);
    assert.ok(!/type="file"/.test(page), "no native file input on the delivery form");
    assert.match(page, /getSafeApiErrorMessage\(err/);
    assert.ok(page.indexOf("deliverOrder") < page.indexOf("submissionHistory\")}"), "next action renders before history");
    for (const l of ["ar", "en"]) assert.ok(json(`locales/${l}/orders.json`).filesPicker.dropOrBrowse);
  });

  it("submission history heading is not duplicated inside the freelancer section", () => {
    assert.match(read("pages/dashboard/FreelancerMyOrderDetailsPage.jsx"), /<SubmissionHistoryTimeline\s+hideTitle/);
    assert.match(read("components/orders/submission-history/SubmissionHistoryTimeline.jsx"), /hideTitle \? null/);
  });

  it("file rows are bidi-isolated and show a type chip", () => {
    const fl = read("components/orders/order-details/FileList.jsx");
    assert.match(fl, /className="od-file-list__filename" dir="auto"/);
    assert.match(fl, /od-file-list__type/);
  });

  it("dashboard button icons scale to their box (no overlap with labels)", () => {
    assert.match(read("styles/dashboardHub.css"), /\.fdash-btn__icon svg \{\s*width: 100%;\s*height: 100%;/);
  });

  it("waiting-on-client order offers 'view order' instead of a status-as-button", () => {
    const card = read("components/dashboard/hub/MyOrderCard.jsx");
    assert.match(card, /pending_client_review"\) return t\("orders\.card\.ctaViewOrder"\)/);
  });

  it("upgrade CTA on locked pool orders is secondary, applied orders get a submitted state", () => {
    const css = read("styles/freelancerOpenOrders.css");
    assert.match(css, /\.oh-plan-upgrade-cta__btn \{[\s\S]*?background: #ffffff;/);
    assert.match(read("components/open-orders/MarketplaceOrderListRow.jsx"), /submitted: order\?\.myBid\?\.status === "pending"/);
  });

  it("dashboard plans show one card per row on phones (dashboard-scoped)", () => {
    assert.match(read("pages/dashboard/freelancerPlans.css"), /@media \(max-width: 639px\) \{\s*\.fp-pricing-wrap--public-match \.pricing__grid--plans-4/);
  });
});
