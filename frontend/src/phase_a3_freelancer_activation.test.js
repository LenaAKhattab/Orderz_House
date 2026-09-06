import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sharesSumToTotal } from "./constants/freelancerActivationCampaign.js";
import { ROLE, canRoleAccessPath } from "./constants/authRoutes.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A3 Super Admin activation campaigns UI", () => {
  it("activation page renders campaigns, budget, waves, and emergency stop", () => {
    const src = read("pages/dashboard/SuperAdminFreelancerActivationPage.jsx");
    assert.match(src, /activation-campaign-list/);
    assert.match(src, /create-campaign-form/);
    assert.match(src, /campaign-budget-summary/);
    assert.match(src, /activation-wave-list/);
    assert.match(src, /emergency-stop-button/);
    assert.match(src, /window\.confirm/);
    assert.match(src, /activation-settings-snapshot/);
    const app = read("App.jsx");
    assert.match(app, /path="\/dashboard\/super-admin\/freelancer-activation"/);
    assert.match(app, /SuperAdminFreelancerActivationPage/);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/freelancer-activation", ROLE.SUPER_ADMIN), true);
    assert.equal(canRoleAccessPath("/dashboard/super-admin/freelancer-activation", ROLE.FREELANCER), false);
  });

  it("create campaign form validates share sum", () => {
    assert.equal(sharesSumToTotal("1.000", "0.500", "0.300", "0.200"), true);
    assert.equal(sharesSumToTotal("1.000", "0.500", "0.300", "0.100"), false);
  });

  it("does not add campaign UI to freelancer trial status block", () => {
    const src = read("components/freelancer/FreelancerActivationTrialStatusBlock.jsx");
    assert.doesNotMatch(src, /activation-campaign-list/);
    assert.doesNotMatch(src, /emergency-stop-button/);
  });
});
