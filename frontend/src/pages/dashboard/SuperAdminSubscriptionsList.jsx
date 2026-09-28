import StatusBadge from "../../components/dashboard/StatusBadge";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/subscriptionsResources";
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

function subscriptionCountryLine(sub, t) {
  const text = formatSubscriptionPaymentCountry({
    countryCode: sub.paymentCountryCode,
    paymentStatus: sub.paymentStatus,
  });
  if (!text || text === t("subscriptions.display.unknown")) return null;
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
  t,
}) {
  const hasFirstOrderRecorded = Boolean(sub?.hasFirstOrder || sub?.firstOrderDate);
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
        {t("subscriptions.list.deactivate")}
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm oh-sa-subs-actions__btn oh-sa-subs-actions__btn--danger"
        disabled={submitting}
        onClick={() => onCancel(sub)}
      >
        {t("subscriptions.list.cancel")}
      </button>
      {!hasFirstOrderRecorded ? (
        <button
          type="button"
          className="btn btn-primary btn-sm oh-sa-subs-actions__btn oh-sa-subs-actions__btn--primary"
          disabled={submitting}
          onClick={() => onFirstOrder(sub)}
        >
          {t("subscriptions.list.firstOrder")}
        </button>
      ) : null}
      {showCompanyActivate ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm oh-sa-subs-actions__btn"
          disabled={submitting}
          onClick={() => onCompanyActivate(sub)}
        >
          {t("subscriptions.list.activateCompany")}
        </button>
      ) : null}
      {showWhatsApp ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm oh-sa-subs-actions__btn oh-sa-subs-actions__btn--wa"
          disabled={submitting || !whatsappNumber}
          title={whatsappNumber ? t("subscriptions.list.whatsappTitle") : t("subscriptions.list.whatsappNoNumber")}
          onClick={() => onWhatsApp(sub)}
        >
          {t("subscriptions.list.whatsapp")}
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
  const { t } = useTranslation();
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
              <th className="oh-sa-subs-col-id">{t("subscriptions.list.colId")}</th>
              <th className="oh-sa-subs-col-freelancer">{t("subscriptions.list.colFreelancer")}</th>
              <th className="oh-sa-subs-col-plan">{t("subscriptions.list.colPlan")}</th>
              <th className="oh-sa-subs-col-status">{t("subscriptions.list.colStatus")}</th>
              <th className="oh-sa-subs-col-payment">{t("subscriptions.list.colPayment")}</th>
              <th className="oh-sa-subs-col-assigned">{t("subscriptions.list.colAssigned")}</th>
              <th className="oh-sa-subs-col-start">{t("subscriptions.list.colStart")}</th>
              <th className="oh-sa-subs-col-expiry">{t("subscriptions.list.colExpiry")}</th>
              <th className="oh-sa-subs-col-actions">{t("subscriptions.list.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((s) => {
              const name = formatFreelancerDisplayName(s, t);
              const subline = formatFreelancerDisplaySubline(s, t);
              const countryLine = subscriptionCountryLine(s, t);
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
                    {subscriptionStatusLabel(s.status, t)}
                  </StatusBadge>
                </td>
                <td className="oh-sa-subs-col-payment oh-sa-subs-table__payment">
                  <StatusBadge tone={subscriptionPaymentTone(s)} className="oh-sa-subs-table__badge">
                    {subscriptionPaymentLabel(s, t)}
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
                    t={t}
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
              <StatusBadge tone={subscriptionStatusTone(s.status)}>{subscriptionStatusLabel(s.status, t)}</StatusBadge>
            </div>
            <div className="oh-sa-subs-mobile-card__body">
              <p className="oh-sa-subs-mobile-card__name">{formatFreelancerDisplayName(s, t)}</p>
              {formatFreelancerDisplaySubline(s, t) ? (
                <p className="oh-sa-subs-mobile-card__meta">{formatFreelancerDisplaySubline(s, t)}</p>
              ) : null}
              {subscriptionCountryLine(s, t) ? (
                <p className="oh-sa-subs-mobile-card__meta sa-sub-country">{subscriptionCountryLine(s, t)}</p>
              ) : null}
              <div className="oh-sa-subs-mobile-card__row">
                <span>{t("subscriptions.list.colPlan")}</span>
                <strong>{planName(s)}</strong>
              </div>
              <div className="oh-sa-subs-mobile-card__row">
                <span>{t("subscriptions.list.colPayment")}</span>
                <StatusBadge tone={subscriptionPaymentTone(s)}>{subscriptionPaymentLabel(s, t)}</StatusBadge>
              </div>
              <div className="oh-sa-subs-mobile-card__dates">
                <span dir="ltr">{t("subscriptions.list.assignedPrefix")} {formatSubscriptionAdminDateTime(s.assignedAt)}</span>
                <span dir="ltr">{t("subscriptions.list.startPrefix")} {formatSubscriptionAdminDateTime(s.actualStartDate)}</span>
                <span dir="ltr">{t("subscriptions.list.expiryPrefix")} {formatSubscriptionAdminDateTime(s.expiryDate)}</span>
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
              t={t}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
