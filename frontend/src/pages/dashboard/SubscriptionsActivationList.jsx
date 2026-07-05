import StatusBadge from "../../components/dashboard/StatusBadge";
import {
  activationStatusLabel,
  formatAssignedByAdminLabel,
  formatFreelancerDisplayName,
  formatFreelancerDisplaySubline,
  formatSubscriptionAdminDateTime,
  isDashboardAdminAssignedSubscription,
  needsCompanyActivationAction,
  resolveSubscriptionPlanTitle,
  formatSubscriptionPaymentDate,
  subscriptionPaymentDateTableCell,
  subscriptionPaymentLabel,
  subscriptionPaymentTone,
  subscriptionStatusLabel,
} from "../../admin/subscriptions/subscriptionAdminDisplay";
import { formatSubscriptionPaymentCountry } from "../../utils/countryDisplay";

function activationStatusTone(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "company_approved") return "active";
  if (s === "company_rejected") return "danger";
  if (s === "company_pending") return "pending";
  return "neutral";
}

function subscriptionCountryHint(sub) {
  const line = formatSubscriptionPaymentCountry({
    countryCode: sub.paymentCountryCode,
    paymentStatus: sub.paymentStatus,
  });
  if (!line || line === "غير معروف") return null;
  return line;
}

function ActivationRowActions({ sub, submittingId, onActivate }) {
  if (isDashboardAdminAssignedSubscription(sub)) {
    return (
      <div className="oh-sa-subs-actions oh-sa-subs-actions--activation">
        <StatusBadge tone="admin_assigned">تم الإسناد من الإدارة</StatusBadge>
      </div>
    );
  }

  if (!needsCompanyActivationAction(sub)) {
    return null;
  }

  const busy = submittingId === String(sub.id);
  return (
    <div className="oh-sa-subs-actions oh-sa-subs-actions--activation">
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onActivate(sub.id)}>
        {busy ? "جارٍ التفعيل…" : "تفعيل الآن"}
      </button>
    </div>
  );
}

