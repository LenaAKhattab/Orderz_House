/**
 * Performance Phase 3 — keep route-scoped legacy CSS off the global index graph.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Performance Phase 3 legacy CSS split", () => {
  it("keeps truly global legacy CSS in main.jsx", () => {
    const main = read("main.jsx");
    const legacy = read("styles/legacy-application.css");
    assert.match(main, /import "\.\/styles\/legacy-application\.css"/);
    assert.match(legacy, /\.toast-stack\s*\{/);
    assert.match(legacy, /\.home-hero\s*\{/);
    assert.match(legacy, /\.navbar-shell\s*\{/);
    assert.match(legacy, /\.oh-skel\b/);
  });

  it("scopes About CSS to About.jsx and removes it from global legacy", () => {
    const about = read("pages/About.jsx");
    const legacy = read("styles/legacy-application.css");
    const css = read("styles/aboutPage.css");
    assert.match(about, /import "\.\.\/styles\/aboutPage\.css"/);
    assert.match(css, /\.about-page\s*\{/);
    assert.doesNotMatch(legacy, /\.about-page\s*\{/);
  });

  it("keeps Services explorer helpers on the Services route CSS", () => {
    const services = read("pages/Services.jsx");
    const css = read("styles/servicesPage.css");
    const legacy = read("styles/legacy-application.css");
    assert.match(services, /servicesPage\.css/);
    assert.match(css, /\.services-error\s*\{/);
    assert.match(css, /\.services-pill-row\s*\{/);
    assert.doesNotMatch(legacy, /\.services-error\s*\{/);
  });

  it("loads unscoped pricing base from plans components, not global legacy", () => {
    const pricing = read("components/plans/PricingSection.jsx");
    const training = read("components/plans/TrainingPlansSection.jsx");
    const css = read("styles/publicPlans.css");
    const legacy = read("styles/legacy-application.css");
    assert.match(pricing, /import "\.\.\/\.\.\/styles\/publicPlans\.css"/);
    assert.match(training, /import "\.\.\/\.\.\/styles\/publicPlans\.css"/);
    assert.match(pricing, /import "\.\.\/\.\.\/styles\/plansPage\.css"/);
    assert.match(css, /\.pricing\s*\{/);
    assert.match(css, /\.pricing-card\s*\{/);
    assert.doesNotMatch(legacy, /\n\.pricing\s*\{/);
  });

  it("moves admin outlet compact styles onto admin shells", () => {
    const shell = read("styles/adminDashboardShell.css");
    const legacy = read("styles/legacy-application.css");
    const admin = read("layouts/AdminLayout.jsx");
    const superAdmin = read("layouts/SuperAdminLayout.jsx");
    const financial = read("layouts/FinancialUserLayout.jsx");
    assert.match(shell, /\.oh-sa-outlet \.page-content\s*\{/);
    assert.doesNotMatch(legacy, /\.oh-sa-outlet \.page-content\s*\{/);
    assert.match(admin, /adminDashboardShell\.css/);
    assert.match(superAdmin, /adminDashboardShell\.css/);
    assert.match(financial, /adminDashboardShell\.css/);
  });

  it("does not drop crash-prone JSX identifiers on high-risk routes", () => {
    const planCard = read("components/plans/PlanCard.jsx");
    assert.match(
      planCard,
      /import MembershipPlanCardBody, \{ MembershipPlanTitle \} from "\.\/MembershipPlanCardBody"/,
    );
    const marketplace = read("components/open-orders/OpenOrdersMarketplace.jsx");
    assert.match(marketplace, /import MarketplaceOrderListRow from "\.\/MarketplaceOrderListRow"/);
    const navbar = read("components/layout/Navbar.jsx");
    assert.match(navbar, /import "\.\.\/\.\.\/styles\/publicChrome\.css"/);
    const app = read("App.jsx");
    assert.match(app, /import Unauthorized from "\.\/pages\/Unauthorized"/);
  });
});
