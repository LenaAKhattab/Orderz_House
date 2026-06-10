import { Link } from "react-router-dom";
import { getFreelancerOrderEligibilityMessage } from "../../../../utils/freelancerEligibilityUi";
import { isOrderzhouseFreePlan } from "../../../../constants/orderzhousePlansCatalog";
import {
  computeActiveWorkloadCount,
  formatJoDateMedium,
  formatTimeRemainingAr,
  getPlanOrderValueRangeLabel,
} from "../../../../utils/freelancerDashboardData";

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

export default function PlanStatusCard({ subscription, eligibility, orderCounts, nowMs, loading }) {
  if (loading) {
    return (
      <article className="fdash-cc-card fdash-cc-card--plan">
        <div className="fdash-cc-skel" style={{ height: 120 }} />
      </article>
    );
  }

  const freePlan = isOrderzhouseFreePlan(subscription?.planId ?? subscription?.plan);
  const rangeLabel =
    subscription?.labelAr ||
    subscription?.planOrderValueRange?.labelAr ||
    getPlanOrderValueRangeLabel(subscription);
  const remaining = subscription?.expiryDate ? formatTimeRemainingAr(subscription.expiryDate, nowMs) : null;
  const activeWorkload = computeActiveWorkloadCount(orderCounts);

  const eligible = Boolean(eligibility?.eligible);
  const blockMsg =
    !eligible && eligibility ? getFreelancerOrderEligibilityMessage(eligibility, subscription) : "";

  return (
    <article className="fdash-cc-card fdash-cc-card--plan">
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">الباقة والأهلية</h3>
        {!subscription ? (
          <Link to="/dashboard/freelancer/plans" className="fdash-cc-card__link">
            اختيار باقة
          </Link>
        ) : null}
      </header>

      {!subscription ? (
        <p className="fdash-cc-card__muted">لا يوجد اشتراك نشط — اختر باقة للبدء.</p>
      ) : (
        <div className="fdash-cc-card__body">
          <p className="fdash-cc-card__highlight">{subscription.plan?.title || "اشتراك"}</p>
          <dl className="fdash-cc-kv">
            <div>
              <dt>حالة الاشتراك</dt>
              <dd>
                {subscription.status === "active"
                  ? "نشط"
                  : subscription.status === "assigned_not_started"
                    ? "بانتظار أول طلب"
                    : subscription.status === "expired"
                      ? "منتهي"
                      : subscription.status || "—"}
              </dd>
            </div>
            <div>
              <dt>الدفع</dt>
              <dd>{paymentLabel(subscription.paymentStatus)}</dd>
            </div>
            <div>
              <dt>تفعيل الشركة</dt>
              <dd>{activationLabel(subscription.activationStatus)}</dd>
            </div>
            {subscription.expiryDate ? (
              <div>
                <dt>ينتهي في</dt>
                <dd>{formatJoDateMedium(subscription.expiryDate)}</dd>
              </div>
            ) : null}
            {remaining ? (
              <div>
                <dt>المدة المتبقية</dt>
                <dd className={remaining.expired ? "fdash-cc-kv__urgent" : ""}>{remaining.text}</dd>
              </div>
            ) : null}
            {rangeLabel ? (
              <div>
                <dt>نطاق قيمة الطلبات</dt>
                <dd>{rangeLabel}</dd>
              </div>
            ) : null}
            <div>
              <dt>طلبات حقيقية</dt>
              <dd>{freePlan ? "متاحة ضمن نطاق 3–7 د.أ" : "متاحة وفق الباقة"}</dd>
            </div>
            <div>
              <dt>طلبات تدريبية</dt>
              <dd>متاحة وفق إعدادات المنصة</dd>
            </div>
            <div>
              <dt>عبء العمل الحالي</dt>
              <dd>{activeWorkload} طلب نشط</dd>
            </div>
            <div>
              <dt>أهلية المعرض</dt>
              <dd className={eligible ? "fdash-cc-kv__ok" : "fdash-cc-kv__urgent"}>
                {eligible ? "يمكنك التقديم" : "غير مؤهل"}
              </dd>
            </div>
          </dl>
          {blockMsg ? <p className="fdash-cc-card__warn">{blockMsg}</p> : null}
        </div>
      )}
    </article>
  );
}