function ActivationTableSkeleton() {
  return (
    <div className="oh-sa-subs-table-wrap oh-sa-subs-table-wrap--loading" aria-hidden="true">
      <table className="oh-sa-subs-table oh-sa-subs-table--activation">
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="oh-sa-subs-activation-skel-row">
              {Array.from({ length: 8 }).map((__, j) => (
                <td key={j}>
                  <span className="oh-sa-subs-activation-skel-bar" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Card + table views for subscriptions awaiting company activation.
 */
export default function SubscriptionsActivationList({
  items,
  view,
  planTitleById,
  submittingId,
  onActivate,
  loading = false,
}) {
  if (loading) {
    return view === "table" ? (
      <ActivationTableSkeleton />
    ) : (
      <div className="oh-sa-activation-cards oh-sa-activation-cards--loading" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <article key={i} className="oh-sa-activation-card oh-sa-activation-card--skeleton">
            <span className="oh-sa-subs-activation-skel-bar oh-sa-subs-activation-skel-bar--title" />
            <span className="oh-sa-subs-activation-skel-bar" />
            <span className="oh-sa-subs-activation-skel-bar" />
            <span className="oh-sa-subs-activation-skel-bar oh-sa-subs-activation-skel-bar--short" />
          </article>
        ))}
      </div>
    );
  }

  const planTitle = (sub) => resolveSubscriptionPlanTitle(sub, planTitleById) || "—";
  const assignedByLabel = (sub) => formatAssignedByAdminLabel(sub);

  if (view === "table") {
    return (
      <div className="oh-sa-subs-table-wrap">
        <table className="oh-sa-subs-table oh-sa-subs-table--activation">
          <colgroup>
            <col className="oh-sa-act-col-id" />
            <col className="oh-sa-act-col-freelancer" />
            <col className="oh-sa-act-col-plan" />
            <col className="oh-sa-act-col-payment" />
            <col className="oh-sa-act-col-activation" />
            <col className="oh-sa-act-col-assigned" />
            <col className="oh-sa-act-col-paid" />
            <col className="oh-sa-act-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th className="oh-sa-act-col-id">رقم الاشتراك</th>
              <th className="oh-sa-act-col-freelancer">المستقل</th>
              <th className="oh-sa-act-col-plan">الباقة</th>
              <th className="oh-sa-act-col-payment">حالة الدفع</th>
              <th className="oh-sa-act-col-activation">حالة التفعيل</th>
              <th className="oh-sa-act-col-assigned">تاريخ الإسناد</th>
              <th className="oh-sa-act-col-paid">تاريخ الدفع</th>
              <th className="oh-sa-act-col-actions">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const name = formatFreelancerDisplayName(s);
              const subline = formatFreelancerDisplaySubline(s);
              const plan = planTitle(s);
              const adminAssigned = isDashboardAdminAssignedSubscription(s);
              return (
                <tr key={s.id} className={adminAssigned ? "oh-sa-activation-row--admin" : undefined}>
                  <td className="oh-sa-act-col-id oh-sa-subs-table__id">#{s.id}</td>
                  <td className="oh-sa-act-col-freelancer oh-sa-subs-table__freelancer">
                    <span className="oh-sa-subs-table__name" title={name}>
                      {name}
                    </span>
                    {subline ? (
                      <span className="oh-sa-subs-table__sub" title={subline}>
                        {subline}
                      </span>
                    ) : null}
                    {assignedByLabel(s) ? (
                      <span className="oh-sa-subs-table__sub" title={assignedByLabel(s)}>
                        إسناد: {assignedByLabel(s)}
                      </span>
                    ) : null}
                    {subscriptionCountryHint(s) ? (
                      <span className="oh-sa-subs-table__sub sa-sub-country">{subscriptionCountryHint(s)}</span>
                    ) : null}
                  </td>
                  <td className="oh-sa-act-col-plan oh-sa-subs-table__plan" title={plan}>
                    {plan}
                  </td>
                  <td className="oh-sa-act-col-payment oh-sa-subs-table__payment">
                    <StatusBadge tone={subscriptionPaymentTone(s)}>{subscriptionPaymentLabel(s)}</StatusBadge>
                  </td>
                  <td className="oh-sa-act-col-activation oh-sa-subs-table__status">
                    <StatusBadge tone={activationStatusTone(s.activationStatus)}>
                      {activationStatusLabel(s.activationStatus)}
                    </StatusBadge>
                  </td>
                  <td className="oh-sa-act-col-assigned oh-sa-subs-table__date">
                    {formatSubscriptionAdminDateTime(s.assignedAt)}
                  </td>
                  <td className="oh-sa-act-col-paid oh-sa-subs-table__date">
                    {subscriptionPaymentDateTableCell(s, formatSubscriptionAdminDateTime)}
                  </td>
                  <td className="oh-sa-act-col-actions oh-sa-subs-table__actions">
                    <ActivationRowActions sub={s} submittingId={submittingId} onActivate={onActivate} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="oh-sa-activation-cards">
      {items.map((s) => {
        const name = formatFreelancerDisplayName(s);
        const subline = formatFreelancerDisplaySubline(s);
        const countryHint = subscriptionCountryHint(s);
        const plan = planTitle(s);
        const paymentDate = formatSubscriptionPaymentDate(s, formatSubscriptionAdminDateTime);
        const adminAssigned = isDashboardAdminAssignedSubscription(s);
        const byAdmin = assignedByLabel(s);
        return (
          <article
            className={`oh-sa-activation-card${adminAssigned ? " oh-sa-activation-card--admin" : ""}`}
            key={s.id}
          >
            <div className="oh-sa-activation-card__head">
              <span className="oh-sa-activation-card__id" dir="ltr">
                اشتراك #{s.id}
              </span>
              {adminAssigned ? (
                <StatusBadge tone="admin_assigned" className="oh-sa-activation-card__kind">
                  إسناد إداري
                </StatusBadge>
              ) : null}
            </div>
            <div className="oh-sa-activation-card__body">
              <p className="oh-sa-activation-card__name">{name}</p>
              {subline ? <p className="oh-sa-activation-card__meta">{subline}</p> : null}
              {countryHint ? <p className="oh-sa-activation-card__meta sa-sub-country">{countryHint}</p> : null}
              <div className="oh-sa-activation-card__row">
                <span>الباقة</span>
                <strong>{plan}</strong>
              </div>
              <div className="oh-sa-activation-card__row">
                <span>حالة الدفع</span>
                <StatusBadge tone={subscriptionPaymentTone(s)}>{subscriptionPaymentLabel(s)}</StatusBadge>
              </div>
              <div className="oh-sa-activation-card__row">
                <span>حالة الاشتراك</span>
                <strong>{subscriptionStatusLabel(s.status)}</strong>
              </div>
              <div className="oh-sa-activation-card__row">
                <span>حالة التفعيل</span>
                <strong>{activationStatusLabel(s.activationStatus)}</strong>
              </div>
              {byAdmin ? (
                <div className="oh-sa-activation-card__row">
                  <span>إسناد بواسطة</span>
                  <strong>{byAdmin}</strong>
                </div>
              ) : null}
              <div className="oh-sa-activation-card__dates">
                <span dir="ltr">تاريخ الإسناد: {formatSubscriptionAdminDateTime(s.assignedAt)}</span>
                <span dir="ltr">تاريخ الإنشاء: {formatSubscriptionAdminDateTime(s.createdAt)}</span>
                {paymentDate ? <span dir="ltr">تاريخ الدفع: {paymentDate}</span> : null}
              </div>
            </div>
            <div className="oh-sa-activation-card__actions">
              <ActivationRowActions sub={s} submittingId={submittingId} onActivate={onActivate} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
