import OrderApplicantsCount from "../orders/OrderApplicantsCount";
import { useAuth } from "../../context/useAuth";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  getLocalizedMarketplaceOrderDescription,
  getLocalizedMarketplaceOrderTitle,
} from "../../lib/i18n/getLocalizedMarketplaceOrderText";
import {
  categoryChips,
  durationLabel,
  isBiddingOrder,
  orderPriceText,
  shortDescription,
} from "./openOrdersFormatters";
import {
  isPoolOrderLockedByPlan,
} from "../../utils/poolOrderPlanEligibility";
import { isPoolFixedApplicationOrder, poolFixedParticipationPending } from "../../utils/poolOrderParticipation";

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}

function ApplicantsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 20v-1.25a4.25 4.25 0 0 0-4.25-4.25h-0.5a4.25 4.25 0 0 0-4.25 4.25V20" />
      <circle cx="12" cy="8.5" r="3.25" />
      <path d="M22 19.5v-0.75a3.5 3.5 0 0 0-3.5-3.5h-0.25" />
      <path d="M18.25 5.75a3 3 0 0 1 0 5.5" />
      <path d="M2 19.5v-0.75a3.5 3.5 0 0 1 3.5-3.5h0.25" />
      <path d="M5.75 11.25a3 3 0 0 0 0-5.5" />
    </svg>
  );
}

function actionBtnClass({ planLocked, actionsDisabled, disabled }) {
  const parts = ["oh-order-row__action-btn"];
  if (planLocked) parts.push("oh-order-row__action-btn--locked");
  else if (!actionsDisabled && !disabled) parts.push("oh-order-row__action-btn--cta");
  return parts.join(" ");
}

function ActionButton({
  bidding,
  planLocked,
  actionsDisabled,
  rowDisabled,
  rowDisabledReason,
  bidBusy,
  taking,
  order,
  onBid,
  onTake,
  t,
  planLockedLabel,
}) {
  if (bidding) {
    const bidDisabled = rowDisabled || bidBusy || order?.myBid?.status === "pending";
    return (
      <button
        type="button"
        className={actionBtnClass({ planLocked, actionsDisabled, disabled: bidDisabled })}
        disabled={bidDisabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!rowDisabled) onBid?.();
        }}
        title={rowDisabledReason || (order?.myBid?.status === "pending" ? t("orders.row.bidSubmitted") : "")}
      >
        {planLocked ? (
          <>
            <LockIcon />
            {planLockedLabel}
          </>
        ) : bidBusy ? (
          t("orders.bid.submitting")
        ) : order?.myBid?.status === "pending" ? (
          t("orders.bid.submitted")
        ) : (
          t("orders.bid.submitShort")
        )}
      </button>
    );
  }

  const takeDisabled =
    rowDisabled || taking || (isPoolFixedApplicationOrder(order) && order?.myBid?.status === "pending");

  return (
    <button
      type="button"
      className={actionBtnClass({ planLocked, actionsDisabled, disabled: takeDisabled })}
      disabled={takeDisabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!rowDisabled) onTake?.();
      }}
      title={rowDisabledReason || ""}
    >
      {planLocked ? (
        <>
          <LockIcon />
          {planLockedLabel}
        </>
      ) : taking ? (
        t("orders.marketplace.card.takingOrder")
      ) : poolFixedParticipationPending(order) ? (
        t("orders.marketplace.card.registered")
      ) : (
        t("orders.marketplace.card.takeOrder")
      )}
    </button>
  );
}

