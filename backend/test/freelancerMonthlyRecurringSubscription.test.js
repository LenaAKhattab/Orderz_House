/**
 * Recurring monthly plan + payment-failure freeze regression tests (mocked Stripe / DB).
 * Run: node --test test/freelancerMonthlyRecurringSubscription.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/monthly_recurring_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {
  isRecurringPlanRow,
  FREELANCERS_MONTHLY_PAID_15_NAME,
  PURPOSE_RECURRING_SUBSCRIPTION,
  ensureStripeRecurringPriceForPlan,
  applyRecurringInvoicePaymentFailed,
  applyRecurringInvoicePaid,
} = require("../src/services/stripeRecurringSubscriptionService");
const {
  HOLD_REASON,
  applyStripeSubscriptionPaymentFailedHold,
  clearPaymentFailureHoldsForFreelancer,
  CLEAR_SOURCE,
  RENEWAL_FAILED_COPY,
} = require("../src/services/freelancerAccountHoldsService");
const { amountMajorToStripeMinor } = require("../src/utils/stripeMoney");
const { evaluateFreelancerTakeOrdersEligibility, SUBSCRIPTION_PAYMENT_STATUSES, SUBSCRIPTION_ACTIVATION_STATUSES, SUBSCRIPTION_STATUSES } = require("../src/services/subscriptionsService");

describe("freelancer monthly recurring plan constants", () => {
  it("uses stable internal name freelancers_monthly_paid_15", () => {
    assert.strictEqual(FREELANCERS_MONTHLY_PAID_15_NAME, "freelancers_monthly_paid_15");
  });

  it("detects recurring plan rows by flag or name", () => {
    assert.strictEqual(isRecurringPlanRow({ is_recurring: true, name: "x" }), true);
    assert.strictEqual(isRecurringPlanRow({ is_recurring: false, name: FREELANCERS_MONTHLY_PAID_15_NAME }), true);
    assert.strictEqual(isRecurringPlanRow({ is_recurring: false, name: "freelancers_1_month" }), false);
  });

  it("computes 15 JOD as 15000 minor units", () => {
    assert.strictEqual(amountMajorToStripeMinor(15, "JOD"), 15000);
  });

  it("uses a distinct recurring checkout purpose", () => {
    assert.strictEqual(PURPOSE_RECURRING_SUBSCRIPTION, "freelancer_recurring_subscription");
  });
});

describe("migration and frontend hardcoding guards", () => {
  it("migration seeds freelancers_monthly_paid_15 without assuming numeric id", () => {
    const sql = fs.readFileSync(
      path.join(__dirname, "../sql/migrations/122_freelancer_monthly_recurring_subscription.sql"),
      "utf8",
    );
    assert.match(sql, /freelancers_monthly_paid_15/);
    assert.match(sql, /is_recurring/);
    assert.match(sql, /billing_interval/);
    assert.match(sql, /freelancer_account_holds/);
    assert.doesNotMatch(sql, /WHERE id\s*=\s*\d+/);
  });

  it("public monthly plan copy renews with saved card and omits freeze marketing", () => {
    const seed122 = fs.readFileSync(
      path.join(__dirname, "../sql/migrations/122_freelancer_monthly_recurring_subscription.sql"),
      "utf8",
    );
    const seed123 = fs.readFileSync(
      path.join(__dirname, "../sql/migrations/123_monthly_plan_public_copy_no_freeze_marketing.sql"),
      "utf8",
    );
    for (const sql of [seed122, seed123]) {
      assert.match(sql, /يُجدَّد الاشتراك تلقائيًا شهريًا باستخدام البطاقة المسجلة/);
      assert.doesNotMatch(sql, /يسحب تلقائياً من البطاقة كل شهر/);
      assert.doesNotMatch(sql, /إيقاف تلقائي عند تعذر السحب حتى إعادة التفعيل/);
      assert.doesNotMatch(sql, /Access freezes if renewal payment fails/);
    }
    const seed124 = fs.readFileSync(
      path.join(__dirname, "../sql/migrations/124_monthly_plan_arabic_label.sql"),
      "utf8",
    );
    assert.match(seed122, /label = EXCLUDED\.label|^\s*'شهريًا',\s*\n\s*'Monthly'/m);
    assert.match(seed124, /label = 'شهريًا'/);
    assert.match(seed124, /label_en = 'Monthly'/);
  });

  it("frontend PlanCard / Plans page do not hardcode the new plan title or 15 JOD", () => {
    const plansPage = fs.readFileSync(path.join(__dirname, "../../frontend/src/pages/Plans.jsx"), "utf8");
    const planCard = fs.readFileSync(path.join(__dirname, "../../frontend/src/components/plans/PlanCard.jsx"), "utf8");
    const catalog = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/constants/orderzhousePlansCatalog.js"),
      "utf8",
    );
    assert.doesNotMatch(plansPage, /الاشتراك الشهري المدفوع/);
    assert.doesNotMatch(planCard, /الاشتراك الشهري المدفوع/);
    assert.doesNotMatch(plansPage, /إيقاف تلقائي عند تعذر السحب/);
    assert.doesNotMatch(planCard, /إيقاف تلقائي عند تعذر السحب/);
    assert.doesNotMatch(catalog, /freelancers_monthly_paid_15/);
    assert.doesNotMatch(planCard, /priceJod:\s*15/);
  });

  it("checkout service branches to mode=subscription for recurring plans", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/services/stripeCheckoutService.js"), "utf8");
    assert.match(src, /isRecurringPlanRow/);
    assert.match(src, /createRecurringSubscriptionCheckoutSession/);
    const recurringSrc = fs.readFileSync(
      path.join(__dirname, "../src/services/stripeRecurringSubscriptionService.js"),
      "utf8",
    );
    assert.match(recurringSrc, /mode:\s*"subscription"/);
    assert.match(recurringSrc, /price:\s*priceInfo\.priceId/);
  });

  it("webhook handles invoice payment failed and paid", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/controllers/stripeWebhookController.js"), "utf8");
    assert.match(src, /invoice\.payment_failed/);
    assert.match(src, /invoice\.paid/);
    assert.match(src, /customer\.subscription\.updated/);
    assert.match(src, /PURPOSE_RECURRING_SUBSCRIPTION/);
  });
});

describe("ensureStripeRecurringPriceForPlan reuses stored price", () => {
  it("reuses price when amount minor matches and does not create Stripe objects", async () => {
    const stripe = {
      products: { create: async () => assert.fail("should not create product") },
      prices: { create: async () => assert.fail("should not create price") },
    };
    const planRow = {
      id: 99,
      name: FREELANCERS_MONTHLY_PAID_15_NAME,
      title: "test",
      price_jod: 15,
      currency: "JOD",
      billing_interval: "month",
      billing_interval_count: 1,
      stripe_product_id: "prod_x",
      stripe_price_id: "price_x",
      stripe_price_amount_minor: 15000,
    };
    const fakeClient = { query: async () => assert.fail("should not update plans") };
    const out = await ensureStripeRecurringPriceForPlan({ stripe, planRow }, fakeClient);
    assert.strictEqual(out.priceId, "price_x");
    assert.strictEqual(out.amountMinor, 15000);
  });

  it("creates a new price when stored amount drifts (never edits live price)", async () => {
    const calls = { products: 0, prices: 0, updates: 0 };
    const stripe = {
      products: {
        create: async () => {
          calls.products += 1;
          return { id: "prod_new" };
        },
      },
      prices: {
        create: async (args) => {
          calls.prices += 1;
          assert.strictEqual(args.unit_amount, 15000);
          assert.deepStrictEqual(args.recurring, { interval: "month", interval_count: 1 });
          return { id: "price_new" };
        },
      },
    };
    const planRow = {
      id: 99,
      name: FREELANCERS_MONTHLY_PAID_15_NAME,
      title: "test",
      price_jod: 15,
      currency: "JOD",
      billing_interval: "month",
      billing_interval_count: 1,
      stripe_product_id: null,
      stripe_price_id: "price_old",
      stripe_price_amount_minor: 20000,
    };
    const fakeClient = {
      query: async () => {
        calls.updates += 1;
        return { rows: [] };
      },
    };
    const out = await ensureStripeRecurringPriceForPlan({ stripe, planRow }, fakeClient);
    assert.strictEqual(out.priceId, "price_new");
    assert.strictEqual(calls.products, 1);
    assert.strictEqual(calls.prices, 1);
    assert.strictEqual(calls.updates, 1);
  });
});

describe("payment failure freeze holds", () => {
  it("is idempotent per invoice id", async () => {
    const rows = [];
    const client = {
      query: async (sql, params) => {
        if (String(sql).includes("SELECT") && String(sql).includes("stripe_invoice_id")) {
          const hit = rows.find(
            (r) =>
              r.freelancer_user_id === params[0] &&
              r.reason_code === params[1] &&
              r.stripe_invoice_id === params[2] &&
              r.cleared_at == null,
          );
          return { rows: hit ? [hit] : [] };
        }
        if (String(sql).includes("INSERT INTO freelancer_account_holds")) {
          const row = {
            id: rows.length + 1,
            freelancer_user_id: params[0],
            reason_code: params[1],
            reason_detail: params[2],
            stripe_subscription_id: params[3],
            stripe_invoice_id: params[4],
            source: params[5],
            created_at: new Date(),
            cleared_at: null,
          };
          rows.push(row);
          return { rows: [row] };
        }
        if (String(sql).includes("freelancer_account_hold_audit")) {
          return { rows: [] };
        }
        return { rows: [] };
      },
    };

    const first = await applyStripeSubscriptionPaymentFailedHold(
      {
        freelancerUserId: 7,
        stripeSubscriptionId: "sub_1",
        stripeInvoiceId: "in_1",
        failureCode: "card_declined",
      },
      client,
    );
    const second = await applyStripeSubscriptionPaymentFailedHold(
      {
        freelancerUserId: 7,
        stripeSubscriptionId: "sub_1",
        stripeInvoiceId: "in_1",
        failureCode: "card_declined",
      },
      client,
    );
    assert.strictEqual(first.created, true);
    assert.strictEqual(second.created, false);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(first.hold.reasonCode, HOLD_REASON.STRIPE_SUBSCRIPTION_PAYMENT_FAILED);
  });

  it("exposes clear Arabic freeze copy", () => {
    assert.match(RENEWAL_FAILED_COPY.ar.title, /تعذر تجديد الاشتراك/);
    assert.match(RENEWAL_FAILED_COPY.ar.message, /15 د\.أ/);
    assert.match(RENEWAL_FAILED_COPY.en.message, /15 JOD/);
  });
});

describe("eligibility still blocks failed payment", () => {
  it("blocks failed payment_status", () => {
    const r = evaluateFreelancerTakeOrdersEligibility({
      paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.FAILED,
      activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
      status: SUBSCRIPTION_STATUSES.ACTIVE,
      expiryDate: null,
    });
    assert.strictEqual(r.eligible, false);
  });
});

describe("admin clear source constant", () => {
  it("distinguishes admin clear from stripe clear", () => {
    assert.strictEqual(CLEAR_SOURCE.ADMIN, "admin");
    assert.strictEqual(CLEAR_SOURCE.STRIPE, "stripe");
  });
});
