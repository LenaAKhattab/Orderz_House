/**
 * Phase A2.1 — one-time trial Bid Credit grant (static + mocked client).
 * Does not apply migrations. No Production / git / Stripe / orders.
 *
 * Run: node --test test/freelancerActivationEnginePhaseA21.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a21_placeholder";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  FREELANCER_ACTIVATION_ERROR_CODES,
  FREELANCER_ACTIVATION_EVENT_TYPES,
  FREELANCER_ACTIVATION_TRIAL_BID_SOURCE,
  FREELANCER_ACTIVATION_TRIAL_BID_LEDGER_EVENT,
} = require("../src/constants/freelancerActivationEngine");
const { BID_CREDIT_SOURCE_TYPES, BID_CREDIT_LEDGER_EVENT_TYPES } = require("../src/constants/marketplaceBidCredits");
const { clearMarketplaceBidCreditsSchemaCache } = require("../src/utils/marketplaceBidCreditsSchema");
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

const eligibleUser = {
  id: 41,
  role: "freelancer",
  is_active: true,
  email_verified: true,
};

function eligibleMem(overrides = {}) {
  return {
    settings: settingsRow({ freelancer_activation_engine_enabled: true }),
    user: eligibleUser,
    subscription: { activation_status: "company_approved" },
    requiredCourseId: 9,
    courseCompleted: true,
    ...overrides,
  };
}

function createFakeClient(mem) {
  mem.events = mem.events || [];
  mem.trial = mem.trial || null;
  mem.nextId = mem.nextId || 1;
  mem.grants = mem.grants || [];
  mem.nextGrantId = mem.nextGrantId || 9001;
  mem.applications = mem.applications || [];
  return {
    async query(sql, params = []) {
      const s = String(sql);
      if (/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/.test(s)) return { rows: [] };
      if (s.includes("to_regclass('public.marketplace_bid_credit_grants')")) {
        return {
          rows: [{
            grants: "marketplace_bid_credit_grants",
            ledger: "marketplace_bid_credit_ledger_entries",
            dist: "marketplace_membership_bid_distribution_months",
            packages: "marketplace_bid_credit_packages",
          }],
        };
      }
      if (s.includes("FROM marketplace_bid_credit_grants WHERE idempotency_key")) {
        const found = mem.grants.find((g) => g.idempotency_key === params[0]);
        return { rows: found ? [found] : [] };
      }
      if (s.includes("INSERT INTO marketplace_bid_credit_grants")) {
        if (mem.failGrant) {
          const err = new Error("bid grant check");
          err.code = "23514";
          throw err;
        }
        const grant = {
          id: mem.nextGrantId++,
          freelancer_user_id: params[0],
          source_type: params[1],
          amount_granted: params[2],
          amount_consumed: 0,
          amount_expired: 0,
          amount_reserved: 0,
          status: "active",
          granted_at: params[3],
          expires_at: params[4],
          membership_id: params[5],
          reason: params[8],
          actor_user_id: params[10],
          idempotency_key: params[11],
          metadata: params[12],
        };
        mem.grants.push(grant);
        return { rows: [grant] };
      }
      if (s.includes("INSERT INTO marketplace_bid_credit_ledger_entries")) {
        return { rows: [] };
      }
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
        return { rows: mem.courseCompleted ? [{ completed_at: new Date().toISOString() }] : [] };
      }
      if (s.includes("FROM course_assignments")) {
        return { rows: [{ total: 0, completed: 0 }] };
      }
      if (s.includes("FROM freelancer_marketplace_memberships")) {
        return { rows: mem.membership ? [mem.membership] : [] };
      }
      if (s.includes("FROM freelancer_activation_trials WHERE freelancer_user_id")) {
        return { rows: mem.trial ? [mem.trial] : [] };
      }
      if (s.includes("FROM marketplace_article_applications") || s.includes("JOIN marketplace_bid_credit_reservations")) {
        return { rows: mem.applications };
      }
      if (s.includes("INSERT INTO freelancer_activation_events")) {
        mem.events.push({ event_type: params[2], metadata: params[3] });
        return { rows: [] };
      }
      if (s.includes("INSERT INTO freelancer_activation_trials")) {
        mem.trial = {
          id: mem.nextId++,
          freelancer_user_id: params[0],
          status: "trial_active",
          source_membership_id: params[1],
          started_at: params[2],
          ends_at: params[3],
          trial_bid_limit: params[4],
          daily_bid_limit: params[5],
          trial_duration_days: params[6],
          successful_work_cap: params[7],
          accepted_work_count: 0,
          published_work_count: 0,
        };
        return { rows: [mem.trial] };
      }
      if (s.includes("trial_bid_granted_at")) {
        if (mem.trial) {
          mem.trial = {
            ...mem.trial,
            trial_bid_granted_at: params[1],
            trial_bid_grant_reference: params[2],
            trial_bid_granted_amount: params[3],
          };
        }
        return { rows: mem.trial ? [mem.trial] : [] };
      }
      if (s.includes("trial_expired_high_intent")) {
        if (mem.trial) {
          mem.trial.status = "trial_expired_high_intent";
          mem.trial.expired_at = params[1];
        }
        return { rows: mem.trial ? [mem.trial] : [] };
      }
      throw new Error(`Unexpected SQL in A2.1 fake client: ${s.slice(0, 180)}`);
    },
  };
}

beforeEach(() => {
  clearMarketplaceBidCreditsSchemaCache();
});

describe("Phase A2.1 migration 168", () => {
  it("is additive, does not edit 167, and adds trial grant source", () => {
    const sql = read("sql/migrations/168_freelancer_activation_trial_bid_grant.sql");
    assert.match(sql, /168_freelancer_activation_trial_bid_grant/);
    assert.match(sql, /freelancer_activation_trial/);
    assert.match(sql, /FREELANCER_ACTIVATION_TRIAL_GRANT/);
    assert.match(sql, /trial_bid_granted_at/);
    assert.match(sql, /trial_bid_grant_reference/);
    assert.match(sql, /trial_bid_granted_amount/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/);
    const a1 = read("sql/migrations/167_freelancer_activation_engine_a1.sql");
    assert.doesNotMatch(a1, /trial_bid_granted_at/);
  });

  it("JS Bid Credit vocabulary includes the trial source without dropping admin_manual", () => {
    assert.ok(BID_CREDIT_SOURCE_TYPES.includes("freelancer_activation_trial"));
    assert.ok(BID_CREDIT_SOURCE_TYPES.includes("admin_manual"));
    assert.ok(BID_CREDIT_LEDGER_EVENT_TYPES.includes("FREELANCER_ACTIVATION_TRIAL_GRANT"));
    assert.ok(BID_CREDIT_LEDGER_EVENT_TYPES.includes("ADMIN_BID_GRANT"));
    assert.equal(FREELANCER_ACTIVATION_TRIAL_BID_SOURCE, "freelancer_activation_trial");
    assert.equal(FREELANCER_ACTIVATION_TRIAL_BID_LEDGER_EVENT, "FREELANCER_ACTIVATION_TRIAL_GRANT");
  });
});

describe("Phase A2.1 grant on activation", () => {
  it("engine off: activate refuses and does not grant", async () => {
    const mem = eligibleMem({
      settings: settingsRow({ freelancer_activation_engine_enabled: false }),
    });
    const client = createFakeClient(mem);
    await assert.rejects(
      () => service.activateFreelancerTrialIfEligible(41, {}, { client }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.ENGINE_DISABLED,
    );
    assert.equal(mem.grants.length, 0);
    assert.equal(mem.trial, null);
  });

  it("eligible activation grants 20 Bids by default with daily limit 2", async () => {
    const mem = eligibleMem();
    const client = createFakeClient(mem);
    const now = new Date("2026-08-19T10:00:00.000Z");
    const out = await service.activateFreelancerTrialIfEligible(41, { actorUserId: 41 }, { client, now });
    assert.equal(out.created, true);
    assert.equal(out.trial.trialBidGrantedAmount, 20);
    assert.equal(out.trial.dailyBidLimit, 2);
    assert.equal(mem.grants[0].amount_granted, 20);
    assert.equal(mem.grants[0].source_type, "freelancer_activation_trial");
    assert.equal(mem.grants[0].expires_at, out.trial.endsAt);
    assert.ok(mem.events.some((e) => e.event_type === FREELANCER_ACTIVATION_EVENT_TYPES.TRIAL_BID_GRANTED));
  });

  it("grant amount follows settings", async () => {
    const mem = eligibleMem({
      settings: settingsRow({
        freelancer_activation_engine_enabled: true,
        freelancer_activation_trial_bids: 11,
        freelancer_activation_daily_bid_limit: 2,
      }),
    });
    const client = createFakeClient(mem);
    const out = await service.activateFreelancerTrialIfEligible(41, {}, { client, now: new Date("2026-08-19T10:00:00.000Z") });
    assert.equal(out.trial.trialBidGrantedAmount, 11);
    assert.equal(out.trial.dailyBidLimit, 2);
    assert.equal(mem.grants[0].amount_granted, 11);
  });

  it("repeated activate does not duplicate grant", async () => {
    const mem = eligibleMem();
    const client = createFakeClient(mem);
    const now = new Date("2026-08-19T10:00:00.000Z");
    await service.activateFreelancerTrialIfEligible(41, {}, { client, now });
    const second = await service.activateFreelancerTrialIfEligible(41, {}, { client, now });
    assert.equal(second.idempotent, true);
    assert.equal(mem.grants.length, 1);
  });

  it("partial retry stamps metadata without inserting a second grant", async () => {
    const mem = eligibleMem({
      trial: {
        id: 3,
        freelancer_user_id: 41,
        status: "trial_active",
        started_at: "2026-08-19T10:00:00.000Z",
        ends_at: "2026-08-29T10:00:00.000Z",
        trial_bid_limit: 20,
        daily_bid_limit: 2,
        trial_duration_days: 10,
        successful_work_cap: 2,
      },
      grants: [{
        id: 500,
        freelancer_user_id: 41,
        source_type: "freelancer_activation_trial",
        amount_granted: 20,
        amount_consumed: 0,
        amount_expired: 0,
        amount_reserved: 0,
        status: "active",
        idempotency_key: "activation_trial_bid_grant:3",
      }],
    });
    const client = createFakeClient(mem);
    const out = await service.activateFreelancerTrialIfEligible(41, {}, {
      client,
      now: new Date("2026-08-19T12:00:00.000Z"),
    });
    assert.equal(out.idempotent, true);
    assert.equal(mem.grants.length, 1);
    assert.equal(out.trial.trialBidGrantReference, "500");
    assert.equal(out.trial.trialBidGrantedAmount, 20);
  });

  it("grant failure does not stamp trial grant metadata", async () => {
    const mem = eligibleMem({ failGrant: true });
    const client = createFakeClient(mem);
    await assert.rejects(
      () => service.activateFreelancerTrialIfEligible(41, {}, { client, now: new Date("2026-08-19T10:00:00.000Z") }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_BID_GRANT_FAILED,
    );
    assert.equal(mem.grants.length, 0);
    assert.equal(mem.trial?.trial_bid_granted_at, undefined);
  });

  it("expired and archived users cannot receive a new grant", async () => {
    for (const status of ["trial_expired_high_intent", "archived", "paid_active"]) {
      const mem = eligibleMem({
        trial: {
          id: 8,
          freelancer_user_id: 41,
          status,
          trial_bid_limit: 20,
          daily_bid_limit: 2,
          ends_at: "2026-08-01T00:00:00.000Z",
        },
      });
      const client = createFakeClient(mem);
      await assert.rejects(
        () => service.activateFreelancerTrialIfEligible(41, {}, { client }),
        (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.ALREADY_USED,
      );
      assert.equal(mem.grants.length, 0);
    }
  });

  it("paid Silver still bypasses trial apply gates", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      membership: { tier_code: "silver", membership_id: 9 },
    };
    const client = createFakeClient(mem);
    const out = await service.evaluateTrialMiniArticleApplyGate({
      client,
      freelancerUserId: 41,
      now: new Date("2026-08-20T10:00:00.000Z"),
      surface: "mini_article",
    });
    assert.equal(out.allowed, true);
    assert.equal(out.bypass, "paid_membership");
  });
});

describe("Phase A2.1 reuse of existing Bid Credit paths", () => {
  it("FEFO reserve does not filter grant source_type", () => {
    const src = read("src/services/marketplaceBidCreditReservationService.js");
    assert.match(src, /ORDER BY expires_at ASC, id ASC/);
    assert.doesNotMatch(src, /source_type\s*=/);
    assert.match(src, /grantSourceType: g\.source_type/);
    assert.match(src, /BID_RESERVE_RELEASE/);
    assert.match(src, /BID_RESERVE_CONSUME/);
  });

  it("admin manual grant still uses admin_manual / ADMIN_BID_GRANT", () => {
    const src = read("src/services/marketplaceBidCreditsService.js");
    assert.match(src, /sourceType: "admin_manual"/);
    assert.match(src, /eventType: "ADMIN_BID_GRANT"/);
    assert.doesNotMatch(src, /freelancer_activation_trial/);
  });

  it("article apply still uses reserveBidCreditsFefo after trial gates", () => {
    const src = read("src/services/marketplaceArticleApplicationsService.js");
    assert.match(src, /assertTrialEligibleForMiniArticleApply/);
    assert.match(src, /reserveBidCreditsFefo/);
  });

  it("activation grant uses createBidCreditGrant, not a parallel currency", () => {
    const src = read("src/services/freelancerActivationEngineService.js");
    assert.match(src, /createBidCreditGrant/);
    assert.match(src, /freelancer_activation_trial/);
    assert.doesNotMatch(src, /require\(["'].*ordersService/);
    assert.doesNotMatch(src, /require\(["'].*stripe/i);
    assert.doesNotMatch(src, /require\(["'].*pantry/i);
    assert.doesNotMatch(src, /require\(["'].*bildazo/i);
  });
});
