/**
 * Super Admin marketplace membership assignment catalog + assign.
 * Run: node --test test/subscriptionMarketplaceAssignment.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/subscription_marketplace_assignment_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const service = require("../src/services/subscriptionMarketplaceAssignmentService");
const { MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES } = require("../src/constants/marketplaceMembershipPlans");

const root = path.join(__dirname, "..");

describe("subscriptionMarketplaceAssignment service wiring", () => {
  it("exports list + assign helpers", () => {
    assert.equal(typeof service.listAssignmentCatalogForAdmin, "function");
    assert.equal(typeof service.assignMarketplaceMembershipToFreelancerByAdmin, "function");
  });

  it("admin routes expose assign-marketplace-membership endpoint", () => {
    const routes = fs.readFileSync(
      path.join(root, "src/routes/adminSubscriptionsRoutes.js"),
      "utf8",
    );
    assert.match(routes, /assign-marketplace-membership/);
    assert.match(routes, /assignMarketplaceMembership/);
    assert.match(routes, /assignMarketplaceMembershipValidators/);
  });

  it("listAssignablePlans uses assignment catalog service", () => {
    const controller = fs.readFileSync(
      path.join(root, "src/controllers/subscriptionsController.js"),
      "utf8",
    );
    assert.match(controller, /subscriptionMarketplaceAssignmentService/);
    assert.match(controller, /listAssignmentCatalogForAdmin/);
    assert.match(controller, /assignMarketplaceMembershipToFreelancerByAdmin/);
  });

  it("canonical tier allow-list matches public marketplace tiers", () => {
    assert.deepEqual(MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES, ["starter", "silver", "pro", "elite"]);
  });
});

describe("subscriptionMarketplaceAssignment — KYC / legacy safety (static)", () => {
  it("marketplace assign does not write company_approved or freelancer_subscriptions", () => {
    const assignSrc = fs.readFileSync(
      path.join(root, "src/services/subscriptionMarketplaceAssignmentService.js"),
      "utf8",
    );
    assert.doesNotMatch(assignSrc, /company_approved/);
    assert.doesNotMatch(assignSrc, /freelancer_subscriptions/);
    assert.doesNotMatch(assignSrc, /activation_status/);
    assert.match(assignSrc, /createAndActivateMarketplaceMembership/);
    assert.match(assignSrc, /source:\s*"admin"/);
    assert.doesNotMatch(assignSrc, /skipVerification:\s*true/);
  });

  it("createAndActivateMarketplaceMembership keeps verification unless explicitly skipped", () => {
    const membershipsSrc = fs.readFileSync(
      path.join(root, "src/services/marketplaceMembershipsService.js"),
      "utf8",
    );
    assert.match(membershipsSrc, /assertMarketplaceVerificationComplete/);
    assert.match(membershipsSrc, /if \(input\.skipVerification !== true\)/);
  });

  it("legacy assign endpoint still targets plans table only", () => {
    const plansSrc = fs.readFileSync(path.join(root, "src/services/plansService.js"), "utf8");
    const assignBlock = fs.readFileSync(path.join(root, "src/services/subscriptionsService.js"), "utf8");
    const fnStart = assignBlock.indexOf("async function assignPlanToFreelancer");
    assert.ok(fnStart >= 0);
    const fnBlock = assignBlock.slice(fnStart, fnStart + 3500);
    assert.match(fnBlock, /resolveAssignableSubscriptionPlanId/);
    assert.match(fnBlock, /INSERT INTO freelancer_subscriptions/);
    assert.match(fnBlock, /SUBSCRIPTION_ACTIVATION_STATUSES\.COMPANY_PENDING/);
    assert.doesNotMatch(fnBlock, /createAndActivateMarketplaceMembership/);
    assert.doesNotMatch(fnBlock, /marketplace_membership_plans/);
    assert.match(plansSrc, /FROM plans/);
  });

  it("financial claims remain gated on company_approved (F1)", () => {
    const claimsSrc = fs.readFileSync(
      path.join(root, "src/services/financialClaimsService.js"),
      "utf8",
    );
    assert.match(claimsSrc, /assertFreelancerCompanyApprovedForClaims/);
    assert.match(claimsSrc, /activationStatus === "company_approved"/);
    const assignSrc = fs.readFileSync(
      path.join(root, "src/services/subscriptionMarketplaceAssignmentService.js"),
      "utf8",
    );
    assert.doesNotMatch(assignSrc, /financialClaimsService/);
  });

  it("paid-tier activation may release starter pending earnings (E2) without KYC approve", () => {
    const membershipsSrc = fs.readFileSync(
      path.join(root, "src/services/marketplaceMembershipsService.js"),
      "utf8",
    );
    assert.match(membershipsSrc, /releaseStarterPendingArticleEarnings/);
    assert.match(membershipsSrc, /activatedTier !== "starter"/);
    const engineSrc = fs.readFileSync(
      path.join(root, "src/services/freelancerActivationEngineService.js"),
      "utf8",
    );
    assert.match(engineSrc, /loadActivationApproved/);
    assert.match(engineSrc, /activationApproved/);
  });

  it("membership audit logs capture actor, freelancer, tier source", () => {
    const membershipsSrc = fs.readFileSync(
      path.join(root, "src/services/marketplaceMembershipsService.js"),
      "utf8",
    );
    assert.match(membershipsSrc, /marketplace_membership_audit_logs/);
    assert.match(membershipsSrc, /actor_user_id/);
    assert.match(membershipsSrc, /MEMBERSHIP_CREATED/);
    assert.match(membershipsSrc, /MEMBERSHIP_ACTIVATED/);
    const assignSrc = fs.readFileSync(
      path.join(root, "src/services/subscriptionMarketplaceAssignmentService.js"),
      "utf8",
    );
    assert.match(assignSrc, /actorUserId/);
    assert.match(assignSrc, /ADMIN_MARKETPLACE_ASSIGNMENT_NOTE/);
  });

  it("released earnings stay non-withdrawable until company_approved", () => {
    const earnedSrc = fs.readFileSync(
      path.join(root, "src/services/freelancerActivationEarnedBalanceService.js"),
      "utf8",
    );
    assert.match(earnedSrc, /awaiting_account_approval/);
    assert.match(earnedSrc, /withdrawalPolicy/);
    assert.match(earnedSrc, /loadFreelancerCompanyApproved/);
    assert.doesNotMatch(
      fs.readFileSync(path.join(root, "src/services/subscriptionMarketplaceAssignmentService.js"), "utf8"),
      /company_approved/,
    );
  });
});

describe("listAssignmentCatalogForAdmin (mocked)", () => {
  it("returns canonical marketplace memberships separate from legacy plans", async () => {
    const plansService = require("../src/services/plansService");
    const marketplaceMembershipPlansService = require("../src/services/marketplaceMembershipPlansService");
    const originalListPlans = plansService.listPlans;
    const originalListAdmin = marketplaceMembershipPlansService.listAdminMarketplaceMembershipPlans;

    plansService.listPlans = async () => [
      { id: 1, title: "الاشتراك المجاني", durationDays: 365, isActive: true },
      { id: 2, title: "باقة البداية", durationDays: 30, isActive: true },
    ];
    marketplaceMembershipPlansService.listAdminMarketplaceMembershipPlans = async () => [
      { id: 11, tierCode: "starter", isActive: true, sortOrder: 10, monthlyPriceJod: 0, cycleDurationDays: 10 },
      { id: 12, tierCode: "silver", isActive: true, sortOrder: 20, monthlyPriceJod: 19, cycleDurationDays: 30 },
      { id: 99, tierCode: "free", isActive: true, sortOrder: 0, monthlyPriceJod: 0, cycleDurationDays: 365 },
    ];

    try {
      const out = await service.listAssignmentCatalogForAdmin();
      assert.equal(out.assignmentDefault, "marketplace_membership");
      assert.equal(out.marketplaceMemberships.length, 2);
      assert.deepEqual(
        out.marketplaceMemberships.map((p) => p.tierCode),
        ["starter", "silver"],
      );
      assert.equal(out.legacyPlans.length, 2);
      assert.equal(out.legacyPlans[0].isLegacy, true);
      assert.equal(out.plans.length, 2);
    } finally {
      plansService.listPlans = originalListPlans;
      marketplaceMembershipPlansService.listAdminMarketplaceMembershipPlans = originalListAdmin;
    }
  });
});
