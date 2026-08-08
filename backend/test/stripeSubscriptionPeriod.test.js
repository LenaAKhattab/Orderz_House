/**
 * Stripe Subscription billing-period extraction (legacy top-level + Basil item-level).
 * Run: node --test test/stripeSubscriptionPeriod.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/stripe_subscription_period_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  periodFromStripeSubscription,
  unixSecondsToDate,
  applyRecurringInvoicePaid,
  syncRecurringSubscriptionStatus,
} = require("../src/services/stripeRecurringSubscriptionService");

const START = 1_700_000_000;
const END = 1_702_678_400;
const START2 = 1_705_000_000;
const END2 = 1_707_678_400;

describe("unixSecondsToDate", () => {
  it("converts valid unix seconds", () => {
    const d = unixSecondsToDate(START);
    assert.ok(d instanceof Date);
    assert.equal(d.getTime(), START * 1000);
  });

  it("returns null for malformed values", () => {
    assert.equal(unixSecondsToDate(null), null);
    assert.equal(unixSecondsToDate(""), null);
    assert.equal(unixSecondsToDate("nope"), null);
    assert.equal(unixSecondsToDate(-1), null);
    assert.equal(unixSecondsToDate(0), null);
  });
});

describe("periodFromStripeSubscription — legacy top-level shape", () => {
  it("reads subscription.current_period_start/end", () => {
    const period = periodFromStripeSubscription({
      current_period_start: START,
      current_period_end: END,
    });
    assert.equal(period.currentPeriodStart.getTime(), START * 1000);
    assert.equal(period.currentPeriodEnd.getTime(), END * 1000);
  });

  it("prefers complete legacy pair over items", () => {
    const period = periodFromStripeSubscription({
      current_period_start: START,
      current_period_end: END,
      items: {
        data: [
          {
            price: { id: "price_other", recurring: { interval: "month" } },
            current_period_start: START2,
            current_period_end: END2,
          },
        ],
      },
    });
    assert.equal(period.currentPeriodStart.getTime(), START * 1000);
    assert.equal(period.currentPeriodEnd.getTime(), END * 1000);
  });
});

describe("periodFromStripeSubscription — Basil item-level shape", () => {
  it("extracts period from single recurring item", () => {
    const period = periodFromStripeSubscription({
      items: {
        data: [
          {
            price: { id: "price_monthly", recurring: { interval: "month", interval_count: 1 } },
            current_period_start: START,
            current_period_end: END,
          },
        ],
      },
    });
    assert.equal(period.currentPeriodStart.getTime(), START * 1000);
    assert.equal(period.currentPeriodEnd.getTime(), END * 1000);
  });

  it("matches preferredPriceId among multiple items", () => {
    const period = periodFromStripeSubscription(
      {
        items: {
          data: [
            {
              price: { id: "price_addon", recurring: { interval: "month" } },
              current_period_start: START2,
              current_period_end: END2,
            },
            {
              price: { id: "price_monthly", recurring: { interval: "month" } },
              current_period_start: START,
              current_period_end: END,
            },
          ],
        },
      },
      { preferredPriceId: "price_monthly" },
    );
    assert.equal(period.currentPeriodStart.getTime(), START * 1000);
    assert.equal(period.currentPeriodEnd.getTime(), END * 1000);
  });

  it("uses shared period when multiple items agree", () => {
    const period = periodFromStripeSubscription({
      items: {
        data: [
          {
            price: { id: "price_a", recurring: { interval: "month" } },
            current_period_start: START,
            current_period_end: END,
          },
          {
            price: { id: "price_b", recurring: { interval: "month" } },
            current_period_start: START,
            current_period_end: END,
          },
        ],
      },
    });
    assert.equal(period.currentPeriodStart.getTime(), START * 1000);
    assert.equal(period.currentPeriodEnd.getTime(), END * 1000);
  });

  it("throws STRIPE_PERIOD_AMBIGUOUS on conflicting multi-item periods", () => {
    assert.throws(
      () =>
        periodFromStripeSubscription({
          items: {
            data: [
              {
                price: { id: "price_a", recurring: { interval: "month" } },
                current_period_start: START,
                current_period_end: END,
              },
              {
                price: { id: "price_b", recurring: { interval: "year" } },
                current_period_start: START2,
                current_period_end: END2,
              },
            ],
          },
        }),
      (err) => err && err.code === "STRIPE_PERIOD_AMBIGUOUS",
    );
  });

  it("returns nulls for missing/empty items without legacy fields", () => {
    assert.deepEqual(periodFromStripeSubscription(null), {
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
    assert.deepEqual(periodFromStripeSubscription({ items: { data: [] } }), {
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
    assert.deepEqual(periodFromStripeSubscription({ items: {} }), {
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
  });

  it("skips one_time expanded prices without periods", () => {
    const period = periodFromStripeSubscription({
      items: {
        data: [
          {
            price: { id: "price_fee", type: "one_time" },
          },
          {
            price: { id: "price_monthly", recurring: { interval: "month" } },
            current_period_start: START,
            current_period_end: END,
          },
        ],
      },
    });
    assert.equal(period.currentPeriodStart.getTime(), START * 1000);
  });

  it("supports string price ids on items", () => {
    const period = periodFromStripeSubscription(
      {
        items: {
          data: [
            {
              price: "price_monthly",
              current_period_start: START,
              current_period_end: END,
            },
          ],
        },
      },
      { preferredPriceId: "price_monthly" },
    );
    assert.equal(period.currentPeriodEnd.getTime(), END * 1000);
  });
});

describe("invoice / subscription.updated period wiring", () => {
  it("applyRecurringInvoicePaid SQL still COALESCE period + expiry from resolver", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/stripeRecurringSubscriptionService.js"),
      "utf8",
    );
    assert.match(src, /periodFromStripeSubscription\(stripeSubscription,\s*\{\s*preferredPriceId/);
    assert.match(src, /next_renewal_at = COALESCE\(\$4, next_renewal_at\)/);
    assert.match(src, /WHEN has_first_order = TRUE THEN COALESCE\(\$4, expiry_date\)/);
  });

  it("syncRecurringSubscriptionStatus updates next_renewal_at; expiry only after first order", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/stripeRecurringSubscriptionService.js"),
      "utf8",
    );
    assert.match(src, /async function syncRecurringSubscriptionStatus/);
    assert.ok(src.includes("next_renewal_at = COALESCE($3, next_renewal_at)"));
    assert.ok(src.includes("WHEN has_first_order = TRUE THEN COALESCE($3, expiry_date)"));
  });

  it("webhook recurring fulfillment passes preferredPriceId into period helper", () => {
    const webhook = fs.readFileSync(
      path.join(__dirname, "../src/controllers/stripeWebhookController.js"),
      "utf8",
    );
    assert.match(webhook, /periodFromStripeSubscription\(stripeSubscription \|\| \{\},\s*\{/);
    assert.match(webhook, /preferredPriceId/);
    assert.match(webhook, /syncRecurringSubscriptionStatus/);
  });

  it("confirm checkout path passes preferredPriceId", () => {
    const checkout = fs.readFileSync(
      path.join(__dirname, "../src/services/stripeCheckoutService.js"),
      "utf8",
    );
    assert.match(checkout, /periodFromStripeSubscription\(stripeSubscription \|\| \{\},\s*\{/);
    assert.match(checkout, /preferredPriceId: meta\.stripePriceId/);
  });
});

describe("applyRecurringInvoicePaid uses item periods (mocked)", () => {
  it("writes item-level period into UPDATE params", async () => {
    const calls = [];
    const client = {
      query: async (sql, params) => {
        calls.push({ sql: String(sql), params });
        if (String(sql).includes("SELECT * FROM freelancer_subscriptions")) {
          return {
            rows: [
              {
                id: 99,
                freelancer_user_id: 3706,
                stripe_price_id: "price_monthly",
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    // clearPaymentFailureHolds may query — stub enough via catching
    try {
      await applyRecurringInvoicePaid(
        {
          stripeSubscription: {
            id: "sub_x",
            items: {
              data: [
                {
                  price: { id: "price_monthly", recurring: { interval: "month" } },
                  current_period_start: START,
                  current_period_end: END,
                },
              ],
            },
          },
          invoice: { status_transitions: { paid_at: START } },
        },
        client,
      );
    } catch (_) {
      /* hold clear may fail without full schema — period UPDATE must already have run */
    }
    const update = calls.find((c) => c.sql.includes("UPDATE freelancer_subscriptions") && c.sql.includes("last_payment_at"));
    assert.ok(update, "expected period UPDATE");
    assert.equal(update.params[2].getTime(), START * 1000);
    assert.equal(update.params[3].getTime(), END * 1000);
  });
});

describe("syncRecurringSubscriptionStatus uses item periods (mocked)", () => {
  it("updates periods for active subscription from items", async () => {
    const calls = [];
    const client = {
      query: async (sql, params) => {
        calls.push({ sql: String(sql), params });
        if (String(sql).includes("SELECT * FROM freelancer_subscriptions")) {
          return {
            rows: [
              {
                id: 2396,
                freelancer_user_id: 3706,
                stripe_price_id: "price_monthly",
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const result = await syncRecurringSubscriptionStatus(
      {
        stripeSubscription: {
          id: "sub_x",
          status: "active",
          items: {
            data: [
              {
                price: { id: "price_monthly", recurring: { interval: "month" } },
                current_period_start: START,
                current_period_end: END,
              },
            ],
          },
        },
      },
      client,
    );
    assert.equal(result.ok, true);
    assert.equal(result.status, "active");
    const update = calls.find((c) => c.sql.includes("UPDATE freelancer_subscriptions") && c.sql.includes("payment_status = 'paid'"));
    assert.ok(update);
    assert.equal(update.params[1].getTime(), START * 1000);
    assert.equal(update.params[2].getTime(), END * 1000);
  });
});
