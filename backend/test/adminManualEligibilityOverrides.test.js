/**
 * Super Admin manual identity + course completion overrides.
 * Pure gate math plus source contracts (no fake files, no fake lesson progress).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  isIdentityGateApproved,
  evaluateCourseExam,
  evaluateTrainingRequirements,
  composeOrderReadiness,
} = require("../src/utils/adminEligibilityGates");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const serviceSrc = read("src/services/superAdminUsersControlService.js");
const routesSrc = read("src/routes/superAdminUsersControlRoutes.js");
const validatorsSrc = read("src/validators/superAdminUsersControlValidators.js");
const kycSrc = read("src/services/freelancerAccountActivationKycService.js");
const migrationSrc = read("sql/migrations/198_admin_manual_eligibility_overrides.sql");

function sliceBetween(src, start, end) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, `missing ${start}`);
  const j = src.indexOf(end, i + start.length);
  assert.ok(j > i, `missing ${end}`);
  return src.slice(i, j);
}

describe("identity gate", () => {
  it("manual approval passes identity without a platform upload", () => {
    assert.equal(isIdentityGateApproved({ platformStatus: "none", manualStatus: "approved" }), true);
    assert.equal(isIdentityGateApproved({ platformStatus: "approved", manualStatus: null }), true);
  });

  it("does not accept pending, rejected, or revoked identity", () => {
    assert.equal(isIdentityGateApproved({ platformStatus: "pending_review", manualStatus: null }), false);
    assert.equal(isIdentityGateApproved({ platformStatus: "rejected", manualStatus: "revoked" }), false);
    assert.equal(isIdentityGateApproved({ platformStatus: "none", manualStatus: "revoked" }), false);
  });
});

describe("course gate", () => {
  it("keeps real progress and treats admin completion as the requirement only", () => {
    const course = {
      id: "7",
      courseCompletedAt: "2026-09-27T00:00:00.000Z",
      completionSource: "admin_override",
      isTestingEnabled: true,
      examFinalGrade: null,
      progress: { percentage: 0, completedLessons: 0, totalLessons: 4 },
    };
    const training = evaluateTrainingRequirements([course], [7]);
    assert.equal(training.courses[0].completed, true);
    assert.equal(training.courses[0].progressPercentage, 0);
    assert.equal(training.allComplete, true);
  });

  it("evaluates required courses independently", () => {
    const courses = [
      { id: "1", courseCompletedAt: "2026-01-01", completionSource: "learner", progress: { percentage: 100 } },
      { id: "2", courseCompletedAt: "2026-01-02", completionSource: "admin_override", progress: { percentage: 0 } },
      { id: "3", courseCompletedAt: null, completionSource: null, progress: { percentage: 40 } },
    ];
    const training = evaluateTrainingRequirements(courses, [1, 2, 3]);
    assert.equal(training.completedCount, 2);
    assert.equal(training.allComplete, false);
    assert.equal(training.courses.find((c) => c.courseId === "2").completionSource, "admin_override");
  });

  it("does not mark the final exam passed from admin course completion", () => {
    const exam = evaluateCourseExam({
      isTestingEnabled: true,
      courseCompletedAt: "2026-09-27",
      completionSource: "admin_override",
      examFinalGrade: null,
    });
    assert.equal(exam.passed, false);
    assert.equal(exam.source, "admin_override_without_exam");
  });

  it("still treats a normal learner completion as satisfying the embedded test", () => {
    const exam = evaluateCourseExam({
      isTestingEnabled: true,
      courseCompletedAt: "2026-09-27",
      completionSource: null,
      examFinalGrade: null,
    });
    assert.equal(exam.passed, true);
    assert.equal(exam.source, "learner_completion");
  });
});

describe("order readiness", () => {
  it("stays ineligible when the package gate fails", () => {
    const training = evaluateTrainingRequirements(
      [{ id: "4", courseCompletedAt: "2026-09-27", completionSource: "admin_override", progress: { percentage: 0 } }],
      [4],
    );
    const readiness = composeOrderReadiness({
      accountActive: true,
      identityApproved: true,
      packageEligible: false,
      packageReason: "no_subscription",
      training,
    });
    assert.equal(readiness.eligible, false);
    assert.equal(readiness.badge, "غير مؤهل لاستقبال الطلبات");
    assert.equal(readiness.gates.find((g) => g.code === "package").passed, false);
    assert.equal(readiness.gates.find((g) => g.code === "identity").passed, true);
    assert.equal(readiness.gates.find((g) => g.code === "training").passed, true);
  });

  it("is eligible when account, identity, package, and required training pass", () => {
    const training = evaluateTrainingRequirements(
      [
        {
          id: "4",
          courseCompletedAt: "2026-09-27",
          completionSource: "learner",
          isTestingEnabled: false,
          progress: { percentage: 100 },
        },
      ],
      [4],
    );
    const readiness = composeOrderReadiness({
      accountActive: true,
      identityApproved: true,
      packageEligible: true,
      training,
    });
    assert.equal(readiness.eligible, true);
    assert.equal(readiness.badge, "مؤهل لاستقبال الطلبات");
    assert.equal(readiness.gates.find((g) => g.code === "final_exam").blocksEligibility, false);
  });

  it("does not let one admin completion satisfy every required course", () => {
    const training = evaluateTrainingRequirements(
      [
        { id: "1", courseCompletedAt: "2026-09-27", completionSource: "admin_override", progress: { percentage: 0 } },
        { id: "2", courseCompletedAt: null, progress: { percentage: 0 } },
      ],
      [1, 2],
    );
    const readiness = composeOrderReadiness({
      accountActive: true,
      identityApproved: true,
      packageEligible: true,
      training,
    });
    assert.equal(readiness.eligible, false);
    assert.equal(readiness.gates.find((g) => g.code === "training").state, "failed");
  });
});

describe("manual override source contracts", () => {
  it("stores manual identity without creating KYC files", () => {
    const block = sliceBetween(serviceSrc, "async function applyManualIdentityAction", "async function cancelCurrentPlan");
    assert.match(block, /freelancer_identity_manual_verifications/);
    assert.match(block, /manual_identity_approved/);
    assert.doesNotMatch(block, /id_front_file_key|id_back_file_key|placeholder/);
    assert.doesNotMatch(block, /INSERT INTO freelancer_account_activation_requests/);
    assert.match(block, /alreadyApproved/);
    assert.match(block, /status = 'revoked'/);
  });

  it("records method and does not auto-activate the subscription", () => {
    const block = sliceBetween(serviceSrc, "async function applyManualIdentityAction", "async function cancelCurrentPlan");
    assert.match(block, /verification_method/);
    assert.doesNotMatch(block, /activation_status/);
    assert.match(serviceSrc, /manual_identity_approved/);
    assert.match(serviceSrc, /manual_identity_revoked/);
  });

  it("admin course completion does not fabricate lessons or exam scores", () => {
    const block = sliceBetween(serviceSrc, "async function applyAdminCourseCompletion", "function escapeCsv");
    assert.match(block, /completion_source = 'admin_override'/);
    assert.match(block, /completed_by_admin_id/);
    assert.doesNotMatch(block, /course_lesson_progress/);
    assert.doesNotMatch(block, /exam_final_grade/);
    assert.match(block, /AND completed_at IS NULL/);
    assert.match(block, /completion_source = 'admin_override'/);
    assert.match(serviceSrc, /admin_course_completed/);
    assert.match(serviceSrc, /admin_course_completion_revoked/);
  });

  it("keeps the normal uploaded-identity approval and the old course tools", () => {
    assert.match(serviceSrc, /approveActivationRequest/);
    assert.match(serviceSrc, /INSERT INTO course_lesson_progress/);
    assert.match(validatorsSrc, /manual_identity_approved/);
    assert.match(validatorsSrc, /admin_course_completed/);
  });

  it("keeps these actions behind super admin routes", () => {
    assert.match(routesSrc, /requireSuperAdmin/);
    assert.match(routesSrc, /\/users\/:userId\/identity/);
    assert.match(routesSrc, /\/users\/:userId\/training/);
    assert.doesNotMatch(routesSrc, /requireAnyRole\(\["admin"/);
  });

  it("accepts manual identity in the company-approval identity gate", () => {
    assert.match(kycSrc, /isManualIdentityApproved/);
    assert.match(kycSrc, /manual_admin/);
  });

  it("migration 198 is additive and does not backfill", () => {
    assert.match(migrationSrc, /CREATE TABLE IF NOT EXISTS freelancer_identity_manual_verifications/);
    assert.match(migrationSrc, /ADD COLUMN IF NOT EXISTS completion_source/);
    assert.match(migrationSrc, /198_admin_manual_eligibility_overrides/);
    assert.doesNotMatch(migrationSrc, /DROP TABLE|DELETE FROM users|UPDATE users SET/);
    assert.match(serviceSrc, /orderReadiness/);
    assert.match(serviceSrc, /composeOrderReadiness/);
  });
});
