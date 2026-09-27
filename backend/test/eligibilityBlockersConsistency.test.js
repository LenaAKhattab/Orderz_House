/**
 * Drawer blockers must match canonical order-readiness gates.
 * A disabled exam or unconfigured training course is not a blocker.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  composeOrderReadiness,
  evaluateTrainingRequirements,
  blockersFromGates,
} = require("../src/utils/adminEligibilityGates");

const serviceSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "superAdminUsersControlService.js"),
  "utf8",
);

function readiness(overrides = {}) {
  const training = evaluateTrainingRequirements(overrides.courses || [], overrides.requiredIds || []);
  return composeOrderReadiness({
    accountActive: overrides.accountActive !== false,
    identityApproved: overrides.identityApproved !== false,
    packageEligible: overrides.packageEligible !== false,
    packageReason: overrides.packageReason || null,
    training,
  });
}

const pendingExamCourse = {
  id: "9",
  isTestingEnabled: true,
  courseCompletedAt: null,
  examFinalGrade: null,
  progress: { percentage: 100, completedLessons: 4, totalLessons: 4 },
};

describe("eligibility blockers consistency", () => {
  it("does not block an eligible user when a disabled exam still has a pending record", () => {
    const result = readiness({ courses: [pendingExamCourse], requiredIds: [] });
    assert.equal(result.gates.find((g) => g.code === "final_exam").state, "not_applicable");
    assert.equal(result.gates.find((g) => g.code === "final_exam").blocksEligibility, false);
    assert.equal(result.eligible, true);
    assert.deepEqual(result.blockers, []);
  });

  it("does not block when training is disabled and a historical course is incomplete", () => {
    const result = readiness({
      courses: [{ id: "3", courseCompletedAt: null, progress: { percentage: 10 } }],
      requiredIds: [],
    });
    assert.equal(result.gates.find((g) => g.code === "training").state, "not_applicable");
    assert.equal(result.blockers.some((b) => b.code === "training"), false);
    assert.equal(result.eligible, true);
  });

  it("blocks only an incomplete required course", () => {
    const result = readiness({
      courses: [
        { id: "1", courseCompletedAt: "2026-01-01", progress: { percentage: 100 } },
        { id: "2", courseCompletedAt: null, progress: { percentage: 0 } },
      ],
      requiredIds: [2],
    });
    assert.equal(result.eligible, false);
    assert.equal(result.blockers.some((b) => b.code === "training"), true);
    assert.equal(result.blockers.some((b) => b.code === "final_exam"), false);
  });

  it("blocks company_pending as a package blocker", () => {
    const result = readiness({
      packageEligible: false,
      packageReason: "company_activation_pending",
    });
    const packageBlocker = result.blockers.find((b) => b.code === "package");
    assert.ok(packageBlocker);
    assert.equal(packageBlocker.message, "بانتظار تفعيل الشركة");
  });

  it("blocks missing identity", () => {
    const result = readiness({ identityApproved: false });
    assert.equal(result.blockers.some((b) => b.code === "identity"), true);
    assert.equal(result.eligible, false);
  });

  it("blocks an inactive account", () => {
    const result = readiness({ accountActive: false });
    assert.equal(result.blockers.some((b) => b.code === "account_active"), true);
  });

  it("never returns blockers when eligible is true", () => {
    const cases = [
      readiness({ courses: [pendingExamCourse], requiredIds: [] }),
      readiness({
        courses: [{ id: "4", courseCompletedAt: "2026-02-01", progress: { percentage: 100 } }],
        requiredIds: [4],
      }),
    ];
    for (const result of cases) {
      if (result.eligible) assert.equal(result.blockers.length, 0);
    }
    assert.equal(cases.every((result) => result.eligible), true);
  });

  it("adds a final-exam blocker only when that gate is actually enabled and failed", () => {
    const displayed = readiness({
      courses: [
        {
          id: "8",
          isTestingEnabled: true,
          courseCompletedAt: "2026-03-01",
          completionSource: "admin_override",
          examFinalGrade: null,
          progress: { percentage: 0 },
        },
      ],
      requiredIds: [8],
    });
    assert.equal(displayed.gates.find((g) => g.code === "final_exam").blocksEligibility, false);
    assert.equal(displayed.blockers.some((b) => b.code === "final_exam"), false);

    const synthetic = blockersFromGates([
      {
        code: "final_exam",
        blocksEligibility: true,
        notApplicable: false,
        state: "failed",
      },
    ]);
    assert.equal(synthetic.length, 1);
    assert.equal(synthetic[0].code, "final_exam");
  });

  it("ignores historical exam rows that are outside the required set", () => {
    const result = readiness({
      courses: [
        { id: "1", courseCompletedAt: "2026-01-01", isTestingEnabled: false, progress: { percentage: 100 } },
        pendingExamCourse,
      ],
      requiredIds: [1],
    });
    assert.equal(result.eligible, true);
    assert.deepEqual(result.blockers, []);
  });

  it("stops deriving drawer blockers from the global pending-exam counter", () => {
    const start = serviceSrc.indexOf("function buildBlockers");
    const end = serviceSrc.indexOf("async function getStats", start);
    const block = serviceSrc.slice(start, end);
    assert.match(block, /orderReadiness\?\.blockers/);
    assert.doesNotMatch(block, /pendingFinalTest/);
    assert.doesNotMatch(block, /اختبار نهائي معلّق/);
  });
});
