import {
  categoryChips,
  durationLabel,
  isBiddingOrder,
  orderPriceText,
  shortDescription,
} from "./openOrdersFormatters";
import {
  isPoolOrderLockedByPlan,
  poolOrderPlanLockBadgeText,
  poolOrderPlanLockTooltip,
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

function ActionButton({
  bidding,
  planLocked,
  rowDisabled,
  rowDisabledReason,
  bidBusy,
  taking,
  order,
  onBid,
  onTake,
}) {
  if (bidding) {
    return (
      <button
        type="button"
        className={`oh-order-row__action-btn${planLocked ? " oh-order-row__action-btn--locked" : ""}`}
        disabled={rowDisabled || bidBusy || order?.myBid?.status === "pending"}
        onClick={(e) => {
          e.stopPropagation();
          if (!rowDisabled) onBid?.();
        }}
        title={rowDisabledReason || (order?.myBid?.status === "pending" ? "لقد قدمت عرضاً لهذا الطلب." : "")}
      >
        {planLocked ? (
          <>
            <LockIcon />
            {poolOrderPlanLockBadgeText()}
          </>
        ) : bidBusy ? (
          "جارٍ الإرسال…"
        ) : order?.myBid?.status === "pending" ? (
          "عرضك مُرسل"
        ) : (
          "تقديم عرض"
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`oh-order-row__action-btn${planLocked ? " oh-order-row__action-btn--locked" : ""}`}
      disabled={rowDisabled || taking || (isPoolFixedApplicationOrder(order) && order?.myBid?.status === "pending")}
      onClick={(e) => {
        e.stopPropagation();
        if (!rowDisabled) onTake?.();
      }}
      title={rowDisabledReason || ""}
    >
      {planLocked ? (
        <>
          <LockIcon />
          {poolOrderPlanLockBadgeText()}
        </>
      ) : taking ? (
        "جارٍ الاستلام…"
      ) : poolFixedParticipationPending(order) ? (
        "تم التسجيل"
      ) : (
        "استلام الطلب"
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
  const rowDisabled = actionsDisabled || planLocked;
  const rowDisabledReason = planLocked ? poolOrderPlanLockTooltip(order) : actionsDisabledReason;
  const chips = categoryChips(order);
  const applicants = Number(order?.applicantsCount || 0);

  return (
    <li className={`oh-order-row-item${planLocked ? " oh-order-row-item--plan-locked" : ""}`}>
      <div
        className="oh-order-row oh-order-row--neu fdash-surface-3d fdash-surface-3d--soft"
        role="button"
        tabIndex={0}
        onClick={onOpenDetails}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenDetails?.();
          }
        }}
        aria-label={`فتح تفاصيل الطلب ${order?.title || ""}`}
      >
        <div className="oh-order-row__budget">
          <div className="oh-order-row__stat">
            <span className="oh-order-row__stat-label">ميزانية</span>
            <strong className="oh-order-row__stat-value oh-order-row__stat-value--price" dir="ltr">
              {orderPriceText(order)}
            </strong>
          </div>
          <div className="oh-order-row__stat">
            <span className="oh-order-row__stat-label">وقت التنفيذ</span>
            <strong className="oh-order-row__stat-value">{durationLabel(order)}</strong>
          </div>
        </div>

        <div className="oh-order-row__divider" aria-hidden />

        <div className="oh-order-row__center">
          <h3 className="oh-order-row__title">{order?.title || "—"}</h3>
          <p className="oh-order-row__summary">{shortDescription(order?.description, 120)}</p>
          {chips.length ? (
            <div className="oh-order-row__chips">
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
          <div className="oh-order-row__applicants">
            <span className="oh-order-row__applicants-icon" aria-hidden>
              <ApplicantsIcon />
            </span>
            <span>
              {applicants} {applicants === 1 ? "متقدم" : "متقدمون"}
            </span>
          </div>
          {showActions ? (
            <ActionButton
              bidding={bidding}
              planLocked={planLocked}
              rowDisabled={rowDisabled}
              rowDisabledReason={rowDisabledReason}
              bidBusy={bidBusy}
              taking={taking}
              order={order}
              onBid={onBid}
              onTake={onTake}
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
