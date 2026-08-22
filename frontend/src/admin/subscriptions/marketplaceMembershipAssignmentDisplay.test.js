import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_LEGACY_PLAN_WARNING_AR,
  ADMIN_MARKETPLACE_ASSIGNMENT_SCOPE_NOTE_AR,
  formatAdminMarketplaceMembershipAssignmentLabel,
  formatLegacyPlanAssignmentLabel,
  pickCanonicalMarketplaceMembershipsForAssignment,
} from "./marketplaceMembershipAssignmentDisplay.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function readPage() {
  return fs.readFileSync(
    path.join(srcRoot, "../../pages/dashboard/SuperAdminSubscriptionsPage.jsx"),
    "utf8",
  );
}

describe("Super Admin marketplace membership assignment display", () => {
  it("formats canonical marketplace labels with public durations", () => {
    const starter = formatAdminMarketplaceMembershipAssignmentLabel({
      id: "1",
      tierCode: "starter",
      monthlyPriceJod: 0,
      cycleDurationDays: 10,
      monthlyBidAllowance: 20,
    });
    const silver = formatAdminMarketplaceMembershipAssignmentLabel({
      id: "2",
      tierCode: "silver",
      monthlyPriceJod: 19,
      cycleDurationDays: 30,
      monthlyBidAllowance: 40,
    });
    assert.match(starter, /STARTER/);
    assert.match(starter, /10 يوم/);
    assert.match(starter, /مجاناً/);
    assert.match(silver, /SILVER/);
    assert.match(silver, /19 د\.أ/);
    assert.match(silver, /30 يوم/);
  });

  it("keeps only STARTER/SILVER/PRO/ELITE in canonical assignment order", () => {
    const picked = pickCanonicalMarketplaceMembershipsForAssignment([
      { id: "9", tierCode: "free", monthlyPriceJod: 0, cycleDurationDays: 365 },
      { id: "4", tierCode: "elite", monthlyPriceJod: 59, cycleDurationDays: 30 },
      { id: "1", tierCode: "starter", monthlyPriceJod: 0, cycleDurationDays: 10 },
      { id: "2", tierCode: "silver", monthlyPriceJod: 19, cycleDurationDays: 30 },
      { id: "3", tierCode: "pro", monthlyPriceJod: 39, cycleDurationDays: 30 },
    ]);
    assert.deepEqual(
      picked.map((p) => p.tierCode),
      ["starter", "silver", "pro", "elite"],
    );
  });

  it("marks legacy plans with archived warning", () => {
    const label = formatLegacyPlanAssignmentLabel({
      id: 7,
      title: "الاشتراك المجاني",
      durationDays: 365,
    });
    assert.match(label, /365 يوم/);
    assert.match(label, new RegExp(ADMIN_LEGACY_PLAN_WARNING_AR));
    assert.doesNotMatch(label, /^STARTER/);
  });
});

describe("Super Admin subscriptions assignment modal UI", () => {
  it("uses marketplace-only scope note and grouped legacy section", () => {
    const page = readPage();
    assert.match(page, /إسناد عضوية سوق العمل لمستقل/);
    assert.match(page, /ADMIN_MARKETPLACE_ASSIGNMENT_SCOPE_NOTE_AR/);
    assert.match(page, /assign-marketplace-helper/);
    assert.match(page, /assign-marketplace-membership-select/);
    assert.match(page, /assign-legacy-plans-section/);
    assert.match(page, /assignMarketplaceMembershipToFreelancerRequest/);
    assert.doesNotMatch(page, /TrainingPlansSection/);
  });
});