function MarketplaceOrderRow({
  order,
  onOpenDetails,
  showActions,
  onTake,
  onBid,
  taking = false,
  bidBusy = false,
  actionsDisabled = false,
  actionsDisabledReason = "",
}) {
  const bidding = isBiddingOrder(order);
  const planLocked = isPoolOrderLockedByPlan(order);
  const { user } = useAuth();
  const { t, locale, dir } = useTranslation();
  const rowDisabled = actionsDisabled || planLocked;
  const rowDisabledReason = planLocked ? t("orders.marketplace.planLocked") : actionsDisabledReason;
  const isAuthenticated = Boolean(user);
  const applicants = Number(order?.applicantsCount ?? order?.bidsCount ?? 0);
  const durationLabels = {
    day: t("orders.marketplace.card.day"),
    days: t("orders.marketplace.card.days"),
    hour: t("orders.marketplace.card.hour"),
    hours: t("orders.marketplace.card.hours"),
    minute: t("orders.marketplace.card.minute"),
    minutes: t("orders.marketplace.card.minutes"),
  };
  const chips = categoryChips(order, locale);
  const title = getLocalizedMarketplaceOrderTitle(order, locale);
  const description = getLocalizedMarketplaceOrderDescription(order, locale);

  return (
    <li className={`oh-order-row-item${planLocked ? " oh-order-row-item--plan-locked" : ""}`}>
      <div
        className="oh-order-row oh-order-row--neu fdash-surface-3d fdash-surface-3d--soft"
        role="button"
        tabIndex={0}
        dir={dir}
        onClick={onOpenDetails}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenDetails?.();
          }
        }}
        aria-label={t("orders.marketplace.card.openOrderAria", { title })}
      >
        <div className="oh-order-row__budget">
          <div className="oh-order-row__stat">
            <span className="oh-order-row__stat-label">{t("orders.row.budget")}</span>
            <strong className="oh-order-row__stat-value oh-order-row__stat-value--price" dir="ltr">
              {orderPriceText(order, locale)}
            </strong>
          </div>
          <div className="oh-order-row__stat">
            <span className="oh-order-row__stat-label">{t("orders.row.duration")}</span>
            <strong className="oh-order-row__stat-value" dir={locale === "en" ? "ltr" : undefined}>
              {durationLabel(order, locale, durationLabels)}
            </strong>
          </div>
        </div>

        <div className="oh-order-row__divider" aria-hidden />

        <div className="oh-order-row__center text-start">
          <h3 className="oh-order-row__title text-start" dir={locale === "en" ? "ltr" : "auto"}>
            {title}
          </h3>
          <p className="oh-order-row__summary text-start" dir={locale === "en" ? "ltr" : "auto"}>
            {shortDescription(description, 120, { emptyLabel: t("orders.marketplace.card.noDescription") })}
          </p>
          {order?.showTrainingBadge || chips.length ? (
            <div className="oh-order-row__chips">
              {order?.showTrainingBadge ? (
                <span className="oh-order-row__chip oh-order-row__chip--training">
                  {t("orders.marketplace.trainingBadge")}
                </span>
              ) : null}
              {chips.map((chip) => (
                <span key={chip} className="oh-order-row__chip">
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="oh-order-row__divider" aria-hidden />

        <div className="oh-order-row__side">
          <div
            className={`oh-order-row__applicants${isAuthenticated ? "" : " oh-order-row__applicants--guest"}`.trim()}
          >
            <span className="oh-order-row__applicants-icon" aria-hidden>
              <ApplicantsIcon />
            </span>
            <OrderApplicantsCount
              count={applicants}
              isAuthenticated={isAuthenticated}
              guestMessage={t("orders.marketplace.card.loginRequired")}
              guestTitle={t("orders.marketplace.card.loginRequiredTitle")}
              applicantSingular={t("orders.marketplace.card.applicant")}
              applicantPlural={t("orders.marketplace.card.applicants")}
              emptyLabel={t("orders.marketplace.card.noApplicants")}
            />
          </div>
          {showActions ? (
            <ActionButton
              bidding={bidding}
              planLocked={planLocked}
              actionsDisabled={actionsDisabled}
              rowDisabled={rowDisabled}
              rowDisabledReason={rowDisabledReason}
              bidBusy={bidBusy}
              taking={taking}
              order={order}
              onBid={onBid}
              onTake={onTake}
              t={t}
              planLockedLabel={t("orders.marketplace.planLocked")}
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default function MarketplaceOrderListRow(props) {
  return <MarketplaceOrderRow {...props} />;
}
