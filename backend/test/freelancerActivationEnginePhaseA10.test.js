/**
 * Phase A10 — Plan upgrade locks + Bid outcome policy.
 * Does not apply migrations. No Production / git / Stripe.
 *
 * Run: node --test test/freelancerActivationEnginePhaseA10.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a10_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const policy = require("../src/constants/marketplaceBidApplicationOutcomePolicy");
const planElig = require("../src/services/planOrderValueEligibility");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase A10 Bid outcome policy", () => {
  it("real opportunities consume on loss; simulation refunds on expiry", () => {
    const real = { is_fake_or_training: false };
    const sim = { is_fake_or_training: true };
    assert.equal(policy.shouldConsumeBidOnLoss(real), true);
    assert.equal(policy.shouldRefundBidOnLoss(real), false);
    assert.equal(policy.shouldConsumeBidOnLoss(sim), false);
    assert.equal(policy.shouldRefundBidOnExpiredSimulation(sim), true);

    const lostReal = policy.decideBidReservationOutcome(real, "lost_selection");
    assert.equal(lostReal.action, "consume");
    assert.equal(lostReal.reason, "lost_selection_consumed");

    const lostSim = policy.decideBidReservationOutcome(sim, "lost_selection");
    assert.equal(lostSim.action, "release");
    assert.equal(lostSim.reason, "simulation_closed_refund");
    assert.match(lostSim.publicMessageAr, /إغلاق الطلب/);
    assert.doesNotMatch(lostSim.publicMessageAr, /وهمي|Fake|Simulation/i);

    const expired = policy.decideBidReservationOutcome(sim, "simulation_expired");
    assert.equal(expired.action, "release");
    assert.equal(expired.reason, "simulation_closed_refund");

    const noSel = policy.decideBidReservationOutcome(real, "article_cancelled");
    assert.equal(noSel.action, "release");
  });

  it("unknown opportunity type defaults to real consume-on-loss", () => {
    const unknown = policy.decideBidReservationOutcome({}, "lost_selection");
    assert.equal(unknown.action, "consume");
    assert.equal(policy.resolveOpportunityKind({ orderSource: "fake" }), "simulation");
  });
});

describe("Phase A10 wiring", () => {
  it("select path settles losers via policy consume for real articles", () => {
    const apps = read("src/services/marketplaceArticleApplicationsService.js");
    assert.match(apps, /settleApplicationReservationByPolicy/);
    assert.match(apps, /lost_selection/);
    assert.match(apps, /consumeApplicationReservation/);
    assert.match(apps, /marketplaceBidApplicationOutcomePolicy/);
    // Loser path no longer blindly releases as not_selected
    assert.doesNotMatch(apps, /releaseApplicationReservation\(client, loser, "not_selected"/);
  });

  it("does not rewrite Bid Credit FEFO internals", () => {
    const fefo = read("src/services/marketplaceBidCreditAccountingService.js");
    const reserve = read("src/services/marketplaceBidCreditReservationService.js");
    assert.match(reserve, /consumeBidCreditReservation/);
    assert.match(reserve, /reason = "article_final_approval_bid_consume"/);
    // FEFO selector untouched in accounting file shape
    assert.match(fefo, /consumeBidCreditsFefo|allocateFefo|FEFO/i);
  });

  it("simulation refund service avoids freelancer fake wording", () => {
    const svc = read("src/services/marketplaceSimulationBidRefundService.js");
    assert.match(svc, /onTrainingPoolOpportunityExpired/);
    assert.match(svc, /simulation_closed_refund|FREELANCER_SIMULATION_REFUND_MESSAGE_AR/);
    assert.doesNotMatch(svc, /طلب وهمي/);
    const fakeOrders = read("src/services/fakeOrdersService.js");
    assert.match(fakeOrders, /marketplaceSimulationBidRefundService/);
  });

  it("pool eligibility exposes requiredTierCode for upgrade CTA", () => {
    const locked = planElig.computePoolOrderPlanEligibility(
      { project_type: "fixed", budget: 15, orderSource: "real" },
      { minOrderValue: 3, maxOrderValue: 7 },
    );
    assert.equal(locked.isLockedByPlan, true);
    assert.equal(locked.requiredTierCode, "silver");
    assert.ok(locked.suggestedUpgradePlanTitle);
  });

  it("isolates Stripe / ordersService core / Pantry / Bildazo / wallet", () => {
    const policySrc = read("src/constants/marketplaceBidApplicationOutcomePolicy.js");
    const apps = read("src/services/marketplaceArticleApplicationsService.js");
    assert.doesNotMatch(policySrc, /stripeWebhook|ordersService|pantry|bildazoArticlePublish/i);
    assert.doesNotMatch(apps, /require\(["'].*stripeWebhook/);
    assert.doesNotMatch(apps, /require\(["'].*ordersService/);
  });
});
