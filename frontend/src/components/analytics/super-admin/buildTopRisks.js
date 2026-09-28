import { SA_ROUTES } from "./superAdminHomeDataUtils";
/** Severity: 3 urgent, 2 medium, 1 info */
const SEVERITY = { urgent: 3, medium: 2, info: 1 };

/**
 * Operational risks from intelligence (no fabricated counts).
 */
export function buildTopRisks({ intelligence, attention }) {
  const risks = [];
  const orders = intelligence?.orders?.data;
  const subscriptions = intelligence?.subscriptions?.data;
  const freelancers = intelligence?.freelancers?.data;
  const financial = intelligence?.financial?.data;
  const categories = intelligence?.categories?.data;
  const courses = intelligence?.courses?.data;

  const staleOrders = Number(orders?.totals?.ordersWaitingTooLong) || 0;
  if (staleOrders > 0) {
    risks.push({
      id: "stale-orders",
      severity: SEVERITY.urgent,
      icon: "🔴",
      labelKey: "analysis.severity.urgent",
      textKey: "analysis.risks.staleOrders.text",
      textParams: { count: staleOrders },
      descriptionKey: "analysis.risks.staleOrders.description",
    });
  }

  const pendingActivation = Number(subscriptions?.totals?.pendingActivation) || 0;
  if (pendingActivation > 0) {
    risks.push({
      id: "pending-activation",
      severity: SEVERITY.info,
      icon: "ℹ️",
      labelKey: "analysis.severity.info",
      textKey: "analysis.risks.pendingActivation.text",
      textParams: { count: pendingActivation },
      descriptionKey: "analysis.risks.pendingActivation.description",
      to: SA_ROUTES.subscriptions,
    });
  }

  const staleClaims = Number(financial?.totals?.claimsWaitingTooLong) || 0;
  if (staleClaims > 0) {
    risks.push({
      id: "stale-claims",
      severity: SEVERITY.urgent,
      icon: "🔴",
      labelKey: "analysis.severity.urgent",
      textKey: "analysis.risks.staleClaims.text",
      textParams: { count: staleClaims },
      descriptionKey: "analysis.risks.staleClaims.description",
      to: SA_ROUTES.financialClaims,
    });
  }

  const inactiveSub = Number(freelancers?.totals?.inactiveAfterSubscription) || 0;
  if (inactiveSub > 0) {
    risks.push({
      id: "inactive-freelancers",
      severity: SEVERITY.medium,
      icon: "🟡",
      labelKey: "analysis.severity.medium",
      textKey: "analysis.risks.inactiveFreelancers.text",
      textParams: { count: inactiveSub },
      descriptionKey: "analysis.risks.inactiveFreelancers.description",
      to: SA_ROUTES.subscriptions,
    });
  }

  const shortage = categories?.potentialShortage?.[0];
  if (shortage?.name && Number(shortage.demandOrders) > Number(shortage.freelancerSupply)) {
    risks.push({
      id: "cat-shortage",
      severity: SEVERITY.medium,
      icon: "🟡",
      labelKey: "analysis.severity.medium",
      textKey: "analysis.risks.catShortage.text",
      textParams: { name: shortage.name },
      descriptionKey: "analysis.risks.catShortage.description",
    });
  }

  const lowCourses = attention?.lowPerformingCourses || [];
  if (lowCourses.length > 0) {
    const title = lowCourses[0]?.title;
    risks.push({
      id: "low-courses",
      severity: SEVERITY.info,
      icon: "🔵",
      labelKey: "analysis.severity.info",
      textKey: title ? "analysis.risks.lowCourse.text" : "analysis.risks.lowCourses.text",
      textParams: title ? { title } : { count: lowCourses.length },
      descriptionKey: title ? "analysis.risks.lowCourse.description" : "analysis.risks.lowCourses.description",
      to: SA_ROUTES.courses,
    });
  } else {
    const stuck = Number(courses?.totals?.stuckAbove80Percent) || 0;
    if (stuck > 0) {
      risks.push({
        id: "courses-stuck",
        severity: SEVERITY.info,
        icon: "🔵",
        labelKey: "analysis.severity.info",
        textKey: "analysis.risks.coursesStuck.text",
        textParams: { count: stuck },
        descriptionKey: "analysis.risks.coursesStuck.description",
        to: SA_ROUTES.courses,
      });
    }
  }

  const pendingClaims = Number(financial?.totals?.pendingClaims) || 0;
  if (pendingClaims > 0 && !risks.some((r) => r.id === "stale-claims")) {
    risks.push({
      id: "pending-claims",
      severity: SEVERITY.medium,
      icon: "🟡",
      labelKey: "analysis.severity.medium",
      textKey: "analysis.risks.pendingClaims.text",
      textParams: { count: pendingClaims },
      descriptionKey: "analysis.risks.pendingClaims.description",
      to: SA_ROUTES.financialClaims,
    });
  }

  return risks.sort((a, b) => b.severity - a.severity).slice(0, 8);
}
