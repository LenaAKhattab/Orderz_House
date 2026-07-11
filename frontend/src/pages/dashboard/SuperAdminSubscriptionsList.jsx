import StatusBadge from "../../components/dashboard/StatusBadge";
import {
  subscriptionPaymentLabel,
  subscriptionPaymentTone,
  subscriptionStatusLabel,
  formatSubscriptionAdminDateTime,
  formatFreelancerDisplayName,
  formatFreelancerDisplaySubline,
} from "../../admin/subscriptions/subscriptionAdminDisplay";
import {
  isWhatsappEligibleSubscription,
  resolveFreelancerWhatsapp,
} from "../../admin/subscriptions/subscriptionWhatsApp";
import { formatSubscriptionPaymentCountry } from "../../utils/countryDisplay";

function subscriptionCountryLine(sub) {
  const text = formatSubscriptionPaymentCountry({
    countryCode: sub.paymentCountryCode,
    paymentStatus: sub.paymentStatus,
  });
  if (!text || text === "غير معروف") return null;
  return text;
}

export function subscriptionStatusTone(status) {
  const st = String(status || "").trim().toLowerCase();
  if (st === "active") return "active";
  if (st === "cancelled") return "danger";
  if (st === "expired") return "warning";
  return "inactive";
}

export function paymentStatusTone(status) {
  const p = String(status || "").trim().toLowerCase();
  if (p === "pending") return "pending";
  if (p === "paid") return "success";
  return "neutral";
}

function SubscriptionActions({
  sub,
  submitting,
  onDisable,
  onCancel,
  onFirstOrder,
  onCompanyActivate,
  onWhatsApp,
  layout = "wrap",
}) {
  const hasFirstOrderRecorded = Boolean(sub?.hasFirstOrder || sub?.firstOrderDate || sub?.actualStartDate);
  const showCompanyActivate = sub.paymentStatus === "paid" && sub.activationStatus !== "company_approved";
  const compact = layout === "compact";
  const showWhatsApp = Boolean(onWhatsApp) && isWhatsappEligibleSubscription(sub);
  const whatsappNumber = showWhatsApp ? resolveFreelancerWhatsapp(sub).normalized : null;

  return (
    <div className={`oh-sa-subs-actions${compact ? " oh-sa-subs-actions--compact" : ""}`}>
      <button
        type="button"
        className="btn btn-secondary btn-sm oh-sa-subs-actions__btn"
        disabled={submitting}
        onClick={() => onDisable(sub)}
      >
        تعطيل
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm oh-sa-subs-actions__btn oh-sa-subs-actions__btn--danger"
        disabled={submitting}
        onClick={() => onCancel(sub)}
      >
        إلغاء
      </button>
      {!hasFirstOrderRecorded ? (
        <button
          type="button"
          className="btn btn-primary btn-sm oh-sa-subs-actions__btn oh-sa-subs-actions__btn--primary"
          disabled={submitting}
          onClick={() => onFirstOrder(sub)}
        >
          تسجيل أول طلب
        </button>
      ) : null}
      {showCompanyActivate ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm oh-sa-subs-actions__btn"
          disabled={submitting}
          onClick={() => onCompanyActivate(sub)}
        >
          تفعيل الشركة
        </button>
      ) : null}
      {showWhatsApp ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm oh-sa-subs-actions__btn oh-sa-subs-actions__btn--wa"
          disabled={submitting || !whatsappNumber}
          title={whatsappNumber ? "إرسال رسالة واتساب" : "لا يوجد رقم واتساب"}
          onClick={() => onWhatsApp(sub)}
        >
          واتساب
        </button>
      ) : null}
    </div>
  );
}

/**
 * Desktop table + mobile compact cards for subscription rows.
 */
