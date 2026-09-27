/**
 * Pure gate composition for the Super Admin user drawer.
 * Does not invent eligibility. Callers pass canonical inputs.
 */

function isIdentityGateApproved({ platformStatus = null, manualStatus = null } = {}) {
  return String(platformStatus || "") === "approved" || String(manualStatus || "") === "approved";
}

function isCourseRequirementMet(course) {
  return Boolean(course?.courseCompletedAt);
}

/**
 * Embedded course test is separate from administrative completion.
 * Learner completion (completed_at without admin_override) already includes the test
 * in the normal course engine. Admin override must not be reported as an exam pass
 * unless a real exam grade exists.
 */
function evaluateCourseExam(course) {
  if (!course?.isTestingEnabled) {
    return { required: false, passed: true, source: "not_required" };
  }
  if (course.examFinalGrade != null && Number.isFinite(Number(course.examFinalGrade))) {
    return { required: true, passed: true, source: "exam_grade" };
  }
  if (course.courseCompletedAt && course.completionSource !== "admin_override") {
    return { required: true, passed: true, source: "learner_completion" };
  }
  if (course.completionSource === "admin_override") {
    return { required: true, passed: false, source: "admin_override_without_exam" };
  }
  return { required: true, passed: false, source: "pending" };
}

function evaluateTrainingRequirements(courses = [], requiredIds = []) {
  const ids = [...new Set(requiredIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  const byId = new Map(courses.map((c) => [Number(c.id), c]));
  const results = ids.map((id) => {
    const course = byId.get(id) || null;
    const exam = evaluateCourseExam(course || { isTestingEnabled: false });
    return {
      courseId: String(id),
      title: course?.title || null,
      completed: course ? isCourseRequirementMet(course) : false,
      completionSource: course?.completionSource || null,
      progressPercentage: Number(course?.progress?.percentage ?? 0),
      exam,
    };
  });
  const configured = results.length > 0;
  return {
    configured,
    requiredCount: results.length,
    completedCount: results.filter((r) => r.completed).length,
    allComplete: configured ? results.every((r) => r.completed) : true,
    courses: results,
  };
}

function composeOrderReadiness({
  accountActive = false,
  identityApproved = false,
  packageEligible = false,
  training = null,
  packageReason = null,
} = {}) {
  const trainingComplete = training ? training.allComplete === true : false;
  const trainingConfigured = Boolean(training?.configured);
  const examCourses = (training?.courses || []).filter((c) => c.exam?.required);
  const examRequired = examCourses.length > 0;
  const examPassed = examRequired ? examCourses.every((c) => c.exam.passed === true) : true;

  const gates = [
    {
      code: "account_active",
      label: "الحساب نشط",
      passed: accountActive === true,
      blocksEligibility: true,
      notApplicable: false,
    },
    {
      code: "identity",
      label: "الهوية معتمدة",
      passed: identityApproved === true,
      blocksEligibility: true,
      notApplicable: false,
    },
    {
      code: "package",
      label: "الباقة صالحة",
      passed: packageEligible === true,
      blocksEligibility: true,
      notApplicable: false,
      reason: packageReason || null,
    },
    {
      code: "training",
      label: "التدريب مكتمل",
      passed: trainingComplete === true,
      blocksEligibility: trainingConfigured,
      notApplicable: !trainingConfigured,
    },
    {
      code: "final_exam",
      label: "الاختبار النهائي",
      passed: examPassed === true,
      blocksEligibility: false,
      notApplicable: !examRequired,
      separateFromOrderGate: true,
    },
  ];

  const blocking = gates.filter((g) => g.blocksEligibility && !g.notApplicable && !g.passed);
  const eligible = blocking.length === 0;
  const shapedGates = gates.map((g) => ({
    ...g,
    state: g.notApplicable ? "not_applicable" : g.passed ? "passed" : "failed",
  }));
  const blockers = eligible ? [] : blockersFromGates(shapedGates);
  return {
    eligible,
    badge: eligible ? "مؤهل لاستقبال الطلبات" : "غير مؤهل لاستقبال الطلبات",
    gates: shapedGates,
    blockers,
    training: training || null,
  };
}

const PACKAGE_BLOCKER_MESSAGES = Object.freeze({
  no_subscription: "لا يوجد اشتراك حالي",
  company_activation_pending: "بانتظار تفعيل الشركة",
  payment_not_completed: "دفع الباقة غير مكتمل",
  expired: "الباقة منتهية",
  status_inactive: "الاشتراك غير نشط",
  status_cancelled: "الاشتراك ملغى",
  activation_fee_unpaid: "رسوم توثيق الحساب غير مدفوعة",
  account_hold_payment_failed: "الحساب موقوف بسبب فشل الدفع",
  invalid_status: "حالة الاشتراك لا تسمح باستقبال الطلبات",
});

function blockerMessageForGate(gate) {
  if (gate.code === "account_active") return "الحساب غير نشط";
  if (gate.code === "identity") return "الهوية غير معتمدة";
  if (gate.code === "package") {
    return PACKAGE_BLOCKER_MESSAGES[gate.reason] || "الباقة غير صالحة";
  }
  if (gate.code === "training") return "التدريب المطلوب غير مكتمل";
  if (gate.code === "final_exam") return "الاختبار النهائي غير مكتمل";
  return gate.label || "عائق أهلية";
}

function blockersFromGates(gates = []) {
  return gates
    .filter((gate) => gate.blocksEligibility === true && gate.notApplicable !== true && gate.state === "failed")
    .map((gate) => ({
      code: gate.code,
      message: blockerMessageForGate(gate),
    }));
}

module.exports = {
  isIdentityGateApproved,
  isCourseRequirementMet,
  evaluateCourseExam,
  evaluateTrainingRequirements,
  composeOrderReadiness,
  blockersFromGates,
};
