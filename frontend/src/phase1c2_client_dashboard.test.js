/**
 * Phase 1C.2 — client dashboard / create-order / payment-facing UI contracts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE, canRoleAccessPath } from "./constants/authRoutes.js";
import { isClientFixedOrderAwaitingStripeCheckout } from "./utils/clientFixedOrderPayNow.js";
import { resolveSafeInternalNavPath } from "./utils/safeInternalNavPath.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Phase 1C.2 client routes", () => {
  it("client-only dashboard routes deny freelancer", () => {
    const paths = [
      "/dashboard/client",
      "/dashboard/client/my-orders",
      "/dashboard/client/orders",
      "/dashboard/client/orders/create",
      "/dashboard/client/orders/9",
      "/dashboard/client/financial",
      "/dashboard/client/notifications",
      "/dashboard/client/settings",
      "/dashboard/client/profile",
      "/dashboard/client/feedback",
      "/dashboard/client/convert-account",
    ];
    for (const p of paths) {
      assert.equal(canRoleAccessPath(p, ROLE.CLIENT), true, p);
      assert.equal(canRoleAccessPath(p, ROLE.FREELANCER), false, p);
    }
  });

  it("App.jsx redirects my_orders to my-orders", () => {
    const src = read("App.jsx");
    assert.match(
      src,
      /path="\/dashboard\/client\/my_orders"[\s\S]{0,120}Navigate to="\/dashboard\/client\/my-orders"/,
    );
  });

  it("create-order route opens the client modal then dashboard", () => {
    const src = read("pages/dashboard/ClientCreateOrderOpenAndRedirect.jsx");
    assert.match(src, /openModal\(\)/);
    assert.match(src, /navigate\("\/dashboard\/client"/);
    const app = read("App.jsx");
    assert.match(app, /path="\/dashboard\/client\/orders\/create"/);
    assert.match(app, /<ClientCreateOrderOpenAndRedirect \/>/);
  });

  it("create-order stepper has three client steps and mobile wrap classes", () => {
    const wizard = read("components/orders/AdminInternalOrderWizard.jsx");
    assert.match(wizard, /CLIENT_STEPS = \[/);
    assert.match(wizard, /key: "core"/);
    assert.match(wizard, /key: "files"/);
    assert.match(wizard, /key: "review"/);
    assert.match(wizard, /max-\[420px\]:flex-wrap/);
  });

  it("Pay Now is wired to existing pay-checkout and shown for pending_payment fixed orders", () => {
    const api = read("services/api.js");
    assert.match(api, /\/client\/orders\/\$\{orderId\}\/pay-checkout/);
    const card = read("components/orders/ClientOrderCardCompact.jsx");
    assert.match(card, /ClientFixedOrderPayNowButton/);
    const btn = read("components/orders/ClientFixedOrderPayNowButton.jsx");
    assert.match(btn, /createClientFixedOrderCheckoutRequest/);
    assert.match(btn, /ادفع الآن/);
    assert.doesNotMatch(btn, /startCheckout|in.?app purchase|training package/i);

    assert.equal(
      isClientFixedOrderAwaitingStripeCheckout({
        projectType: "fixed",
        orderStatus: "pending_payment",
        paymentStatus: "unpaid",
      }),
      true,
    );
    assert.equal(
      isClientFixedOrderAwaitingStripeCheckout({
        projectType: "fixed",
        orderStatus: "completed",
        paymentStatus: "paid",
      }),
      false,
    );
  });

  it("client marketplace hides freelancer bid/take row actions", () => {
    const src = read("components/open-orders/OpenOrdersMarketplace.jsx");
    assert.match(src, /showPoolRowActions = Boolean\(!user \|\| isFreelancer\)/);
    assert.match(src, /mergePantryIntoPool = Boolean\(isFreelancer && layout === "dashboard"\)/);
  });

  it("approximate currency remains display-only on JodMoneyDisplay", () => {
    const src = read("components/money/JodMoneyDisplay.jsx");
    assert.match(src, /display-only/);
    assert.match(src, /oh-jod-money__approx/);
    assert.doesNotMatch(src, /startCheckout/);
  });

  it("notifications resolve only internal paths", () => {
    assert.equal(resolveSafeInternalNavPath("/dashboard/client/my-orders"), "/dashboard/client/my-orders");
    assert.equal(resolveSafeInternalNavPath("https://evil.example/phish"), "/dashboard");
    assert.equal(resolveSafeInternalNavPath("//evil.example/x"), "/dashboard");
    assert.equal(resolveSafeInternalNavPath("javascript:alert(1)"), "/dashboard");
    const page = read("pages/dashboard/NotificationsPage.jsx");
    const bell = read("components/notifications/NotificationsBell.jsx");
    assert.match(page, /resolveSafeInternalNavPath/);
    assert.match(bell, /resolveSafeInternalNavPath/);
  });

  it("feedback form has a duplicate-submit guard", () => {
    const src = read("pages/dashboard/ProblemsSuggestionsPage.jsx");
    assert.match(src, /submittingRef/);
    assert.match(src, /if \(submitting \|\| submittingRef\.current\) return/);
  });

  it("client financial page has no freelancer subscription checkout", () => {
    const src = read("pages/dashboard/ClientFinancialPage.jsx");
    assert.doesNotMatch(src, /startCheckout|FreelancerPlansPage|training/i);
    assert.match(src, /ClientFixedOrderPayNowButton/);
  });
});
