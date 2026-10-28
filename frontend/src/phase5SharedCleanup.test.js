/**
 * UI/UX Phase 5 — shared cleanup contracts: direction, raw states/errors, dates, terminology, payment trust,
 * special-offer checkout identity, Elite Direct (dormant) and the feedback list fetch.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  membershipCheckoutStatesFromAttempts,
  specialOfferCheckoutState,
} from "./lib/marketplaceMembership/membershipCheckoutState.js";
import { formatJoDateTime } from "./pages/dashboard/trainingOrders/trainingOrdersDisplayUtils.js";

const here = dirname(fileURLToPath(import.meta.url));
// Normalize line endings: Windows checkouts (core.autocrlf) give CRLF, source contracts below assume LF.
const read = (p) => readFileSync(join(here, p), "utf8").replace(/\r\n/g, "\n");
const json = (p) => JSON.parse(read(p));
function walk(dir, ext, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (ext.some((x) => e.name.endsWith(x)) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

describe("direction: English renders native LTR, Arabic RTL (html[dir])", () => {
  it("no CSS rule forces direction: rtl unless scoped to a direction selector", () => {
    const offenders = [];
    for (const f of walk(here, [".css"])) {
      const css = readFileSync(f, "utf8");
      for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        const [, selector, body] = m;
        if (/direction\s*:\s*rtl/i.test(body) && !/\[dir|:dir\(|\.rtl\b|\[lang/i.test(selector)) {
          offenders.push(`${relative(here, f).split(sep).join("/")}: ${selector.trim().slice(0, 60)}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("no hard-coded dir=\"rtl\" in components (except an Arabic-only input)", () => {
    const offenders = walk(here, [".jsx", ".js"])
      .filter((f) => /dir="rtl"|direction: "rtl"/.test(readFileSync(f, "utf8")))
      .map((f) => relative(here, f).split(sep).join("/"))
      .filter((f) => f !== "pages/dashboard/SuperAdminEditWebsiteFooterAppsPage.jsx");
    assert.deepEqual(offenders, []);
  });

  it("home promo carousel scrolls with the page direction; OS notifications follow the UI language", () => {
    assert.ok(read("components/ads/HomePromoOffersCarousel.jsx").includes('direction: dir === "ltr" ? "ltr" : "rtl"'));
    const n = read("services/browserNotifications.js");
    assert.ok(n.includes('dir: lang === "en" ? "ltr" : "rtl"') && !n.includes('lang: "ar"'));
  });
});

describe("raw machine states and raw errors", () => {
  it("client/freelancer/shared error toasts go through getSafeApiErrorMessage", () => {
    for (const f of [
      "components/open-orders/OpenOrdersMarketplace.jsx",
      "pages/dashboard/FreelancerOrderDetailsPage.jsx",
      "pages/dashboard/FreelancerMyOrderDetailsPage.jsx",
      "pages/dashboard/FreelancerFinancialClaimsPage.jsx",
      "pages/dashboard/FreelancerDashboardHome.jsx",
      "pages/dashboard/FreelancerSettingsPage.jsx",
      "components/notifications/BrowserNotificationSettings.jsx",
      "pages/Plans.jsx",
      "hooks/useDefaultCatalogPlans.js",
      "hooks/useMarketplaceMembershipCheckout.js",
      "hooks/useTrainingPackageCheckout.js",
    ]) {
      const src = read(f);
      assert.ok(!/(\w+)\?\.response\?\.data\?\.message \|\| \1\?\.message/.test(src), f);
      assert.ok(src.includes("getSafeApiErrorMessage("), f);
    }
  });

  it("status fallbacks use canonical labels; registry has the missing states (AR/EN)", () => {
    assert.ok(read("pages/dashboard/InstitutionOrdersPoolPage.jsx").includes("getOrderStatusLabel(o.orderStatus, t)"));
    assert.ok(read("pages/dashboard/FreelancerMyOrderDetailsPage.jsx").includes("getOrderStatusLabel(s, t)"));
    assert.ok(read("pages/dashboard/ClientFinancialPage.jsx").includes('statusLabel(t, "payments", s)'));
    for (const l of ["ar", "en"]) {
      const s = json(`locales/${l}/statuses.json`);
      assert.ok(s.payments.failed && s.payments.expired && s.subscriptions.purchased_pending_start && s.claims.frozen);
      assert.ok(s.orders.awaiting_payment_after_bid_selection && s.articles.revision_requested);
    }
  });

  it("renewal-failure copy is canonical AR/EN (not the API's Arabic-only freezeMessage)", () => {
    // Translated path (t provided) uses the i18n key; the API's Arabic text remains only for the untranslated admin helper.
    const src = read("utils/freelancerEligibilityUi.js").replace(/\r\n/g, "\n");
    assert.match(src, /Arabic-only\)\.\n\s+return t\("freelancerDashboard\.status\.eligibility\.subscriptionRenewalFailed"\);/);
    assert.ok(!read("pages/dashboard/FreelancerPlansPage.jsx").includes("freezeMessage?.title"));
  });
});

describe("dates follow the UI locale", () => {
  it("training orders: Arabic has no AM/PM markers; English has a time", () => {
    const iso = "2026-10-27T15:05:00Z";
    assert.ok(!/AM|PM|ص|م\b/.test(formatJoDateTime(iso, "ar")), formatJoDateTime(iso, "ar"));
    assert.match(formatJoDateTime(iso, "en"), /2026/);
  });

  it("subscription admin dates take the UI locale and Latin digits", () => {
    const src = read("admin/subscriptions/subscriptionAdminDisplay.js");
    assert.ok(src.includes('if (locale === "en") return formatLocaleDateTime(value, "en");'));
    assert.ok(src.includes('Intl.DateTimeFormat("ar-JO-u-nu-latn"'));
  });
});

describe("terminology: «الطلب» / order", () => {
  it("no stale 'project creation failed' copy; order wording in order contexts", () => {
    assert.ok(!/فشل إنشاء المشروع/.test(read("utils/clientMyOrdersPaymentReturn.js")));
    assert.equal(json("locales/ar/orders.json").bid.sendTitle, "أرسل عرضك لهذا الطلب");
    assert.equal(json("locales/en/orders.json").details.descriptionLabel, "Order description");
  });
});

describe("payment trust before Stripe", () => {
  it("secure-checkout note before every redirect (order create, offer confirm, plans)", () => {
    assert.ok(read("components/orders/AdminInternalOrderWizard.jsx").includes('<SecureCheckoutNote context="order" />'));
    assert.ok(read("components/orders/ClientBiddingOffersModal.jsx").includes('<SecureCheckoutNote context="order" />'));
    assert.ok(read("pages/dashboard/FreelancerPlansPage.jsx").includes("<SecureCheckoutNote"));
    const ar = json("locales/ar/common.json").secureCheckout;
    const en = json("locales/en/common.json").secureCheckout;
    assert.ok(ar.lead.includes("Stripe") && ar.lead.includes("الإنجليزية") && en.lead.includes("JOD"));
    assert.ok(ar.returnOrder.includes("متابعة الدفع") && en.returnPackage.includes("nothing is charged"));
  });

  it("special offer: an open checkout for an older offer version does not relabel the current offer", () => {
    const states = membershipCheckoutStatesFromAttempts({ attempts: [{ planCode: "special_offer", state: "open", specialOffer: true }] });
    assert.equal(specialOfferCheckoutState(states, { planTierCode: "special_offer_v2" }), null);
    assert.equal(specialOfferCheckoutState(states, { planTierCode: "special_offer" }), "resume");
    assert.equal(specialOfferCheckoutState(states, {}), null);
    assert.ok(read("components/plans/PricingSection.jsx").includes("specialOfferCheckoutState(checkoutStates, specialOffer)"));
  });
});

describe("Elite Direct stays dormant; no broken calls", () => {
  it("API helpers no longer double the /api prefix", () => {
    assert.ok(!/["`]\/api\//.test(read("services/eliteDirectOrdersApi.js")));
  });

  it("offer page is localized with an unavailable state (no raw status / English literals)", () => {
    const src = read("pages/dashboard/FreelancerEliteOfferPage.jsx");
    for (const literal of ['"Not found"', '"Failed"', ">Accept<", "Status: {offer.status}"]) assert.ok(!src.includes(literal), literal);
    assert.ok(src.includes("unavailableTitle"));
    for (const l of ["ar", "en"]) assert.ok(json(`locales/${l}/freelancerDashboard.json`).eliteOffer.status.pending);
  });
});

describe("Super Admin feedback list fetches once", () => {
  it("the list request does not depend on whether DB categories have loaded (no abort + refetch)", () => {
    const src = read("pages/dashboard/SuperAdminFeedbackPage.jsx");
    const deps = src.slice(src.indexOf("  }, [\n    runListLoad,"), src.indexOf("  ]);", src.indexOf("  }, [\n    runListLoad,")));
    assert.ok(deps.length > 0 && !deps.includes("useDynamicCategoryFilter") && deps.includes("categoryQueryKey"));
  });
});
