import { SA_ROUTES } from "./superAdminHomeDataUtils";
import { formatInt } from "./superAdminHomeBundleUi";
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
      label: "عاجل",
      text: `${formatInt(staleOrders)} طلب منصة متأخر أكثر من 72 ساعة`,
      description: "طلبات منصة مفتوحة منذ أكثر من 72 ساعة دون إغلاق أو تقدم — لا توجد صفحة إدارة مخصصة حالياً",
    });
  }

  const pendingActivation = Number(subscriptions?.totals?.pendingActivation) || 0;
  if (pendingActivation > 0) {
    risks.push({
      id: "pending-activation",
      severity: SEVERITY.urgent,
      icon: "🔴",
      label: "عاجل",
      text: `${formatInt(pendingActivation)} اشتراك بانتظار التفعيل`,
      description: "اشتراكات مدفوعة أو مكتملة تنتظر موافقة الإدارة للتفعيل",
      to: SA_ROUTES.subscriptionsActivation,
    });
  }

  const staleClaims = Number(financial?.totals?.claimsWaitingTooLong) || 0;
  if (staleClaims > 0) {
    risks.push({
      id: "stale-claims",
      severity: SEVERITY.urgent,
      icon: "🔴",
      label: "عاجل",
      text: `${formatInt(staleClaims)} مطالبة مالية معلّقة أكثر من 7 أيام`,
      description: "مطالبات بحالة «معلّقة» منذ أكثر من أسبوع",
      to: SA_ROUTES.financialClaims,
    });
  }

  const inactiveSub = Number(freelancers?.totals?.inactiveAfterSubscription) || 0;
  if (inactiveSub > 0) {
    risks.push({
      id: "inactive-freelancers",
      severity: SEVERITY.medium,
      icon: "🟡",
      label: "متوسط",
      text: `${formatInt(inactiveSub)} مستقل لديهم اشتراك نشط دون نشاط`,
      description: "لديهم اشتراك نشط لكن لم ينفّذوا أي طلب خلال 30 يوماً من بداية الاشتراك",
      to: SA_ROUTES.subscriptions,
    });
  }

  const shortage = categories?.potentialShortage?.[0];
  if (shortage?.name && Number(shortage.demandOrders) > Number(shortage.freelancerSupply)) {
    risks.push({
      id: "cat-shortage",
      severity: SEVERITY.medium,
      icon: "🟡",
      label: "متوسط",
      text: `فئة «${shortage.name}» تعاني نقصاً في المستقلين`,
      description: "عدد طلبات المنصة في الفئة أعلى من عدد المستقلين المسجّلين فيها",
    });
  }

  const lowCourses = attention?.lowPerformingCourses || [];
  if (lowCourses.length > 0) {
    const title = lowCourses[0]?.title;
    risks.push({
      id: "low-courses",
      severity: SEVERITY.info,
      icon: "🔵",
      label: "معلومة",
      text: title
        ? `دورة «${title}» بمعدل إكمال منخفض`
        : `${formatInt(lowCourses.length)} دورة بمعدل إكمال منخفض`,
      description: "دورات بمعدل إكمال أقل من 35٪ بين 5 مسجّلين فأكثر",
      to: SA_ROUTES.courses,
    });
  } else {
    const stuck = Number(courses?.totals?.stuckAbove80Percent) || 0;
    if (stuck > 0) {
      risks.push({
        id: "courses-stuck",
        severity: SEVERITY.info,
        icon: "🔵",
        label: "معلومة",
        text: `${formatInt(stuck)} متعلّم عالق فوق 80٪ دون إتمام`,
        description: "تقدّم فوق 80٪ من الدورة دون إتمامها أو اجتياز الاختبار",
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
      label: "متوسط",
      text: `${formatInt(pendingClaims)} مطالبة بانتظار المراجعة`,
      description: "مطالبات مالية بحالة «معلّقة» بانتظار قرار الإدارة",
      to: SA_ROUTES.financialClaims,
    });
  }

  return risks.sort((a, b) => b.severity - a.severity).slice(0, 8);
}
