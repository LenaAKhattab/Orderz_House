/**
 * Performance Phase 4 — keep the initial index JS graph off dashboard API/locales/icons.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Performance Phase 4 initial JS graph", () => {
  it("eager auth/public chrome do not import the full api.js barrel", () => {
    const auth = read("context/AuthContext.jsx");
    const currency = read("context/CurrencyDisplayContext.jsx");
    const analytics = read("services/analytics.js");
    const navHook = read("hooks/useHowItWorksNav.js");
    const sitePages = read("hooks/usePublicSitePages.js");
    const footer = read("hooks/usePublicFooterSettings.js");
    const navbar = read("components/layout/Navbar.jsx");
    assert.match(auth, /from "\.\.\/services\/authSessionApi"/);
    assert.match(auth, /from "\.\.\/services\/httpClient"/);
    assert.match(auth, /from "\.\.\/services\/freelancerSessionCacheStore"/);
    assert.doesNotMatch(auth, /from "\.\.\/services\/api"/);
    assert.doesNotMatch(auth, /from "\.\.\/services\/freelancerSessionCache"/);
    assert.match(currency, /from "\.\.\/services\/publicChromeApi"/);
    assert.match(analytics, /from "\.\/publicChromeApi"/);
    assert.match(navHook, /from "\.\.\/services\/publicChromeApi"/);
    assert.match(sitePages, /from "\.\.\/services\/publicChromeApi"/);
    assert.match(footer, /from "\.\.\/services\/publicChromeApi"/);
    assert.match(navbar, /lazy\(\(\) => import\("\.\.\/notifications\/NotificationsBell"\)\)/);
    assert.doesNotMatch(navbar, /import NotificationsBell from/);
  });

  it("core locale resources omit dashboard namespaces until MainLayout", () => {
    const resources = read("i18n/resources.js");
    const dashboard = read("i18n/dashboardResources.js");
    const layout = read("layouts/MainLayout.jsx");
    assert.doesNotMatch(resources, /locales\/ar\/dashboard\.json/);
    assert.doesNotMatch(resources, /locales\/ar\/freelancerDashboard\.json/);
    assert.doesNotMatch(resources, /locales\/ar\/trainingOrders\.json/);
    assert.match(dashboard, /locales\/ar\/dashboard\.json/);
    assert.match(dashboard, /locales\/ar\/freelancerDashboard\.json/);
    assert.match(dashboard, /locales\/ar\/trainingOrders\.json/);
    assert.match(layout, /import "\.\.\/i18n\/dashboardResources"/);
  });

  it("home skeleton count does not import lucide icon map", () => {
    const data = read("constants/homeFeaturedServices.js");
    const icons = read("constants/homeFeaturedServiceIcons.js");
    const skeleton = read("components/skeletons/CategoriesSkeleton.jsx");
    const grid = read("components/sections/HomeFeaturedServicesGrid.jsx");
    assert.doesNotMatch(data, /from "lucide-react"/);
    assert.match(icons, /from "lucide-react"/);
    assert.match(skeleton, /HOME_FEATURED_SERVICES_COUNT/);
    assert.doesNotMatch(skeleton, /homeFeaturedServiceIcons/);
    assert.match(grid, /from "\.\.\/\.\.\/constants\/homeFeaturedServiceIcons"/);
  });

  it("api.js still re-exports split helpers for lazy pages", () => {
    const api = read("services/api.js");
    assert.match(api, /from "\.\/authSessionApi"/);
    assert.match(api, /from "\.\/publicChromeApi"/);
    assert.match(api, /from "\.\/notificationsApi"/);
    assert.match(api, /loginRequest/);
    assert.match(api, /getCurrencyDisplayRequest/);
    assert.match(api, /NOTIFICATIONS_REFRESH_EVENT/);
    assert.match(api, /createClientFixedOrderCheckoutRequest|pay-checkout/);
  });

  it("does not drop crash-prone JSX identifiers on high-risk routes", () => {
    const planCard = read("components/plans/PlanCard.jsx");
    assert.match(
      planCard,
      /import MembershipPlanCardBody, \{ MembershipPlanTitle \} from "\.\/MembershipPlanCardBody"/,
    );
    const marketplace = read("components/open-orders/OpenOrdersMarketplace.jsx");
    assert.match(marketplace, /import MarketplaceOrderListRow from "\.\/MarketplaceOrderListRow"/);
    const app = read("App.jsx");
    assert.match(app, /import Unauthorized from "\.\/pages\/Unauthorized"/);
    const navbar = read("components/layout/Navbar.jsx");
    assert.match(navbar, /import BrandLogo from "\.\/BrandLogo"|import BrandLogo from "\.\.\/brand\/BrandLogo"/);
  });
});
