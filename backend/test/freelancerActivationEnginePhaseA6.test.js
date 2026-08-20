/**
 * Phase A6 — Silver conversion CTA + marketplace activation-request handoff.
 * Does not apply migrations. No Production / git / Stripe webhook / orders.
 *
 * Run: node --test test/freelancerActivationEnginePhaseA6.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a6_placeholder";

const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  FREELANCER_ACTIVATION_EVENT_TYPES,
  FREELANCER_ACTIVATION_ERROR_CODES,
  FREELANCER_ACTIVATION_CONVERSION_REASONS,
} = require("../src/constants/freelancerActivationEngine");
const conversion = require("../src/services/freelancerActivationConversionService");
const activationRequestService = require("../src/services/marketplaceMembershipActivationRequestService");
const plansService = require("../src/services/marketplaceMembershipPlansService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function settingsRow(overrides = {}) {
  return {
    freelancer_activation_engine_enabled: false,
    freelancer_activation_trial_duration_days: 10,
    freelancer_activation_trial_bids: 20,
    freelancer_activation_daily_bid_limit: 2,
    freelancer_activation_successful_work_cap: 2,
    freelancer_activation_requires_training: true,
    freelancer_activation_requires_verification: true,
    freelancer_activation_silver_plan_code: "silver",
    freelancer_activation_archive_after_days: 45,
    ...overrides,
  };
}

function trialRow(overrides = {}) {
  return {
    id: 11,
    freelancer_user_id: 41,
    status: "trial_active",
    started_at: "2026-08-10T10:00:00.000Z",
    ends_at: "2026-08-20T10:00:00.000Z",
    trial_bid_limit: 20,
    daily_bid_limit: 2,
    trial_duration_days: 10,
    successful_work_cap: 2,
    accepted_work_count: 0,
    published_work_count: 0,
    first_accepted_at: null,
    first_published_at: null,
    silver_cta_first_shown_at: null,
    silver_paid_at: null,
    ...overrides,
  };
}

const eligibleUser = {
  id: 41,
  role: "freelancer",
  is_active: true,
  email_verified: true,
};

function createFakeClient(mem) {
  mem.events = mem.events || [];
  mem.trial = mem.trial || null;
  return {
    async query(sql, params = []) {
      const s = String(sql);
      if (/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/.test(s)) return { rows: [] };
      if (s.includes("freelancer_activation_engine_enabled")) {
        return { rows: [mem.settings] };
      }
      if (s.includes("FROM users WHERE id")) {
        return { rows: mem.user ? [mem.user] : [] };
      }
      if (s.includes("FROM freelancer_subscriptions")) {
        return { rows: mem.subscription ? [mem.subscription] : [] };
      }
      if (s.includes("marketplace_membership_required_course_id")) {
        return { rows: [{ course_id: mem.requiredCourseId || null }] };
      }
      if (s.includes("FROM course_assignments") && s.includes("course_id = $2")) {
        return {
          rows: mem.courseCompleted ? [{ completed_at: new Date().toISOString() }] : [],
        };
      }
      if (s.includes("FROM course_assignments")) {
        return {
          rows: [
            {
              total: mem.courseTotal != null ? mem.courseTotal : mem.requiredCourseId ? 1 : 0,
              completed: mem.courseCompleted ? 1 : 0,
            },
          ],
        };
      }
      if (s.includes("FROM freelancer_marketplace_memberships")) {
        return { rows: mem.membership ? [mem.membership] : [] };
      }
      if (s.includes("FROM freelancer_activation_trials WHERE freelancer_user_id")) {
        return { rows: mem.trial ? [mem.trial] : [] };
      }
      if (s.includes("FROM marketplace_article_applications") || s.includes("JOIN marketplace_bid_credit_reservations")) {
        return { rows: mem.applications || [] };
      }
      if (s.includes("marketplace_article_financial_entries")) {
        return { rows: mem.earnedRows || [] };
      }
      if (s.includes("FROM marketplace_membership_plans")) {
        return {
          rows: mem.silverPlan
            ? [mem.silverPlan]
            : [
                {
                  id: 55,
                  tier_code: "silver",
                  name_ar: "فضي",
                  monthly_price_jod: 19,
                  cycle_duration_days: 30,
                  is_active: true,
                },
              ],
        };
      }
      if (s.includes("INSERT INTO freelancer_activation_events")) {
        mem.events.push({
          freelancer_user_id: params[0],
          trial_id: params[1],
          event_type: params[2],
          metadata: params[3],
        });
        return { rows: [] };
      }
      if (s.includes("silver_cta_first_shown_at")) {
        if (mem.trial && !mem.trial.silver_cta_first_shown_at) {
          mem.trial = {
            ...mem.trial,
            silver_cta_first_shown_at: params[1] || new Date().toISOString(),
          };
          return { rows: [mem.trial] };
        }
        return { rows: [] };
      }
      if (s.includes("status = 'paid_active'") && s.includes("silver_paid_at")) {
        if (mem.trial) {
          mem.trial = {
            ...mem.trial,
            status: "paid_active",
            silver_paid_at: mem.trial.silver_paid_at || params[1] || new Date().toISOString(),
          };
          return { rows: [mem.trial] };
        }
        return { rows: [] };
      }
      if (s.includes("SET silver_paid_at") && s.includes("silver_paid_at IS NULL")) {
        if (mem.trial && !mem.trial.silver_paid_at) {
          mem.trial = {
            ...mem.trial,
            silver_paid_at: params[1] || new Date().toISOString(),
          };
          return { rows: [mem.trial] };
        }
        return { rows: [] };
      }
      if (s.includes("trial_expired_high_intent")) {
        if (mem.trial) {
          mem.trial.status = "trial_expired_high_intent";
          mem.trial.expired_at = params[1] || new Date().toISOString();
        }
        return { rows: mem.trial ? [mem.trial] : [] };
      }
      if (s.includes("GROUP BY event_type") || s.includes("WHERE status = 'paid_active'")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in A6 fake client: ${s.slice(0, 200)}`);
    },
  };
}

describe("Phase A6 isolation — no payment rewrites", () => {
  it("does not touch webhooks or ordersService (A8 may add migration 172 separately)", () => {
    const conv = read("src/services/freelancerActivationConversionService.js");
    assert.doesNotMatch(conv, /require\(["'].*stripe/i);
    assert.doesNotMatch(conv, /require\(["'].*paytabs/i);
    assert.doesNotMatch(conv, /require\(["'].*ordersService/);
    assert.doesNotMatch(conv, /require\(["'].*financialClaims/);
    assert.doesNotMatch(conv, /createFreelancerSubscriptionCheckout/);
    assert.match(conv, /createActivationRequest/);
    const stripeWh = read("src/routes/stripeWebhookRoutes.js");
    assert.doesNotMatch(stripeWh, /freelancerActivationConversion/);
    assert.doesNotMatch(stripeWh, /syncActivationPaidStatus/);
  });

  it("event types include silver funnel events; events column has no CHECK constraint", () => {
    assert.equal(FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CTA_SHOWN, "silver_cta_shown");
    assert.equal(FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAYMENT_STARTED, "silver_payment_started");
    assert.equal(FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAID_DETECTED, "silver_paid_detected");
    const sql = read("sql/migrations/167_freelancer_activation_engine_a1.sql");
    assert.match(sql, /event_type VARCHAR\(64\) NOT NULL/);
    assert.doesNotMatch(sql, /freelancer_activation_events_event_type_chk/);
  });
});

describe("Phase A6 conversion eligibility", () => {
  it("returns no CTA when engine off", async () => {
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: false }),
      user: eligibleUser,
    });
    const out = await conversion.getFreelancerActivationConversion(41, { client });
    assert.equal(out.engineEnabled, false);
    assert.equal(out.shouldShowSilverCta, false);
    assert.equal(out.reason, FREELANCER_ACTIVATION_CONVERSION_REASONS.NONE);
  });

  it("returns no CTA for paid Silver membership", async () => {
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      user: eligibleUser,
      subscription: { activation_status: "company_approved" },
      requiredCourseId: 9,
      courseCompleted: true,
      membership: { tier_code: "silver", membership_id: 9 },
      trial: trialRow({ status: "trial_expired_high_intent" }),
    });
    const out = await conversion.getFreelancerActivationConversion(41, {
      client,
      now: new Date("2026-08-21T10:00:00.000Z"),
    });
    assert.equal(out.shouldShowSilverCta, false);
    assert.equal(out.paidMembership.isPaidActive, true);
    assert.equal(out.trialStatus, "paid_active");
  });

  it("CTA for trial expired", async () => {
    mock.method(plansService, "getMarketplaceMembershipPlanByTierCode", async () => ({
      id: 55,
      tierCode: "silver",
      nameAr: "فضي",
      monthlyPriceJod: 19,
      cycleDurationDays: 30,
    }));
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      user: eligibleUser,
      subscription: { activation_status: "company_approved" },
      requiredCourseId: 9,
      courseCompleted: true,
      trial: trialRow({ status: "trial_expired_high_intent" }),
    });
    const out = await conversion.getFreelancerActivationConversion(41, { client });
    assert.equal(out.shouldShowSilverCta, true);
    assert.equal(out.reason, FREELANCER_ACTIVATION_CONVERSION_REASONS.TRIAL_EXPIRED);
    assert.match(out.cta.description, /انتهت تجربة العمل/);
    assert.equal(out.silverPlan.priceJod, "19.000");
    mock.restoreAll();
  });

  it("CTA for last 3 days of trial", async () => {
    mock.method(plansService, "getMarketplaceMembershipPlanByTierCode", async () => ({
      id: 55,
      tierCode: "silver",
      nameAr: "فضي",
      monthlyPriceJod: 19,
      cycleDurationDays: 30,
    }));
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      user: eligibleUser,
      subscription: { activation_status: "company_approved" },
      requiredCourseId: 9,
      courseCompleted: true,
      trial: trialRow({
        status: "trial_active",
        ends_at: "2026-08-21T10:00:00.000Z",
      }),
    });
    const out = await conversion.getFreelancerActivationConversion(41, {
      client,
      now: new Date("2026-08-19T10:00:00.000Z"),
    });
    assert.equal(out.shouldShowSilverCta, true);
    assert.equal(out.reason, FREELANCER_ACTIVATION_CONVERSION_REASONS.LAST_3_DAYS);
    mock.restoreAll();
  });

  it("CTA for work cap reached", async () => {
    mock.method(plansService, "getMarketplaceMembershipPlanByTierCode", async () => ({
      id: 55,
      tierCode: "silver",
      monthlyPriceJod: 19,
      cycleDurationDays: 30,
      nameAr: "فضي",
    }));
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      user: eligibleUser,
      subscription: { activation_status: "company_approved" },
      requiredCourseId: 9,
      courseCompleted: true,
      trial: trialRow({
        status: "trial_active",
        ends_at: "2026-08-29T10:00:00.000Z",
        accepted_work_count: 2,
        successful_work_cap: 2,
      }),
    });
    const out = await conversion.getFreelancerActivationConversion(41, {
      client,
      now: new Date("2026-08-20T10:00:00.000Z"),
    });
    assert.equal(out.shouldShowSilverCta, true);
    assert.equal(out.reason, FREELANCER_ACTIVATION_CONVERSION_REASONS.WORK_CAP_REACHED);
    assert.match(out.cta.description, /الحد التجريبي/);
    mock.restoreAll();
  });

  it("CTA after accepted work", async () => {
    mock.method(plansService, "getMarketplaceMembershipPlanByTierCode", async () => ({
      id: 55,
      tierCode: "silver",
      monthlyPriceJod: 19,
      cycleDurationDays: 30,
      nameAr: "فضي",
    }));
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      user: eligibleUser,
      subscription: { activation_status: "company_approved" },
      requiredCourseId: 9,
      courseCompleted: true,
      trial: trialRow({
        status: "trial_active",
        ends_at: "2026-08-29T10:00:00.000Z",
        accepted_work_count: 1,
        first_accepted_at: "2026-08-18T10:00:00.000Z",
      }),
    });
    const out = await conversion.getFreelancerActivationConversion(41, {
      client,
      now: new Date("2026-08-20T10:00:00.000Z"),
    });
    assert.equal(out.shouldShowSilverCta, true);
    assert.equal(out.reason, FREELANCER_ACTIVATION_CONVERSION_REASONS.FIRST_ACCEPTED);
    mock.restoreAll();
  });
});

describe("Phase A6 cta-viewed + checkout handoff + paid sync", () => {
  it("cta-viewed stamps silver_cta_first_shown_at once", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      trial: trialRow(),
    };
    const client = createFakeClient(mem);
    const first = await conversion.recordSilverCtaViewed(41, {
      client,
      now: new Date("2026-08-20T12:00:00.000Z"),
    });
    assert.equal(first.firstShown, true);
    assert.ok(mem.trial.silver_cta_first_shown_at);
    const stamp = mem.trial.silver_cta_first_shown_at;
    const second = await conversion.recordSilverCtaViewed(41, {
      client,
      now: new Date("2026-08-21T12:00:00.000Z"),
    });
    assert.equal(second.firstShown, false);
    assert.equal(mem.trial.silver_cta_first_shown_at, stamp);
    const shown = mem.events.filter(
      (e) => e.event_type === FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CTA_SHOWN,
    );
    assert.equal(shown.length, 2);
  });

  it("start-silver-checkout records payment started and calls createActivationRequest", async () => {
    mock.method(plansService, "getMarketplaceMembershipPlanByTierCode", async () => ({
      id: 55,
      tierCode: "silver",
      monthlyPriceJod: 19,
      cycleDurationDays: 30,
      nameAr: "فضي",
    }));
    let calledWith = null;
    mock.method(activationRequestService, "createActivationRequest", async (args) => {
      calledWith = args;
      return {
        id: 901,
        status: "pending",
        marketplacePlanId: args.marketplacePlanId,
        freelancerUserId: args.freelancerUserId,
      };
    });
    const mem = {
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      user: eligibleUser,
      subscription: { activation_status: "company_approved" },
      requiredCourseId: 9,
      courseCompleted: true,
      trial: trialRow({ status: "trial_expired_high_intent" }),
    };
    const client = createFakeClient(mem);
    const out = await conversion.startSilverCheckout(41, { client });
    assert.equal(out.handoff, "marketplace_activation_request");
    assert.equal(out.checkoutUrl, null);
    assert.equal(out.activationRequest.id, 901);
    assert.equal(calledWith.marketplacePlanId, 55);
    assert.equal(calledWith.freelancerUserId, 41);
    assert.ok(
      mem.events.some(
        (e) => e.event_type === FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAYMENT_STARTED,
      ),
    );
    assert.doesNotMatch(JSON.stringify(out), /cardNumber|cvv|payment_intent/i);
    mock.restoreAll();
  });

  it("paid status sync sets paid_active only when marketplace paid membership is active", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      membership: { tier_code: "pro", membership_id: 3 },
      trial: trialRow({ status: "trial_expired_high_intent" }),
    };
    const client = createFakeClient(mem);
    const out = await conversion.syncActivationPaidStatus(41, {
      client,
      now: new Date("2026-08-20T15:00:00.000Z"),
    });
    assert.equal(out.synced, true);
    assert.equal(out.trial.status, "paid_active");
    assert.ok(out.trial.silverPaidAt);
    assert.ok(
      mem.events.some(
        (e) => e.event_type === FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAID_DETECTED,
      ),
    );

    const mem2 = {
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      membership: null,
      trial: trialRow({ status: "trial_expired_high_intent" }),
    };
    const client2 = createFakeClient(mem2);
    const noop = await conversion.syncActivationPaidStatus(41, { client: client2 });
    assert.equal(noop.synced, false);
    assert.equal(mem2.trial.status, "trial_expired_high_intent");
  });

  it("blocked checkout records silver_conversion_blocked", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      user: eligibleUser,
      subscription: { activation_status: "company_approved" },
      requiredCourseId: 9,
      courseCompleted: true,
      membership: { tier_code: "silver", membership_id: 9 },
      trial: trialRow({ status: "trial_expired_high_intent" }),
    };
    const client = createFakeClient(mem);
    await assert.rejects(
      () => conversion.startSilverCheckout(41, { client }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.SILVER_CONVERSION_BLOCKED,
    );
    assert.ok(
      mem.events.some(
        (e) => e.event_type === FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CONVERSION_BLOCKED,
      ),
    );
  });
});
