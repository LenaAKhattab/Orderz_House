import { useEffect, useMemo, useState } from "react";
import { Crown, Sparkles } from "lucide-react";
import { getMyEligibilityRequest } from "../../services/api";
import PricingSection from "../../components/plans/PricingSection";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import { useFreelancerPlansCheckout } from "../../hooks/useFreelancerPlansCheckout";
import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi";
import { formatJoDateMedium, getPlanOrderValueRangeLabel } from "../../utils/freelancerDashboardData";
import { isOrderzhouseFreePlan } from "../../constants/orderzhousePlansCatalog";
import { getNextUpgradePlan } from "../../utils/planSubscriptionUtils";
import "../../styles/dashboardHub.css";
import "./freelancerPlans.css";

function paymentLabel(status) {
  const s = String(status || "");
  if (s === "paid") return "مدفوع";
  if (s === "pending") return "قيد المعالجة";
  if (s === "failed") return "فشل";
  if (s === "not_required") return "غير مطلوب";
  return s || "—";
}

function activationLabel(status) {
  const s = String(status || "");
  if (s === "company_approved") return "مفعّل";
  if (s === "company_pending") return "بانتظار الشركة";
  return s || "—";
}

function subscriptionStatusLabel(status) {
  if (status === "active") return "نشط";
  if (status === "assigned_not_started") return "بانتظار أول طلب";
  if (status === "expired") return "منتهي";
  if (status === "inactive") return "غير نشط";
  return status || "—";
}

export default function FreelancerPlansPage() {
  const {
    plans,
    loading,
    error,
    mySubscription,
    hasBlockingSubscription,
    checkoutBusyPlanId,
    startCheckout,
  } = useFreelancerPlansCheckout({ returnPath: "/dashboard/freelancer/plans" });

  const [eligibility, setEligibility] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getMyEligibilityRequest();
        if (mounted) setEligibility(res?.data?.eligibility || null);
      } catch {
        if (mounted) setEligibility(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [mySubscription?.id, mySubscription?.status, mySubscription?.paymentStatus]);

  const nextPlan = useMemo(() => getNextUpgradePlan(plans, mySubscription), [plans, mySubscription]);
  const rangeLabel =
    mySubscription?.labelAr ||
    mySubscription?.planOrderValueRange?.labelAr ||
    getPlanOrderValueRangeLabel(mySubscription);
  const freePlan = isOrderzhouseFreePlan(mySubscription?.planId ?? mySubscription?.plan);
  const blockMsg =
    eligibility && !eligibility.eligible
      ? getFreelancerOrderEligibilityMessage(eligibility, mySubscription)
      : "";

  return (
    <DashboardHubPage className="fdash-page--plans">
      <div className="fp-page">
        <header className="fp-surface fp-hero">
          <div className="fp-hero__copy">
            <span className="fp-hero__eyebrow">
              <Crown size={14} strokeWidth={2} aria-hidden />
              باقتك الحالية
            </span>
            <h1 className="fp-hero__title">{mySubscription?.plan?.title || "الاشتراك المجاني"}</h1>
            <p className="fp-hero__subtitle">
              {freePlan
                ? "يمكنك الترقية لباقة أعلى للوصول إلى طلبات بقيمة أكبر ومزايا إضافية."
                : "تابع حالة اشتراكك وادفع للترقية للباقة التالية عند الجاهزية."}
            </p>
            {nextPlan ? (
              <p className="fp-upgrade-hint" style={{ marginTop: 14 }}>
                <Sparkles size={15} strokeWidth={2} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} aria-hidden />
                الباقة التالية: <strong>{nextPlan.title}</strong> — اخترها من القائمة أدناه للترقية.
              </p>
            ) : null}
            {blockMsg ? <p className="fp-upgrade-hint" style={{ marginTop: 10 }}>{blockMsg}</p> : null}
          </div>

          <dl className="fp-hero__stats" aria-label="ملخص الاشتراك">
            <div className="fp-hero__stat">
              <dt>حالة الاشتراك</dt>
              <dd className="fp-hero__stat-value--accent">{subscriptionStatusLabel(mySubscription?.status)}</dd>
            </div>
            <div className="fp-hero__stat">
              <dt>الدفع</dt>
              <dd>{paymentLabel(mySubscription?.paymentStatus)}</dd>
            </div>
            <div className="fp-hero__stat">
              <dt>تفعيل الشركة</dt>
              <dd className={mySubscription?.activationStatus === "company_approved" ? "fp-hero__stat-value--ok" : "fp-hero__stat-value--warn"}>
                {activationLabel(mySubscription?.activationStatus)}
              </dd>
            </div>
            <div className="fp-hero__stat">
              <dt>أهلية المعرض</dt>
              <dd className={eligibility?.eligible ? "fp-hero__stat-value--ok" : "fp-hero__stat-value--warn"}>
                {eligibility?.eligible ? "يمكنك التقديم" : "غير مؤهل"}
              </dd>
            </div>
            {rangeLabel ? (
              <div className="fp-hero__stat" style={{ gridColumn: "1 / -1" }}>
                <dt>نطاق قيمة الطلبات</dt>
                <dd>{rangeLabel}</dd>
              </div>
            ) : null}
            {mySubscription?.expiryDate ? (
              <div className="fp-hero__stat" style={{ gridColumn: "1 / -1" }}>
                <dt>ينتهي في</dt>
                <dd>{formatJoDateMedium(mySubscription.expiryDate)}</dd>
              </div>
            ) : null}
          </dl>
        </header>

        <section className="fp-surface fp-pricing-wrap" aria-label="باقات الترقية">
          {error ? <p className="fp-error">{error}</p> : null}
          <PricingSection
            variant="dashboard"
            loading={loading}
            plans={plans}
            currentSubscription={mySubscription}
            hasBlockingSubscription={hasBlockingSubscription}
            checkoutBusyPlanId={checkoutBusyPlanId}
            onCta={startCheckout}
          />
        </section>
      </div>
    </DashboardHubPage>
  );
}
