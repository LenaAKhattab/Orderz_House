/**
 * Phase A4.3 — unique-trial fair distribution ranking.
 * Does not apply migrations. No Production / git / Stripe / orders.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a43_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  rankArticleFairCandidates,
} = require("../src/services/articleFairDistributionAdapterService");
const activationFair = require("../src/services/freelancerActivationFairDistributionService");
const {
  ACTIVATION_FAIR_NOT_AVAILABLE,
  ACTIVATION_FAIR_REASON_TAGS,
} = require("../src/constants/freelancerActivationFairDistribution");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const NOW = new Date("2026-08-20T12:00:00.000Z");

function builtCandidate(applicationId, extra = {}) {
  return {
    applicationId,
    freelancerUserId: extra.freelancerUserId || applicationId * 10,
    eligible: extra.eligible !== false,
    recentEffectiveAssignmentsCount: extra.recentEffectiveAssignmentsCount ?? 0,
    appliedAndLostWaitingCount: extra.appliedAndLostWaitingCount ?? 0,
    activeWorkloadCount: extra.activeWorkloadCount ?? 0,
    lastEffectiveAssignmentAt: extra.lastEffectiveAssignmentAt || null,
    submittedAt: extra.submittedAt || "2026-08-18T10:00:00.000Z",
    stableId: String(applicationId),
    status: extra.status || "pending",
  };
}

function trialContext(extra = {}) {
  return {
    ...activationFair.emptyActivationFairContext(),
    trialStatus: "trial_active",
    trialStartedAt: "2026-08-10T00:00:00.000Z",
    ...extra,
  };
}

function rankWithActivation(candidates, contextsByUser, now = NOW) {
  const existing = rankArticleFairCandidates(candidates);
  const map = new Map();
  for (const [userId, ctx] of Object.entries(contextsByUser)) {
    map.set(Number(userId), ctx);
  }
  return activationFair.applyActivationFairRanking(existing, map, { now });
}

describe("Phase A4.3 schema and wiring", () => {
  it("A4.3 ranking does not introduce a migration; later 171 is terms-only", () => {
    const adapter = read("src/services/articleFairDistributionAdapterService.js");
    const scoring = read("src/services/freelancerActivationFairDistributionService.js");
    assert.doesNotMatch(adapter, /171_/);
    assert.doesNotMatch(scoring, /171_/);
    assert.doesNotMatch(read("sql/migrations/167_freelancer_activation_engine_a1.sql"), /activation_unique_trial/);
    assert.doesNotMatch(read("sql/migrations/170_freelancer_activation_budget_a42.sql"), /activation_unique_trial/);
  });

  it("does not auto-assign and keeps pause/budget guards before status change", () => {
    const adapter = read("src/services/articleFairDistributionAdapterService.js");
    assert.match(adapter, /autoAssigned: false/);
    assert.match(adapter, /resolveArticleFairRankingOrder/);
    assert.doesNotMatch(adapter, /assertActivationOpportunityOpen/);
    assert.doesNotMatch(adapter, /status = 'selected'/);
    const apply = read("src/services/marketplaceArticleApplicationsService.js");
    const selectIdx = apply.indexOf("async function selectArticleApplication");
    const select = apply.slice(selectIdx);
    const pauseIdx = select.indexOf("assertActivationOpportunityOpen");
    const rankIdx = select.indexOf("getArticleFairRanking");
    const overrideIdx = select.indexOf("enforceFairSelectionOverride");
    const reserveIdx = select.indexOf("reserveActivationBudgetForAssignment");
    const selectedIdx = select.indexOf("SET status = 'selected'");
    assert.ok(pauseIdx > 0 && pauseIdx < rankIdx);
    assert.ok(rankIdx > 0 && rankIdx < overrideIdx);
    assert.ok(reserveIdx > overrideIdx && reserveIdx < selectedIdx);
    assert.doesNotMatch(adapter, /cron|setInterval|scheduler/i);
    assert.doesNotMatch(read("src/services/freelancerActivationFairDistributionService.js"), /require\(["'].*ordersService/);
    assert.doesNotMatch(read("src/services/freelancerActivationFairDistributionService.js"), /require\(["'].*stripe/i);
    assert.doesNotMatch(read("src/services/freelancerActivationFairDistributionService.js"), /consumeBidCreditReservation/);
  });
});

describe("Phase A4.3 existing ranking fallback", () => {
  it("engine off / unattached keeps lexicographic fair-ranking order", () => {
    const built = [
      builtCandidate(2, { recentEffectiveAssignmentsCount: 3, submittedAt: "2026-08-01T10:00:00.000Z" }),
      builtCandidate(1, { recentEffectiveAssignmentsCount: 0, submittedAt: "2026-08-01T12:00:00.000Z" }),
    ];
    const existing = rankArticleFairCandidates(built);
    const off = activationFair.resolveArticleFairRankingOrder(built, rankArticleFairCandidates, {
      applied: false,
    });
    assert.equal(off.activationFairRankingApplied, false);
    assert.deepEqual(
      off.ranked.map((c) => c.applicationId),
      existing.map((c) => c.applicationId),
    );
    assert.equal(existing[0].applicationId, 1);
    assert.equal(
      activationFair.shouldApplyActivationFairRanking({
        engineEnabled: false,
        article: { activation_campaign_id: 9 },
      }),
      false,
    );
    assert.equal(
      activationFair.shouldApplyActivationFairRanking({
        engineEnabled: true,
        article: { activation_campaign_id: null },
      }),
      false,
    );
    assert.equal(
      activationFair.shouldApplyActivationFairRanking({
        engineEnabled: true,
        article: { activation_campaign_id: 9 },
      }),
      true,
    );
  });
});

describe("Phase A4.3 unique-trial ranking", () => {
  it("zero-win trial freelancer ranks above freelancer with accepted work", () => {
    const ranked = rankWithActivation(
      [
        builtCandidate(1, {
          freelancerUserId: 10,
          recentEffectiveAssignmentsCount: 0,
          submittedAt: "2026-08-01T08:00:00.000Z",
        }),
        builtCandidate(9, {
          freelancerUserId: 90,
          recentEffectiveAssignmentsCount: 4,
          submittedAt: "2026-08-19T08:00:00.000Z",
        }),
      ],
      {
        10: trialContext({ acceptedActivationWorkCount: 1, hasPreviousWin: true }),
        90: trialContext({ acceptedActivationWorkCount: 0, publishedActivationWorkCount: 0 }),
      },
    );
    const existing = rankArticleFairCandidates([
      builtCandidate(1, { freelancerUserId: 10, recentEffectiveAssignmentsCount: 0, submittedAt: "2026-08-01T08:00:00.000Z" }),
      builtCandidate(9, { freelancerUserId: 90, recentEffectiveAssignmentsCount: 4, submittedAt: "2026-08-19T08:00:00.000Z" }),
    ]);
    assert.equal(existing[0].applicationId, 1);
    assert.equal(ranked[0].applicationId, 9);
    assert.equal(ranked[0].activationFairness.rankGroup, "first_activation");
    assert.ok(
      ranked[0].activationFairness.reasonTags.includes(
        ACTIVATION_FAIR_REASON_TAGS.PREFERRED_ACTIVATION_CANDIDATE,
      ),
    );
    assert.ok(
      ranked[0].activationFairness.reasonTags.includes(
        ACTIVATION_FAIR_REASON_TAGS.FIRST_WORK_OPPORTUNITY,
      ),
    );
  });

  it("fewer accepted/published works ranks above more works", () => {
    const ranked = rankWithActivation(
      [
        builtCandidate(1, { freelancerUserId: 11, recentEffectiveAssignmentsCount: 0 }),
        builtCandidate(2, { freelancerUserId: 12, recentEffectiveAssignmentsCount: 3 }),
      ],
      {
        11: trialContext({ acceptedActivationWorkCount: 2, publishedActivationWorkCount: 1, hasPreviousWin: true }),
        12: trialContext({ acceptedActivationWorkCount: 1, publishedActivationWorkCount: 0, hasPreviousWin: true }),
      },
    );
    assert.equal(ranked[0].applicationId, 2);
    assert.equal(ranked[0].activationFairness.metrics.acceptedActivationWorkCount, 1);
  });

  it("lower active workload ranks above higher workload when other metrics equal", () => {
    const ranked = rankWithActivation(
      [builtCandidate(4, { freelancerUserId: 40 }), builtCandidate(5, { freelancerUserId: 50 })],
      {
        40: trialContext({
          acceptedActivationWorkCount: 0,
          activeAssignedWorkCount: 2,
          trialStartedAt: "2026-08-08T00:00:00.000Z",
        }),
        50: trialContext({
          acceptedActivationWorkCount: 0,
          activeAssignedWorkCount: 0,
          trialStartedAt: "2026-08-08T00:00:00.000Z",
        }),
      },
    );
    const existing = rankArticleFairCandidates([
      builtCandidate(4, { freelancerUserId: 40 }),
      builtCandidate(5, { freelancerUserId: 50 }),
    ]);
    assert.equal(existing[0].applicationId, 4);
    assert.equal(ranked[0].applicationId, 5);
    assert.ok(
      ranked[0].activationFairness.reasonTags.includes(ACTIVATION_FAIR_REASON_TAGS.LOW_WORKLOAD),
    );
  });

  it("longer waiting trial ranks above shorter waiting trial when other metrics equal", () => {
    const ranked = rankWithActivation(
      [builtCandidate(6, { freelancerUserId: 60 }), builtCandidate(7, { freelancerUserId: 70 })],
      {
        60: trialContext({
          acceptedActivationWorkCount: 0,
          activeAssignedWorkCount: 0,
          trialStartedAt: "2026-08-16T00:00:00.000Z",
        }),
        70: trialContext({
          acceptedActivationWorkCount: 0,
          activeAssignedWorkCount: 0,
          trialStartedAt: "2026-08-01T00:00:00.000Z",
        }),
      },
    );
    assert.equal(ranked[0].applicationId, 7);
    assert.ok(ranked[0].activationFairness.metrics.waitingDays > ranked[1].activationFairness.metrics.waitingDays);
  });

  it("paid Silver can appear but does not receive trial-first boost", () => {
    const ranked = rankWithActivation(
      [
        builtCandidate(1, {
          freelancerUserId: 90,
          recentEffectiveAssignmentsCount: 0,
          submittedAt: "2026-08-01T08:00:00.000Z",
        }),
        builtCandidate(9, {
          freelancerUserId: 10,
          recentEffectiveAssignmentsCount: 5,
          submittedAt: "2026-08-19T08:00:00.000Z",
        }),
      ],
      {
        90: {
          ...activationFair.emptyActivationFairContext(),
          hasActivePaidSilver: true,
          trialStatus: "paid_active",
          acceptedActivationWorkCount: 0,
        },
        10: trialContext({ acceptedActivationWorkCount: 0 }),
      },
    );
    const existing = rankArticleFairCandidates([
      builtCandidate(1, { freelancerUserId: 90, recentEffectiveAssignmentsCount: 0, submittedAt: "2026-08-01T08:00:00.000Z" }),
      builtCandidate(9, { freelancerUserId: 10, recentEffectiveAssignmentsCount: 5, submittedAt: "2026-08-19T08:00:00.000Z" }),
    ]);
    assert.equal(existing[0].applicationId, 1);
    assert.equal(ranked[0].applicationId, 9);
    assert.equal(ranked[1].applicationId, 1);
    assert.equal(ranked[1].activationFairness.receivesTrialFirstBoost, false);
    assert.ok(
      ranked[1].activationFairness.reasonTags.includes(ACTIVATION_FAIR_REASON_TAGS.PAID_MEMBERSHIP),
    );
  });

  it("unsupported training/category data does not crash scoring", () => {
    const scored = activationFair.computeActivationFairDistributionScore(
      { applicationId: 15, submittedAt: "2026-08-01T00:00:00.000Z" },
      trialContext({
        trainingScore: { bad: true },
        categoryMatch: "maybe",
      }),
      { now: NOW },
    );
    assert.equal(scored.metrics.trainingScore, ACTIVATION_FAIR_NOT_AVAILABLE);
    assert.equal(scored.metrics.categoryMatch, ACTIVATION_FAIR_NOT_AVAILABLE);
    assert.ok(scored.reasonTags.includes(ACTIVATION_FAIR_REASON_TAGS.TRAINING_NOT_AVAILABLE));
    assert.ok(scored.reasonTags.includes(ACTIVATION_FAIR_REASON_TAGS.CATEGORY_MATCH_NOT_AVAILABLE));
  });

  it("deterministic tie-breaker is stable", () => {
    const ctx = trialContext({
      acceptedActivationWorkCount: 0,
      activeAssignedWorkCount: 0,
      trialStartedAt: "2026-08-05T00:00:00.000Z",
    });
    const built = [
      builtCandidate(22, { freelancerUserId: 220, submittedAt: "2026-08-18T10:00:00.000Z" }),
      builtCandidate(11, { freelancerUserId: 110, submittedAt: "2026-08-18T10:00:00.000Z" }),
    ];
    const first = rankWithActivation(built, { 220: ctx, 110: ctx });
    const second = rankWithActivation(built, { 220: ctx, 110: ctx });
    assert.deepEqual(
      first.map((c) => c.applicationId),
      [11, 22],
    );
    assert.deepEqual(
      second.map((c) => c.applicationId),
      first.map((c) => c.applicationId),
    );
  });
});