export default function SuperAdminSubscriptionsList({
  subscriptions,
  planTitleById,
  submitting,
  onDisable,
  onCancel,
  onFirstOrder,
  onCompanyActivate,
  onWhatsApp,
}) {
  const planName = (sub) => sub?.plan?.title || planTitleById[String(sub?.planId || "")] || "—";

  return (
    <>
      <div className="oh-sa-subs-table-wrap">
        <table className="oh-sa-subs-table">
          <colgroup>
            <col className="oh-sa-subs-col-id" />
            <col className="oh-sa-subs-col-freelancer" />
            <col className="oh-sa-subs-col-plan" />
            <col className="oh-sa-subs-col-status" />
            <col className="oh-sa-subs-col-payment" />
            <col className="oh-sa-subs-col-assigned" />
            <col className="oh-sa-subs-col-start" />
            <col className="oh-sa-subs-col-expiry" />
            <col className="oh-sa-subs-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th className="oh-sa-subs-col-id">رقم الاشتراك</th>
              <th className="oh-sa-subs-col-freelancer">المستقل</th>
              <th className="oh-sa-subs-col-plan">الباقة</th>
              <th className="oh-sa-subs-col-status">الحالة</th>
              <th className="oh-sa-subs-col-payment">الدفع</th>
              <th className="oh-sa-subs-col-assigned">تاريخ الإسناد</th>
              <th className="oh-sa-subs-col-start">بداية التفعيل</th>
              <th className="oh-sa-subs-col-expiry">الانتهاء</th>
              <th className="oh-sa-subs-col-actions">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((s) => {
              const name = formatFreelancerDisplayName(s);
              const subline = formatFreelancerDisplaySubline(s);
              const countryLine = subscriptionCountryLine(s);
              const plan = planName(s);
              return (
              <tr key={s.id}>
                <td className="oh-sa-subs-col-id oh-sa-subs-table__id" dir="ltr">
                  #{s.id}
                </td>
                <td className="oh-sa-subs-col-freelancer oh-sa-subs-table__freelancer">
                  <span className="oh-sa-subs-table__name" title={name}>
                    {name}
                  </span>
                  {subline ? (
                    <span className="oh-sa-subs-table__sub" title={subline}>
                      {subline}
                    </span>
                  ) : null}
                  {countryLine ? (
                    <span className="oh-sa-subs-table__sub sa-sub-country" title={countryLine}>
                      {countryLine}
                    </span>
                  ) : null}
                </td>
                <td className="oh-sa-subs-col-plan oh-sa-subs-table__plan" title={plan}>
                  {plan}
                </td>
                <td className="oh-sa-subs-col-status oh-sa-subs-table__status">
                  <StatusBadge tone={subscriptionStatusTone(s.status)} className="oh-sa-subs-table__badge">
                    {subscriptionStatusLabel(s.status)}
                  </StatusBadge>
                </td>
                <td className="oh-sa-subs-col-payment oh-sa-subs-table__payment">
                  <StatusBadge tone={subscriptionPaymentTone(s)} className="oh-sa-subs-table__badge">
                    {subscriptionPaymentLabel(s)}
                  </StatusBadge>
                </td>
                <td className="oh-sa-subs-col-assigned oh-sa-subs-table__date" dir="ltr">
                  {formatSubscriptionAdminDateTime(s.assignedAt)}
                </td>
                <td className="oh-sa-subs-col-start oh-sa-subs-table__date" dir="ltr">
                  {formatSubscriptionAdminDateTime(s.actualStartDate)}
                </td>
                <td className="oh-sa-subs-col-expiry oh-sa-subs-table__date" dir="ltr">
                  {formatSubscriptionAdminDateTime(s.expiryDate)}
                </td>
                <td className="oh-sa-subs-col-actions oh-sa-subs-table__actions">
                  <SubscriptionActions
                    sub={s}
                    submitting={submitting}
                    onDisable={onDisable}
                    onCancel={onCancel}
                    onFirstOrder={onFirstOrder}
                    onCompanyActivate={onCompanyActivate}
                    onWhatsApp={onWhatsApp}
                    layout="compact"
                  />
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      <ul className="oh-sa-subs-mobile-list">
        {subscriptions.map((s) => (
          <li key={s.id} className="oh-sa-subs-mobile-card">
            <div className="oh-sa-subs-mobile-card__head">
              <span className="oh-sa-subs-mobile-card__id" dir="ltr">
                #{s.id}
              </span>
              <StatusBadge tone={subscriptionStatusTone(s.status)}>{subscriptionStatusLabel(s.status)}</StatusBadge>
            </div>
            <div className="oh-sa-subs-mobile-card__body">
              <p className="oh-sa-subs-mobile-card__name">{formatFreelancerDisplayName(s)}</p>
              {formatFreelancerDisplaySubline(s) ? (
                <p className="oh-sa-subs-mobile-card__meta">{formatFreelancerDisplaySubline(s)}</p>
              ) : null}
              {subscriptionCountryLine(s) ? (
                <p className="oh-sa-subs-mobile-card__meta sa-sub-country">{subscriptionCountryLine(s)}</p>
              ) : null}
              <div className="oh-sa-subs-mobile-card__row">
                <span>الباقة</span>
                <strong>{planName(s)}</strong>
              </div>
              <div className="oh-sa-subs-mobile-card__row">
                <span>الدفع</span>
                <StatusBadge tone={subscriptionPaymentTone(s)}>{subscriptionPaymentLabel(s)}</StatusBadge>
              </div>
              <div className="oh-sa-subs-mobile-card__dates">
                <span dir="ltr">إسناد: {formatSubscriptionAdminDateTime(s.assignedAt)}</span>
                <span dir="ltr">بداية: {formatSubscriptionAdminDateTime(s.actualStartDate)}</span>
                <span dir="ltr">انتهاء: {formatSubscriptionAdminDateTime(s.expiryDate)}</span>
              </div>
            </div>
            <SubscriptionActions
              sub={s}
              submitting={submitting}
              onDisable={onDisable}
              onCancel={onCancel}
              onFirstOrder={onFirstOrder}
              onCompanyActivate={onCompanyActivate}
              onWhatsApp={onWhatsApp}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
