/**
 * Performance Phase 2 — keep Home/popup ads lazy and keep services CSS off the public chrome path.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Performance Phase 2 bundle boundaries", () => {
  it("Home is lazy-exported and App.jsx does not eager-import pages/Home", () => {
    const lazy = read("routes/lazyPages.js");
    const app = read("App.jsx");
    assert.match(lazy, /export const Home = lazy\(\(\) => import\("\.\.\/pages\/Home"\)\)/);
    assert.match(app, /Home,/);
    assert.doesNotMatch(app, /import Home from "\.\/pages\/Home"/);
    assert.match(app, /import Unauthorized from "\.\/pages\/Unauthorized"/);
  });

  it("PopupAdsHost is lazy and wrapped in Suspense", () => {
    const app = read("App.jsx");
    assert.match(app, /const PopupAdsHost = lazy\(\(\) => import\("\.\/components\/ads\/PopupAdsHost"\)\)/);
    assert.match(app, /<Suspense fallback=\{null\}>\s*<PopupAdsHost \/>\s*<\/Suspense>/);
  });

  it("Navbar/PublicLayout do not pull full services or how-it-works page CSS", () => {
    const navbar = read("components/layout/Navbar.jsx");
    const layout = read("components/layout/PublicLayout.jsx");
    assert.match(navbar, /import "\.\.\/\.\.\/styles\/publicChrome\.css"/);
    assert.doesNotMatch(navbar, /servicesPage\.css|howItWorksPage\.css|home-skeleton\.css/);
    assert.match(layout, /import "\.\.\/\.\.\/styles\/publicHomeShell\.css"/);
    assert.doesNotMatch(layout, /servicesPage\.css/);
    const services = read("pages/Services.jsx");
    const hiw = read("pages/HowItWorksPage.jsx");
    assert.match(services, /servicesPage\.css/);
    assert.match(hiw, /howItWorksPage\.css/);
  });

  it("Skeleton barrel does not import order-details CSS", () => {
    const skeleton = read("components/ui/Skeleton.jsx");
    assert.doesNotMatch(skeleton, /order-details-page\.css/);
    const details = read("pages/dashboard/FreelancerOrderDetailsPage.jsx");
    assert.match(details, /order-details-page\.css/);
  });

  it("PlanCard and OpenOrdersMarketplace still import crash-prone JSX identifiers", () => {
    const planCard = read("components/plans/PlanCard.jsx");
    assert.match(
      planCard,
      /import MembershipPlanCardBody, \{ MembershipPlanTitle \} from "\.\/MembershipPlanCardBody"/,
    );
    const marketplace = read("components/open-orders/OpenOrdersMarketplace.jsx");
    assert.match(marketplace, /import MarketplaceOrderListRow from "\.\/MarketplaceOrderListRow"/);
  });
});
