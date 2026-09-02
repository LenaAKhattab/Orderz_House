/**
 * Courses-Gating-01 — freelancer courses plan gating (static + helpers).
 * Run: node --test src/coursePlanGating.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPlanUpgradeCopy,
  formatCourseRequiredTierHelper,
  isPlanUpgradeReason,
  PLAN_UPGRADE_DEFAULT_ROUTE,
} from "./constants/planUpgradeCta.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("course plan gating — copy helpers", () => {
  it("recognizes COURSE_PLAN_UPGRADE_REQUIRED as plan upgrade reason", () => {
    assert.equal(isPlanUpgradeReason("COURSE_PLAN_UPGRADE_REQUIRED"), true);
  });

  it("builds Arabic course lock copy", () => {
    const copy = buildPlanUpgradeCopy({
      reason: "COURSE_PLAN_UPGRADE_REQUIRED",
      requiredTierCode: "silver",
      isEn: false,
    });
    assert.match(copy.headline, /هذه الدورة متاحة لباقات أعلى/);
    assert.equal(copy.button, "ترقية الباقة");
  });

  it("formats tier helper lines for locked courses", () => {
    assert.match(formatCourseRequiredTierHelper("silver"), /ترقية الباقة/);
    assert.match(formatCourseRequiredTierHelper("pro"), /ترقية الباقة/);
    assert.match(formatCourseRequiredTierHelper("elite"), /ترقية الباقة/);
  });

  it("plans route is the default upgrade path", () => {
    assert.equal(PLAN_UPGRADE_DEFAULT_ROUTE, "/dashboard/freelancer/plans");
  });
});

describe("course plan gating — UI wiring", () => {
  it("FreelancerCoursesPage renders locked card without Link wrapper", () => {
    const page = read("pages/dashboard/FreelancerCoursesPage.jsx");
    assert.match(page, /isLockedByPlan/);
    assert.match(page, /PlanUpgradeRequiredCta/);
    assert.match(page, /<article className=\{cardClassName\}/);
    assert.doesNotMatch(page, /isLockedByPlan[\s\S]*<Link to=\{courseTo\}/);
  });

  it("locked course uses plans upgrade CTA", () => {
    const page = read("pages/dashboard/FreelancerCoursesPage.jsx");
    assert.match(page, /COURSE_PLAN_UPGRADE_REQUIRED/);
    assert.match(page, /\/dashboard\/freelancer\/plans/);
  });

  it("FreelancerCourseDetailsPage handles 403 plan lock", () => {
    const details = read("pages/dashboard/FreelancerCourseDetailsPage.jsx");
    assert.match(details, /COURSE_PLAN_UPGRADE_REQUIRED/);
    assert.match(details, /planLock/);
    assert.match(details, /PlanUpgradeRequiredCta/);
  });

  it("unlocked course card uses startCourse CTA label helper", () => {
    const page = read("pages/dashboard/FreelancerCoursesPage.jsx");
    assert.match(page, /startCourse/);
    assert.match(page, /ctaLabel\(status, t\)/);
  });

  it("locked courses do not render startCourse CTA in aside", () => {
    const page = read("pages/dashboard/FreelancerCoursesPage.jsx");
    assert.match(page, /isLockedByPlan \? \(/);
    assert.match(page, /PlanUpgradeRequiredCta/);
  });
});
