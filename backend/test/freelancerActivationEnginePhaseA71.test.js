/**
 * Phase A7.1 — Freelancer Activation Engine KPI analytics (read-only).
 * Does not apply migrations. No Production / git / Stripe / orders.
 *
 * Run: node --test test/freelancerActivationEnginePhaseA71.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a71_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  FREELANCER_ACTIVATION_EVENT_TYPES,
} = require("../src/constants/freelancerActivationEngine");
const kpi = require("../src/services/freelancerActivationKpiService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function createFakeClient(mem) {
  return {
    async query(sql) {
      const s = String(sql);
      if (s.includes("SELECT 1 FROM freelancer_activation_trials")) {
        if (mem.schemaMissing) {
          const err = new Error("missing");
          err.code = "42P01";
          throw err;
        }
        return { rows: [{ "?column?": 1 }] };
      }
      if (s.includes("FROM freelancer_activation_trials") && !s.includes("SELECT 1")) {
        return { rows: mem.trials || [] };
      }
      if (s.includes("FROM freelancer_activation_events")) {
        return { rows: mem.events || [] };
      }
      if (s.includes("FROM marketplace_article_applications")) {
        return { rows: mem.applications || [] };
      }
      if (s.includes("FROM marketplace_article_submissions")) {
        return { rows: mem.submissions || [] };
      }
      if (s.includes("FROM bildazo_article_publish_records")) {
        return { rows: mem.publishRecords || [] };
      }
      if (s.includes("FROM freelancer_activation_campaigns")) {
        return { rows: mem.campaigns || [] };
      }
      if (s.includes("FROM freelancer_activation_waves")) {
        return { rows: mem.waves || [] };
      }
      if (s.includes("marketplace_article_financial_entries")) {
        return { rows: mem.earnedRows || [] };
      }
      if (s.includes("freelancer_activation_work_inventory_reserve_entries")) {
        if (mem.wirMissing) {
          const err = new Error("missing wir");
          err.code = "42P01";
          throw err;
        }
        return { rows: mem.workInventoryRows || [] };
      }
      throw new Error(`Unexpected SQL in A7.1 fake client: ${s.slice(0, 180)}`);
    },
  };
}

describe("Phase A7.1 isolation", () => {
  it("KPI service is read-only and avoids payment/webhook domains", () => {
    const src = read("src/services/freelancerActivationKpiService.js");
    assert.doesNotMatch(src, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/);
    assert.doesNotMatch(src, /require\(["'].*stripe/i);
    assert.doesNotMatch(src, /require\(["'].*paytabs/i);
    assert.doesNotMatch(src, /require\(["'].*ordersService/);
    assert.doesNotMatch(src, /require\(["'].*financialClaims/);
    assert.doesNotMatch(src, /reserveBidCredits|consumeBid/);
    const routes = read("src/routes/superAdminFreelancerActivationRoutes.js");
    assert.match(routes, /freelancer-activation\/kpis/);
    assert.match(routes, /requireSuperAdmin/);
    const controller = read("src/controllers/freelancerActivationEngineController.js");
    assert.match(controller, /getAdminKpis/);
    assert.match(controller, /getFreelancerActivationKpis/);
  });
});

describe("Phase A7.1 KPI compute", () => {
  it("empty dataset returns safe zeros/nulls", () => {
    const out = kpi.computeKpisFromRows({
      filters: { campaignId: null, waveId: null, dateFrom: null, dateTo: null },
      now: new Date("2026-08-20T12:00:00.000Z"),
    });
    assert.equal(out.funnel.registeredUsers, null);
    assert.equal(out.funnel.trialActivatedUsers, 0);
    assert.equal(out.funnel.silverPaidUsers, 0);
    assert.equal(out.rates.trialActivatedToPaidRate, null);
    assert.equal(out.rates.registeredToPaidRate, null);
    assert.equal(out.financial.campaignBudgetTotalJod, "0.000");
    assert.equal(out.financial.subscriptionRevenueJod, null);
    assert.equal(out.financial.costPerPaidFreelancer, null);
    assert.ok(out.metadata.unavailableMetrics.some((m) => m.key === "funnel.registeredUsers"));
    assert.doesNotMatch(JSON.stringify(out), /"email"|"phone"/i);
  });

  it("counts trial activated, first bid, assignment, accepted, published, CTA, payment, paid", () => {
    const out = kpi.computeKpisFromRows({
      filters: { campaignId: null, waveId: null, dateFrom: null, dateTo: null },
      trials: [
        {
          freelancer_user_id: 1,
          status: "trial_active",
          started_at: "2026-08-01T00:00:00.000Z",
          first_bid_at: "2026-08-02T00:00:00.000Z",
          first_accepted_at: "2026-08-05T00:00:00.000Z",
          silver_cta_first_shown_at: "2026-08-06T00:00:00.000Z",
        },
        {
          freelancer_user_id: 2,
          status: "paid_active",
          started_at: "2026-08-01T00:00:00.000Z",
          first_bid_at: "2026-08-03T00:00:00.000Z",
          first_accepted_at: "2026-08-04T00:00:00.000Z",
          silver_paid_at: "2026-08-10T00:00:00.000Z",
        },
      ],
      applications: [
        {
          id: 10,
          freelancer_user_id: 1,
          status: "selected",
          selected_at: "2026-08-03T00:00:00.000Z",
          activation_campaign_id: 5,
          activation_wave_id: 7,
        },
        {
          id: 11,
          freelancer_user_id: 2,
          status: "approved",
          selected_at: "2026-08-03T12:00:00.000Z",
          activation_campaign_id: 5,
          activation_wave_id: 7,
        },
      ],
      publishRecords: [
        {
          orderz_application_id: 11,
          status: "published",
          published_at: "2026-08-08T00:00:00.000Z",
        },
      ],
      events: [
        {
          freelancer_user_id: 1,
          event_type: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CTA_SHOWN,
          created_at: "2026-08-06T00:00:00.000Z",
        },
        {
          freelancer_user_id: 1,
          event_type: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAYMENT_STARTED,
          created_at: "2026-08-07T00:00:00.000Z",
        },
        {
          freelancer_user_id: 2,
          event_type: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CTA_SHOWN,
          created_at: "2026-08-06T00:00:00.000Z",
        },
        {
          freelancer_user_id: 2,
          event_type: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAYMENT_STARTED,
          created_at: "2026-08-07T00:00:00.000Z",
        },
        {
          freelancer_user_id: 2,
          event_type: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAID_DETECTED,
          created_at: "2026-08-10T00:00:00.000Z",
        },
      ],
    });

    assert.equal(out.funnel.trialActivatedUsers, 2);
    assert.equal(out.funnel.firstBidUsers, 2);
    assert.equal(out.funnel.firstAssignmentUsers, 2);
    assert.equal(out.funnel.firstAcceptedWorkUsers, 2);
    assert.equal(out.funnel.firstPublishedWorkUsers, 1);
    assert.equal(out.funnel.silverCtaShownUsers, 2);
    assert.equal(out.funnel.silverPaymentStartedUsers, 2);
    assert.equal(out.funnel.silverPaidUsers, 1);
  });

  it("conversion rates calculate correctly and division by zero is null", () => {
    assert.equal(kpi.safeRate(1, 0), null);
    assert.equal(kpi.safeRate(0, 0), null);
    assert.equal(kpi.safeRate(1, 2), 0.5);
    const out = kpi.computeKpisFromRows({
      filters: { campaignId: null, waveId: null, dateFrom: null, dateTo: null },
      trials: [
        {
          freelancer_user_id: 1,
          status: "paid_active",
          started_at: "2026-08-01T00:00:00.000Z",
          first_accepted_at: "2026-08-02T00:00:00.000Z",
          silver_cta_first_shown_at: "2026-08-03T00:00:00.000Z",
          silver_paid_at: "2026-08-04T00:00:00.000Z",
        },
        {
          freelancer_user_id: 2,
          status: "trial_active",
          started_at: "2026-08-01T00:00:00.000Z",
          first_accepted_at: "2026-08-02T00:00:00.000Z",
          silver_cta_first_shown_at: "2026-08-03T00:00:00.000Z",
        },
      ],
      events: [
        {
          freelancer_user_id: 1,
          event_type: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAYMENT_STARTED,
          created_at: "2026-08-03T12:00:00.000Z",
        },
        {
          freelancer_user_id: 2,
          event_type: FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAYMENT_STARTED,
          created_at: "2026-08-03T12:00:00.000Z",
        },
      ],
      publishRecords: [],
      applications: [],
    });
    assert.equal(out.rates.trialActivatedToPaidRate, 0.5);
    assert.equal(out.rates.firstAcceptedToPaidRate, 0.5);
    assert.equal(out.rates.ctaShownToPaymentStartedRate, 1);
    assert.equal(out.rates.paymentStartedToPaidRate, 0.5);
    assert.equal(out.rates.registeredToPaidRate, null);
  });

  it("financial budget summary uses A4.2 campaign/wave counters", () => {
    const campaignOut = kpi.computeKpisFromRows({
      filters: { campaignId: 9, waveId: null, dateFrom: null, dateTo: null },
      campaigns: [
        {
          id: 9,
          total_budget_jod: "100.000",
          reserved_budget_jod: "20.000",
          used_budget_jod: "30.000",
        },
        {
          id: 10,
          total_budget_jod: "999.000",
          reserved_budget_jod: "1.000",
          used_budget_jod: "1.000",
        },
      ],
      trials: [
        {
          freelancer_user_id: 1,
          status: "paid_active",
          started_at: "2026-08-01T00:00:00.000Z",
          silver_paid_at: "2026-08-10T00:00:00.000Z",
        },
      ],
      applications: [{ id: 1, freelancer_user_id: 1, status: "pending", activation_campaign_id: 9 }],
    });
    assert.equal(campaignOut.financial.campaignBudgetTotalJod, "100.000");
    assert.equal(campaignOut.financial.campaignBudgetReservedJod, "20.000");
    assert.equal(campaignOut.financial.campaignBudgetUsedJod, "30.000");
    assert.equal(campaignOut.financial.campaignBudgetRemainingJod, "50.000");
    assert.equal(campaignOut.financial.costPerPaidFreelancer, "30.000");

    const waveOut = kpi.computeKpisFromRows({
      filters: { campaignId: 9, waveId: 3, dateFrom: null, dateTo: null },
      waves: [
        {
          id: 3,
          campaign_id: 9,
          budget_jod: "40.000",
          reserved_budget_jod: "5.000",
          used_budget_jod: "10.000",
        },
      ],
      campaigns: [],
      trials: [],
      applications: [],
    });
    assert.equal(waveOut.financial.campaignBudgetTotalJod, "40.000");
    assert.equal(waveOut.financial.campaignBudgetRemainingJod, "25.000");
  });

  it("pending freelancer earned JOD uses A5 writer pending ledger", () => {
    const out = kpi.computeKpisFromRows({
      filters: { campaignId: 5, waveId: null, dateFrom: null, dateTo: null },
      earnedRows: [
        {
          entry_type: "writer_starter_pending",
          entry_status: "pending",
          amount_jod: "0.500",
          activation_campaign_id: 5,
          freelancer_share_jod: "0.500",
        },
        {
          entry_type: "writer_starter_pending",
          entry_status: "pending",
          amount_jod: "0.500",
          activation_campaign_id: 99,
          freelancer_share_jod: "0.500",
        },
        {
          entry_type: "writer_available",
          entry_status: "posted",
          amount_jod: "1.000",
          activation_campaign_id: 5,
        },
      ],
      applications: [{ id: 1, freelancer_user_id: 1, activation_campaign_id: 5 }],
    });
    assert.equal(out.financial.pendingFreelancerEarnedJod, "0.500");
  });

  it("campaign and wave filters scope funnel cohort", () => {
    const out = kpi.computeKpisFromRows({
      filters: { campaignId: 5, waveId: 7, dateFrom: null, dateTo: null },
      trials: [
        {
          freelancer_user_id: 1,
          status: "trial_active",
          started_at: "2026-08-01T00:00:00.000Z",
          first_bid_at: "2026-08-02T00:00:00.000Z",
        },
        {
          freelancer_user_id: 99,
          status: "trial_active",
          started_at: "2026-08-01T00:00:00.000Z",
          first_bid_at: "2026-08-02T00:00:00.000Z",
        },
      ],
      applications: [
        {
          id: 1,
          freelancer_user_id: 1,
          status: "pending",
          activation_campaign_id: 5,
          activation_wave_id: 7,
        },
      ],
    });
    assert.equal(out.funnel.trialActivatedUsers, 1);
    assert.equal(out.funnel.firstBidUsers, 1);
  });

  it("article quality rates and unavailable metrics", () => {
    const out = kpi.computeKpisFromRows({
      filters: { campaignId: 5, waveId: null, dateFrom: null, dateTo: null },
      applications: [
        { id: 1, freelancer_user_id: 1, activation_campaign_id: 5, status: "selected" },
        { id: 2, freelancer_user_id: 2, activation_campaign_id: 5, status: "selected" },
        { id: 3, freelancer_user_id: 3, activation_campaign_id: 5, status: "selected" },
      ],
      submissions: [
        { article_application_id: 1, status: "approved", updated_at: "2026-08-05T00:00:00.000Z" },
        { article_application_id: 2, status: "rejected", updated_at: "2026-08-05T00:00:00.000Z" },
        {
          article_application_id: 3,
          status: "revision_requested",
          updated_at: "2026-08-05T00:00:00.000Z",
        },
      ],
      publishRecords: [
        { orderz_application_id: 1, status: "published", published_at: "2026-08-06T00:00:00.000Z" },
      ],
    });
    assert.equal(out.articleQuality.acceptedArticleCount, 1);
    assert.equal(out.articleQuality.rejectedArticleCount, 1);
    assert.equal(out.articleQuality.revisionRequestedCount, 1);
    assert.equal(out.articleQuality.publishedArticleCount, 1);
    assert.equal(out.articleQuality.articleAcceptanceRate, Number((1 / 3).toFixed(6)));
    assert.ok(
      out.metadata.unavailableMetrics.some((m) => m.key === "financial.subscriptionRevenueJod"),
    );
  });
});

describe("Phase A7.1 KPI service + route guard", () => {
  it("getFreelancerActivationKpis works with fake client and schema-missing", async () => {
    const client = createFakeClient({
      trials: [
        {
          freelancer_user_id: 1,
          status: "trial_active",
          started_at: "2026-08-01T00:00:00.000Z",
          first_bid_at: "2026-08-02T00:00:00.000Z",
        },
      ],
      events: [],
      applications: [],
      submissions: [],
      publishRecords: [],
      campaigns: [],
      waves: [],
      earnedRows: [],
    });
    const out = await kpi.getFreelancerActivationKpis({}, { client });
    assert.equal(out.schemaReady, true);
    assert.equal(out.funnel.trialActivatedUsers, 1);
    assert.equal(out.funnel.firstBidUsers, 1);

    const missing = await kpi.getFreelancerActivationKpis(
      {},
      { client: createFakeClient({ schemaMissing: true }) },
    );
    assert.equal(missing.schemaReady, false);
    assert.equal(missing.funnel.trialActivatedUsers, 0);
  });

  it("invalid filters reject and Super Admin route is guarded", () => {
    assert.throws(
      () => kpi.parseKpiFilters({ campaignId: "x" }),
      (err) => err.publicCode === "INVALID_KPI_FILTER",
    );
    assert.throws(
      () =>
        kpi.parseKpiFilters({
          dateFrom: "2026-08-20",
          dateTo: "2026-08-01",
        }),
      (err) => err.publicCode === "INVALID_KPI_FILTER",
    );
    const routes = read("src/routes/superAdminFreelancerActivationRoutes.js");
    assert.match(
      routes,
      /router\.get\("\/freelancer-activation\/kpis", \.\.\.guard, controller\.getAdminKpis\)/,
    );
    assert.match(routes, /const guard = \[requireAuth, requireSuperAdmin\]/);
  });

  it("does not return PII fields", () => {
    const out = kpi.computeKpisFromRows({
      filters: { campaignId: null, waveId: null, dateFrom: null, dateTo: null },
      trials: [
        {
          freelancer_user_id: 1,
          status: "trial_active",
          started_at: "2026-08-01T00:00:00.000Z",
          email: "secret@example.com",
        },
      ],
    });
    const json = JSON.stringify(out);
    assert.doesNotMatch(json, /secret@example\.com/);
    assert.doesNotMatch(json, /"email"/);
  });
});
