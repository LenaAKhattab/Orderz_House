import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isCurrentMarketplacePlanCard,
  isStarterPendingStartMembership,
} from "./marketplaceMembershipCurrentPlanUi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../../..");

describe("marketplaceMembershipCurrentPlanUi", () => {
  it("locks STARTER pending + active as current plan card", () => {
    const starterPlan = { tierCode: "STARTER", catalogSource: "marketplace_membership" };
    assert.equal(
      isCurrentMarketplacePlanCard(starterPlan, {
        hasMembership: true,
        membership: { status: "starter_pending_start", plan: { tierCode: "starter" } },
      }),
      true,
    );
    assert.equal(
      isCurrentMarketplacePlanCard(starterPlan, {
        hasMembership: true,
        membership: { status: "active", plan: { tierCode: "starter" } },
      }),
      true,
    );
  });

  it("locks SILVER purchased_pending_start and PRO active; leaves other paid purchasable", () => {
    const silver = { tierCode: "SILVER", catalogSource: "marketplace_membership" };
    const pro = { tierCode: "PRO", catalogSource: "marketplace_membership" };
    const elite = { tierCode: "ELITE", catalogSource: "marketplace_membership" };
    const snapSilverPending = {
      hasMembership: true,
      membership: { status: "purchased_pending_start", plan: { tierCode: "silver" } },
    };
    const snapProActive = {
      hasMembership: true,
      membership: { status: "active", plan: { tierCode: "pro" } },
    };
    assert.equal(isCurrentMarketplacePlanCard(silver, snapSilverPending), true);
    assert.equal(isCurrentMarketplacePlanCard(pro, snapSilverPending), false);
    assert.equal(isCurrentMarketplacePlanCard(elite, snapSilverPending), false);
    assert.equal(isCurrentMarketplacePlanCard(pro, snapProActive), true);
    assert.equal(isCurrentMarketplacePlanCard(silver, snapProActive), false);
  });

  it("detects starter pending membership", () => {
    assert.equal(
      isStarterPendingStartMembership({
        membership: { status: "starter_pending_start" },
      }),
      true,
    );
  });
});

describe("STARTER UI wiring", () => {
  it("PlanCard uses current-plan lock helper and no longer promotes activateStarter CTA for marketplace STARTER", () => {
    const planCard = fs.readFileSync(
      path.join(root, "src/components/plans/PlanCard.jsx"),
      "utf8",
    );
    assert.match(planCard, /isCurrentMarketplacePlanCard/);
    assert.match(planCard, /plans\.cta\.currentPlan/);
    assert.doesNotMatch(planCard, /plans\.cta\.activateStarter/);
  });

  it("membership card exposes start-trial CTA for starter pending", () => {
    const card = fs.readFileSync(
      path.join(root, "src/components/freelancer/FreelancerMarketplaceMembershipCard.jsx"),
      "utf8",
    );
    assert.match(card, /starterReadyTitle/);
    assert.match(card, /startTrialCta/);
    assert.match(card, /onStartStarterTrial/);
    assert.match(card, /marketplace-starter-start-trial/);
  });

  it("checkout hook uses start-trial API and does not activate STARTER from plan CTA", () => {
    const hook = fs.readFileSync(
      path.join(root, "src/hooks/useMarketplaceMembershipCheckout.js"),
      "utf8",
    );
    assert.match(hook, /startMarketplaceStarterTrialRequest/);
    assert.match(hook, /startStarterTrial/);
    assert.doesNotMatch(hook, /activateMarketplaceStarterMembershipRequest\(\)/);
  });

  it("Arabic locales include start trial copy", () => {
    const ar = JSON.parse(
      fs.readFileSync(path.join(root, "src/locales/ar/freelancerDashboard.json"), "utf8"),
    );
    assert.equal(ar.marketplaceMembership.starterReadyTitle, "الباقة المجانية جاهزة");
    assert.equal(ar.marketplaceMembership.startTrialCta, "ابدأ فترة التجربة");
    assert.match(ar.marketplaceMembership.starterReadyBody, /توثيق الهوية/);
  });
});
