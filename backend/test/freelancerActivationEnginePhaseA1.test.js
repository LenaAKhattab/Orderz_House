/**
 * Phase A1 — Freelancer Activation Engine foundation (static + mocked client).
 * Does not apply migrations. No Production / git / Stripe / orders.
 *
 * Run: node --test test/freelancerActivationEnginePhaseA1.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a1_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  FREELANCER_ACTIVATION_SETTINGS_DEFAULTS,
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

function createFakeClient(mem) {
  mem.events = mem.events || [];
  mem.trial = mem.trial || null;
  mem.nextId = mem.nextId || 1;
  mem.grants = mem.grants || [];
  mem.nextGrantId = mem.nextGrantId || 9001;
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
        const key = params[0];
        const found = mem.grants.find((g) => g.idempotency_key === key);
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
        mem.ledger = mem.ledger || [];
        mem.ledger.push({ event_type: params[2], amount: params[3], grant_id: params[1] });
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
        const done = mem.courseCompleted ? [{ completed_at: new Date().toISOString() }] : [];
        return { rows: done };
      }
      if (s.includes("FROM course_assignments")) {
        return {
          rows: [
            {
              total: mem.courseTotal || 0,
              completed: mem.courseCompletedCount || 0,
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
      if (s.includes("INSERT INTO freelancer_activation_events")) {
        mem.events.push({
          freelancer_user_id: params[0],
          trial_id: params[1],
          event_type: params[2],
          metadata: params[3],
        });
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
          expired_at: null,
          archived_at: null,
          trial_bid_limit: params[4],
          daily_bid_limit: params[5],
          trial_duration_days: params[6],
          successful_work_cap: params[7],
          accepted_work_count: 0,
          published_work_count: 0,
          first_bid_at: null,
          first_win_at: null,
          first_accepted_at: null,
          first_published_at: null,
          silver_cta_first_shown_at: null,
          silver_paid_at: null,
          created_at: params[2],
          updated_at: params[2],
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
          mem.trial.expired_at = params[1] || new Date().toISOString();
        }
        return { rows: mem.trial ? [mem.trial] : [] };
      }
      if (s.includes("UPDATE freelancer_activation_trials SET")) {
        mem.trial = {
          ...mem.trial,
          status: "trial_active",
          source_membership_id: params[1] || mem.trial.source_membership_id,
          started_at: params[2],
          ends_at: params[3],
          trial_bid_limit: params[4],
          daily_bid_limit: params[5],
          trial_duration_days: params[6],
          successful_work_cap: params[7],
        };
        return { rows: [mem.trial] };
      }
      if (s.includes("GROUP BY status") || s.includes("JOIN users u")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in A1 fake client: ${s.slice(0, 180)}`);
    },
  };
}

const eligibleUser = {
  id: 41,
  role: "freelancer",
  is_active: true,
  email_verified: true,
};

describe("Phase A1 migration safety", () => {
  it("167 is additive with engine default false and no destructive SQL", () => {
    const sql = read("sql/migrations/167_freelancer_activation_engine_a1.sql");
    assert.match(sql, /167_freelancer_activation_engine_a1/);
    assert.match(sql, /freelancer_activation_engine_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS freelancer_activation_trials/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS freelancer_activation_events/);
    assert.match(sql, /UNIQUE \(freelancer_user_id\)/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/);
    assert.doesNotMatch(sql, /\bDELETE FROM\b/);
  });

  it("activation service does not call Stripe, orders, Pantry, Bildazo, or claims", () => {
    const src = read("src/services/freelancerActivationEngineService.js");
    assert.doesNotMatch(src, /require\(["'].*stripe/i);
    assert.doesNotMatch(src, /require\(["'].*ordersService/);
    assert.doesNotMatch(src, /require\(["'].*financialClaims/);
    assert.doesNotMatch(src, /require\(["'].*pantry/i);
    assert.doesNotMatch(src, /require\(["'].*bildazo/i);
    assert.doesNotMatch(src, /createAndActivateMarketplaceMembership/);
    assert.doesNotMatch(src, /reserveBidCredits/);
  });

  it("article apply service wires the engine only behind a flag-gated helper", () => {
    const src = read("src/services/marketplaceArticleApplicationsService.js");
    assert.match(src, /freelancerActivationEngineService/);
    assert.match(src, /assertTrialEligibleForMiniArticleApply/);
  });

  it("app mounts freelancer and super-admin A1 routes", () => {
    const src = read("src/app.js");
    assert.match(src, /freelancerActivationEngineRoutes/);
    assert.match(src, /superAdminFreelancerActivationRoutes/);
    assert.match(src, /stripeWebhookRoutes/);
  });
});

describe("Phase A1 settings defaults", () => {
  it("loads documented defaults", () => {
    assert.equal(FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.engineEnabled, false);
    assert.equal(FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.trialDurationDays, 10);
    assert.equal(FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.trialBids, 20);
    assert.equal(FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.dailyBidLimit, 2);
    assert.equal(FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.successfulWorkCap, 2);
    assert.equal(FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.requiresTraining, true);
    assert.equal(FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.requiresVerification, true);
    assert.equal(FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.silverPlanCode, "silver");
    assert.equal(FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.archiveAfterDays, 45);
    const mapped = service.mapSettingsRow(null);
    assert.deepEqual(mapped, { ...FREELANCER_ACTIVATION_SETTINGS_DEFAULTS });
  });
});

describe("Phase A1 eligibility / activation", () => {
  it("engine disabled returns no-op state and does not inspect subscriptions", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: false }) };
    const client = createFakeClient(mem);
    const originalQuery = client.query.bind(client);
    let extra = 0;
    client.query = async (sql, params) => {
      if (String(sql).includes("freelancer_subscriptions")) extra += 1;
      return originalQuery(sql, params);
    };
    const state = await service.getFreelancerActivationTrialState(41, { client });
    assert.equal(state.engineEnabled, false);
    assert.equal(state.status, "not_started");
    assert.equal(state.canActivate, false);
    assert.equal(state.nextRequiredAction, "none");
    assert.equal(extra, 0);
  });

  it("eligible user can activate when flag enabled", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      user: eligibleUser,
      subscription: { activation_status: "company_approved" },
      requiredCourseId: 9,
      courseCompleted: true,
    };
    const client = createFakeClient(mem);
    const now = new Date("2026-08-19T10:00:00.000Z");
    const out = await service.activateFreelancerTrialIfEligible(41, { actorUserId: 41 }, { client, now });
    assert.equal(out.created, true);
    assert.equal(out.trial.status, "trial_active");
    assert.equal(out.trial.trialBidLimit, 20);
    assert.equal(out.trial.dailyBidLimit, 2);
    assert.equal(out.trial.trialDurationDays, 10);
    assert.equal(out.trial.successfulWorkCap, 2);
    assert.equal(new Date(out.trial.endsAt).toISOString(), "2026-08-29T10:00:00.000Z");
    assert.equal(mem.events[0].event_type, FREELANCER_ACTIVATION_EVENT_TYPES.TRIAL_ACTIVATED);
    assert.equal(out.trial.trialBidGrantedAmount, 20);
    assert.equal(mem.grants.length, 1);
    assert.equal(mem.grants[0].source_type, "freelancer_activation_trial");
    assert.equal(mem.grants[0].expires_at, "2026-08-29T10:00:00.000Z");
    assert.ok(mem.events.some((e) => e.event_type === FREELANCER_ACTIVATION_EVENT_TYPES.TRIAL_BID_GRANTED));
  });

  it("ineligible user cannot activate if verification/training missing", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      user: { ...eligibleUser, email_verified: false },
      subscription: { activation_status: "company_pending" },
      requiredCourseId: 9,
      courseCompleted: false,
    };
    const client = createFakeClient(mem);
    await assert.rejects(
      () => service.activateFreelancerTrialIfEligible(41, { actorUserId: 41 }, { client }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.NOT_ELIGIBLE,
    );
    const state = await service.getFreelancerActivationTrialState(41, { client });
    assert.equal(state.eligibility.emailVerified, false);
    assert.equal(state.eligibility.trainingCompleted, false);
    assert.equal(state.canActivate, false);
    assert.equal(state.nextRequiredAction, "verify_email");
  });

  it("engine disabled cannot activate", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_engine_enabled: false }),
      user: eligibleUser,
    };
    const client = createFakeClient(mem);
    await assert.rejects(
      () => service.activateFreelancerTrialIfEligible(41, {}, { client }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.ENGINE_DISABLED,
    );
  });

  it("one-time trial: active trial returns existing; archived cannot start again", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      user: eligibleUser,
      subscription: { activation_status: "company_approved" },
      requiredCourseId: 9,
      courseCompleted: true,
      trial: {
        id: 7,
        freelancer_user_id: 41,
        status: "trial_active",
        started_at: "2026-08-19T10:00:00.000Z",
        ends_at: "2026-08-29T10:00:00.000Z",
        trial_bid_limit: 20,
        daily_bid_limit: 2,
        trial_duration_days: 10,
        successful_work_cap: 2,
        accepted_work_count: 0,
        published_work_count: 0,
      },
    };
    const client = createFakeClient(mem);
    const again = await service.activateFreelancerTrialIfEligible(41, {}, { client });
    assert.equal(again.created, false);
    assert.equal(again.idempotent, true);
    assert.equal(again.trial.id, 7);
    assert.equal(mem.grants.length, 1);
    const twice = await service.activateFreelancerTrialIfEligible(41, {}, { client });
    assert.equal(twice.idempotent, true);
    assert.equal(mem.grants.length, 1);

    mem.trial.status = "archived";
    await assert.rejects(
      () => service.activateFreelancerTrialIfEligible(41, {}, { client }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.ALREADY_USED,
    );
  });

  it("expired status cannot get a second trial", async () => {
    const mem = {
      settings: settingsRow({ freelancer_activation_engine_enabled: true }),
      user: eligibleUser,
      subscription: { activation_status: "company_approved" },
      requiredCourseId: 9,
      courseCompleted: true,
      trial: {
        id: 8,
        freelancer_user_id: 41,
        status: "trial_expired_high_intent",
        trial_bid_limit: 20,
        daily_bid_limit: 2,
        trial_duration_days: 10,
        successful_work_cap: 2,
        accepted_work_count: 0,
        published_work_count: 0,
      },
    };
    const client = createFakeClient(mem);
    await assert.rejects(
      () => service.activateFreelancerTrialIfEligible(41, {}, { client }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.ALREADY_USED,
    );
  });
});
