import StatusBadge from "../../components/dashboard/StatusBadge";
import { paymentStatusLabel, subscriptionStatusLabel, formatSubscriptionAdminDateTime } from "../../admin/subscriptions/subscriptionAdminDisplay";
import { formatSubscriptionPaymentCountry } from "../../utils/countryDisplay";

function formatFreelancerName(sub) {
  const f = sub?.freelancer;
  if (!f) return `مستقل · ${sub.freelancerUserId}`;
  const name = [f.firstName, f.fatherName, f.familyName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (f.email) return f.email;
  return `مستقل · ${sub.freelancerUserId}`;
}

function freelancerSubline(sub) {
  const f = sub?.freelancer;
  const parts = [];
  if (f?.accountId) parts.push(f.accountId);
  if (f?.email && !String(formatFreelancerName(sub)).includes("@")) parts.push(f.email);
  return parts.join(" · ") || "—";
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

function SubscriptionActions({ sub, submitting, onDisable, onCancel, onFirstOrder, onCompanyActivate }) {
  const hasFirstOrderRecorded = Boolean(sub?.hasFirstOrder || sub?.firstOrderDate || sub?.actualStartDate);
  const showCompanyActivate = sub.paymentStatus === "paid" && sub.activationStatus !== "company_approved";

  return (
    <div className="oh-sa-subs-actions">
      <button type="button" className="btn btn-secondary btn-sm" disabled={submitting} onClick={() => onDisable(sub)}>
        تعطيل
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm oh-sa-subs-actions__danger"
        disabled={submitting}
        onClick={() => onCancel(sub)}
      >
        إلغاء
      </button>
      {!hasFirstOrderRecorded ? (
        <button type="button" className="btn btn-primary btn-sm" disabled={submitting} onClick={() => onFirstOrder(sub)}>
          تسجيل أول طلب
        </button>
      ) : null}
      {showCompanyActivate ? (
        <button type="button" className="btn btn-secondary btn-sm" disabled={submitting} onClick={() => onCompanyActivate(sub)}>
          تفعيل الشركة
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
}) {
  const planName = (sub) => sub?.plan?.title || planTitleById[String(sub?.planId || "")] || "—";

  return (
    <>
      <div className="oh-sa-subs-table-wrap">
        <table className="oh-sa-subs-table">
          <thead>
            <tr>
              <th>رقم الاشتراك</th>
              <th>المستقل</th>
              <th>الباقة</th>
              <th>الحالة</th>
              <th>الدفع</th>
              <th>تاريخ الإسناد</th>
              <th>بداية التفعيل</th>
              <th>الانتهاء</th>
              <th className="oh-sa-subs-table__actions-head">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((s) => (
              <tr key={s.id}>
                <td className="oh-sa-subs-table__id" dir="ltr">
                  #{s.id}
                </td>
                <td className="oh-sa-subs-table__freelancer">
                  <span className="oh-sa-subs-table__name">{formatFreelancerName(s)}</span>
                  <span className="oh-sa-subs-table__sub">{freelancerSubline(s)}</span>
                  <span className="oh-sa-subs-table__sub sa-sub-country">
                    {formatSubscriptionPaymentCountry({
                      countryCode: s.paymentCountryCode,
                      paymentStatus: s.paymentStatus,
                    })}
                  </span>
                </td>
                <td>{planName(s)}</td>
                <td>
                  <StatusBadge tone={subscriptionStatusTone(s.status)}>{subscriptionStatusLabel(s.status)}</StatusBadge>
                </td>
                <td>
                  <StatusBadge tone={paymentStatusTone(s.paymentStatus)}>{paymentStatusLabel(s.paymentStatus)}</StatusBadge>
                </td>
                <td className="oh-sa-subs-table__date" dir="ltr">
                  {formatSubscriptionAdminDateTime(s.assignedAt)}
                </td>
                <td className="oh-sa-subs-table__date" dir="ltr">
                  {formatSubscriptionAdminDateTime(s.actualStartDate)}
                </td>
                <td className="oh-sa-subs-table__date" dir="ltr">
                  {formatSubscriptionAdminDateTime(s.expiryDate)}
                </td>
                <td className="oh-sa-subs-table__actions">
                  <SubscriptionActions
                    sub={s}
                    submitting={submitting}
                    onDisable={onDisable}
                    onCancel={onCancel}
                    onFirstOrder={onFirstOrder}
                    onCompanyActivate={onCompanyActivate}
                  />
                </td>
              </tr>
            ))}
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
              <p className="oh-sa-subs-mobile-card__name">{formatFreelancerName(s)}</p>
              <p className="oh-sa-subs-mobile-card__meta">{freelancerSubline(s)}</p>
              <p className="oh-sa-subs-mobile-card__meta sa-sub-country">
                {formatSubscriptionPaymentCountry({
                  countryCode: s.paymentCountryCode,
                  paymentStatus: s.paymentStatus,
                })}
              </p>
              <div className="oh-sa-subs-mobile-card__row">
                <span>الباقة</span>
                <strong>{planName(s)}</strong>
              </div>
              <div className="oh-sa-subs-mobile-card__row">
                <span>الدفع</span>
                <StatusBadge tone={paymentStatusTone(s.paymentStatus)}>{paymentStatusLabel(s.paymentStatus)}</StatusBadge>
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
            />
          </li>
        ))}
      </ul>
    </>
  );
}
