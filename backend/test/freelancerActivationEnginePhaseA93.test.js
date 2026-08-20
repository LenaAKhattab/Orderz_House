/**
 * Phase A9.3 — Auto winner assignment + weighted fair lottery.
 * Does not apply migrations. No Production / git / Stripe / auto-approve.
 *
 * Run: node --test test/freelancerActivationEnginePhaseA93.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a93_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const auto = require("../src/services/freelancerActivationAutoAssignmentService");
const {
  ACTIVATION_WEIGHTED_FAIR_ALGORITHM_VERSION,
  ACTIVATION_AUTO_ASSIGN_OVERRIDE_REASON,
} = require("../src/constants/freelancerActivationAutoAssignment");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase A9.3 isolation", () => {
  it("adds migration 175 and does not touch payment domains", () => {
    const migrations = fs.readdirSync(path.join(root, "sql/migrations"));
    assert.ok(migrations.some((f) => f.startsWith("175_freelancer_activation_auto_assignment")));
    const sql = read("sql/migrations/175_freelancer_activation_auto_assignment_a93.sql");
    assert.match(sql, /freelancer_activation_auto_assignment_runs/);
    assert.match(sql, /freelancer_activation_auto_assignment_candidates/);
    assert.match(sql, /auto_assign_enabled/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE FROM\b/i);
    const svc = read("src/services/freelancerActivationAutoAssignmentService.js");
    assert.doesNotMatch(svc, /require\(["'].*stripe/i);
    assert.doesNotMatch(svc, /require\(["'].*ordersService/);
    assert.doesNotMatch(svc, /require\(["'].*financialClaims/);
    assert.match(svc, /selectArticleApplication/);
    assert.match(svc, /autoApprove:\s*false/);
    assert.match(svc, /ACTIVATION_WEIGHTED_FAIR_ALGORITHM_VERSION|activation_weighted_fair_v1/);
    const apps = read("src/services/marketplaceArticleApplicationsService.js");
    assert.match(apps, /maybeTriggerAfterApplication/);
    const routes = read("src/routes/superAdminMarketplaceArticleApplicationsRoutes.js");
    assert.match(routes, /auto-assignment\/run/);
  });
});

describe("Phase A9.3 weighted fair lottery", () => {
  it("equal candidates: seeded lottery selects exactly one deterministically", () => {
    const cands = [
      { applicationId: 1, weight: 1000 },
      { applicationId: 2, weight: 1000 },
      { applicationId: 3, weight: 1000 },
    ];
    const a = auto.selectWeightedFairIndex(cands, "article:10:round:1:run:x");
    const b = auto.selectWeightedFairIndex(cands, "article:10:round:1:run:x");
    assert.equal(a.index, b.index);
    assert.ok(a.index >= 0 && a.index < 3);
    assert.equal(a.totalWeight, 3000);
  });

  it("previous winner has lower weight than previous loser", () => {
    const winner = auto.computeWeightedFairWeight({
      acceptedActivationWorkCount: 0,
      publishedActivationWorkCount: 0,
      previousActivationWins: 1,
      previousActivationLosses: 0,
      waitingLosses: 0,
      activeAssignedMiniArticleWorkCount: 0,
      waitingDays: 0,
      isTrialActive: true,
      isPaidActive: false,
    });
    const loser = auto.computeWeightedFairWeight({
      acceptedActivationWorkCount: 0,
      publishedActivationWorkCount: 0,
      previousActivationWins: 0,
      previousActivationLosses: 1,
      waitingLosses: 1,
      activeAssignedMiniArticleWorkCount: 0,
      waitingDays: 0,
      isTrialActive: true,
      isPaidActive: false,
    });
    assert.ok(loser.weight > winner.weight);
  });

  it("two losses weigh more than one loss", () => {
    const one = auto.computeWeightedFairWeight({
      previousActivationLosses: 1,
      waitingLosses: 1,
      isTrialActive: true,
    });
    const two = auto.computeWeightedFairWeight({
      previousActivationLosses: 2,
      waitingLosses: 2,
      isTrialActive: true,
    });
    assert.ok(two.weight > one.weight);
  });

  it("accepted/published prior work and active assigned reduce weight", () => {
    const fresh = auto.computeWeightedFairWeight({
      acceptedActivationWorkCount: 0,
      publishedActivationWorkCount: 0,
      activeAssignedMiniArticleWorkCount: 0,
      isTrialActive: true,
      isPaidActive: false,
    });
    const busy = auto.computeWeightedFairWeight({
      acceptedActivationWorkCount: 1,
      publishedActivationWorkCount: 1,
      activeAssignedMiniArticleWorkCount: 1,
      previousActivationWins: 1,
      isTrialActive: true,
      isPaidActive: false,
    });
    assert.ok(fresh.weight > busy.weight);
  });

  it("override reason is long enough for fair selection override", () => {
    assert.ok(ACTIVATION_AUTO_ASSIGN_OVERRIDE_REASON.length >= 10);
  });
});

describe("Phase A9.3 enablement helpers", () => {
  it("auto-assign disabled by default on article flags", () => {
    assert.equal(
      auto.isAutoAssignEnabledOnArticle({
        activation_campaign_id: 1,
        activation_auto_assign_enabled: false,
        activation_auto_assign_mode: "disabled",
        activation_auto_assign_when_min_bidders_reached: false,
      }),
      false,
    );
    assert.equal(
      auto.isAutoAssignEnabledOnArticle({
        activation_campaign_id: 1,
        activation_auto_assign_enabled: true,
        activation_auto_assign_mode: "weighted_fair",
        activation_auto_assign_when_min_bidders_reached: true,
      }),
      true,
    );
    assert.equal(
      auto.isAutoAssignEnabledOnArticle({
        activation_campaign_id: null,
        activation_auto_assign_enabled: true,
        activation_auto_assign_mode: "weighted_fair",
        activation_auto_assign_when_min_bidders_reached: true,
      }),
      false,
    );
  });
});

describe("Phase A9.3 selection path wiring", () => {
  it("reuses selectArticleApplication and does not auto-approve/publish", () => {
    const svc = read("src/services/freelancerActivationAutoAssignmentService.js");
    assert.match(svc, /selectArticleApplication/);
    assert.doesNotMatch(svc, /finalizeApproval|createClaim|financialClaims/);
    assert.match(svc, /autoApprove:\s*false/);
    assert.match(svc, /autoPublish:\s*false/);
    assert.match(svc, /ACTIVATION_AUTO_ASSIGN_OVERRIDE_REASON/);
    const constants = read("src/constants/freelancerActivationAutoAssignment.js");
    assert.match(constants, /activation_weighted_fair_v1/);
    assert.match(constants, /ACTIVATION_WEIGHTED_FAIR_AUTO_ASSIGN/);
  });
});
