/**
 * Phase A2 — trial Mini Article eligibility + bid limits (static + mocked client).
 * Does not apply migrations. No Production / git / Stripe / orders.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a2_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  FREELANCER_ACTIVATION_ERROR_CODES,
  FREELANCER_ACTIVATION_EVENT_TYPES,
} = require("../src/constants/freelancerActivationEngine");
const service = require("../src/services/freelancerActivationEngineService");

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

function activeTrial(overrides = {}) {
  return {
    id: 3,
    freelancer_user_id: 41,
    status: "trial_active",
    started_at: "2026-08-19T00:00:00.000Z",
    ends_at: "2026-08-29T00:00:00.000Z",
    trial_bid_limit: 20,
    daily_bid_limit: 2,
    trial_duration_days: 10,
    successful_work_cap: 2,
    accepted_work_count: 0,
    published_work_count: 0,
    ...overrides,
  };
}

function createFakeClient(mem) {
  mem.events = mem.events || [];
  mem.applications = mem.applications || [];
  return {
    async query(sql, params = []) {
      const s = String(sql);
      if (/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/.test(s)) return { rows: [] };
      if (s.includes("freelancer_activation_engine_enabled")) {
        return { rows: [mem.settings] };
      }
      if (s.includes("FROM freelancer_marketplace_memberships")) {
        return { rows: mem.membership ? [mem.membership] : [] };
      }
      if (s.includes("FROM freelancer_activation_trials WHERE freelancer_user_id")) {
        return { rows: mem.trial ? [mem.trial] : [] };
      }
      if (s.includes("trial_expired_high_intent")) {
        if (mem.trial) {
          mem.trial.status = "trial_expired_high_intent";
          mem.trial.expired_at = params[1] || new Date().toISOString();
        }
        mem.events.push({ event_type: FREELANCER_ACTIVATION_EVENT_TYPES.TRIAL_EXPIRED });
        return { rows: mem.trial ? [mem.trial] : [] };
      }
      if (s.includes("FROM marketplace_article_applications")) {
        return { rows: mem.applications };
      }
      if (s.includes("INSERT INTO freelancer_activation_events")) {
        mem.events.push({ event_type: params[2] });
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in A2 fake client: ${s.slice(0, 160)}`);
    },
  };
}

describe("Phase A2 architecture", () => {
  it("does not add a second Bid currency or new migration", () => {
    assert.equal(fs.existsSync(path.join(root, "sql/migrations/168_freelancer_activation_engine_a2.sql")), false);
    const svc = read("src/services/freelancerActivationEngineService.js");
    assert.match(svc, /countTrialUsageFromRows/);
    assert.doesNotMatch(svc, /freelancer_activation_trial_bid_events/);
    assert.doesNotMatch(svc, /require\(["'].*stripe/i);
    assert.doesNotMatch(svc, /require\(["'].*ordersService/);
  });

  it("apply guard runs before Bid reserve; consume/release remain in existing services", () => {
    const apply = read("src/services/marketplaceArticleApplicationsService.js");
    const trialIdx = apply.indexOf("assertTrialEligibleForMiniArticleApply");
    const insertIdx = apply.indexOf("INSERT INTO marketplace_article_applications");
    const reserveIdx = apply.indexOf("reserveBidCreditsFefo");
    assert.ok(trialIdx > 0 && trialIdx < insertIdx && insertIdx < reserveIdx);
    assert.match(apply, /releaseApplicationReservation|consumeBidCreditReservation|finalizeArticleApproval/);
    const settlement = read("src/services/marketplaceArticleSettlementService.js");
    assert.match(settlement, /consumeBidCreditReservation/);
    const fair = read("src/services/articleFairDistributionAdapterService.js");
    assert.doesNotMatch(fair, /assertTrialEligibleForMiniArticleApply/);
  });
});

describe("Phase A2 usage counting", () => {
  it("does not double-count duplicate application ids; released reservations do not count", () => {
    const trial = service.mapTrialRow(activeTrial());
    const usage = service.countTrialUsageFromRows(
      [
        { id: 1, status: "pending", created_at: "2026-08-19T12:00:00.000Z", reservation_status: "active" },
        { id: 1, status: "pending", created_at: "2026-08-19T12:00:00.000Z", reservation_status: "active" },
        { id: 2, status: "pending", created_at: "2026-08-19T12:00:00.000Z", reservation_status: "released" },
        { id: 3, status: "withdrawn", created_at: "2026-08-19T12:00:00.000Z", reservation_status: "active" },
      ],
      { trial, now: new Date("2026-08-19T15:00:00.000Z"), spendDate: "2026-08-19" },
    );
    assert.equal(usage.trialBidsUsed, 1);
    assert.equal(usage.dailyUsed, 1);
  });
});

describe("Phase A2 apply gate", () => {
  it("engine off skips and allows existing behavior", async () => {
    const client = createFakeClient({ settings: settingsRow({ freelancer_activation_engine_enabled: false }) });
    const out = await service.evaluateTrialMiniArticleApplyGate({
      client,
      freelancerUserId: 41,
      surface: "mini_article",
    });
    assert.equal(out.skipped, true);
    assert.equal(out.allowed, true);
  });

  it("engine on + no trial + no paid membership blocks", async () => {
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
    });
    await assert.rejects(
      () => service.assertTrialEligibleForMiniArticleApply({
        client,
        freelancerUserId: 41,
        surface: "mini_article",
      }),
      (err) =>
        err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_REQUIRED &&
        err.meta?.nextRequiredAction === "activate_trial",
    );
  });

  it("engine on + trial_active allows Mini Article apply", async () => {
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      trial: activeTrial(),
    });
    const out = await service.evaluateTrialMiniArticleApplyGate({
      client,
      freelancerUserId: 41,
      now: new Date("2026-08-20T10:00:00.000Z"),
      surface: "mini_article",
    });
    assert.equal(out.allowed, true);
    assert.equal(out.usage.trialBidsUsed, 0);
  });

  it("daily limit reached blocks", async () => {
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      trial: activeTrial({ daily_bid_limit: 2 }),
      applications: [
        { id: 10, status: "pending", created_at: "2026-08-20T08:00:00.000Z", reservation_status: "active" },
        { id: 11, status: "pending", created_at: "2026-08-20T09:00:00.000Z", reservation_status: "active" },
      ],
    });
    await assert.rejects(
      () => service.assertTrialEligibleForMiniArticleApply({
        client,
        freelancerUserId: 41,
        now: new Date("2026-08-20T10:00:00.000Z"),
        surface: "mini_article",
      }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_DAILY_BID_LIMIT_REACHED,
    );
  });

  it("total trial bid limit reached blocks", async () => {
    const apps = [];
    for (let i = 0; i < 20; i += 1) {
      apps.push({
        id: 100 + i,
        status: "pending",
        created_at: "2026-08-19T12:00:00.000Z",
        reservation_status: "consumed",
      });
    }
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      trial: activeTrial({ trial_bid_limit: 20 }),
      applications: apps,
    });
    await assert.rejects(
      () => service.assertTrialEligibleForMiniArticleApply({
        client,
        freelancerUserId: 41,
        now: new Date("2026-08-21T10:00:00.000Z"),
        surface: "mini_article",
      }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_BID_LIMIT_REACHED,
    );
  });

  it("expired trial lazy-transitions and blocks", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      trial: activeTrial({ ends_at: "2026-08-18T00:00:00.000Z" }),
    };
    const client = createFakeClient(mem);
    await assert.rejects(
      () => service.assertTrialEligibleForMiniArticleApply({
        client,
        freelancerUserId: 41,
        now: new Date("2026-08-20T10:00:00.000Z"),
        surface: "mini_article",
      }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_EXPIRED,
    );
    assert.equal(mem.trial.status, "trial_expired_high_intent");
  });

  it("work cap reached blocks", async () => {
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      trial: activeTrial({ successful_work_cap: 2 }),
      applications: [
        { id: 1, status: "approved", created_at: "2026-08-19T12:00:00.000Z", reservation_status: "consumed" },
        { id: 2, status: "approved", created_at: "2026-08-19T13:00:00.000Z", reservation_status: "consumed" },
      ],
    });
    await assert.rejects(
      () => service.assertTrialEligibleForMiniArticleApply({
        client,
        freelancerUserId: 41,
        now: new Date("2026-08-20T10:00:00.000Z"),
        surface: "mini_article",
      }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_WORK_CAP_REACHED,
    );
  });

  it("paid Silver bypasses trial restrictions", async () => {
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      membership: { tier_code: "silver", membership_id: 9 },
    });
    const out = await service.evaluateTrialMiniArticleApplyGate({
      client,
      freelancerUserId: 41,
      surface: "mini_article",
    });
    assert.equal(out.allowed, true);
    assert.equal(out.bypass, "paid_membership");
  });

  it("non Mini Article surface is blocked for trial users", async () => {
    const client = createFakeClient({
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      trial: activeTrial(),
    });
    await assert.rejects(
      () => service.assertTrialEligibleForMiniArticleApply({
        client,
        freelancerUserId: 41,
        now: new Date("2026-08-20T10:00:00.000Z"),
        surface: "pantry",
      }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_MINI_ARTICLES_ONLY,
    );
  });
});
