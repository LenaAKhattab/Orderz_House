import {
  categoryLine,
  isBiddingOrder,
  orderPriceText,
  shortDescription,
  typeLabelAr,
} from "./openOrdersFormatters";

export default function MarketplaceOrderListRow({
  order,
  onOpenDetails,
  showActions = false,
  onTake,
  onBid,
  taking = false,
  bidBusy = false,
  actionsDisabled = false,
  actionsDisabledReason = "",
}) {
  const bidding = isBiddingOrder(order);
  return (
    <li className="oh-order-row-item">
      <div
        className="oh-order-row"
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
        <div className="oh-order-row__side">
          <div className="oh-order-row__applicants">
            <span className="oh-order-row__applicants-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16.5 20v-1.25a4.25 4.25 0 0 0-4.25-4.25h-0.5a4.25 4.25 0 0 0-4.25 4.25V20" />
                <circle cx="12" cy="8.5" r="3.25" />
                <path d="M22 19.5v-0.75a3.5 3.5 0 0 0-3.5-3.5h-0.25" />
                <path d="M18.25 5.75a3 3 0 0 1 0 5.5" />
                <path d="M2 19.5v-0.75a3.5 3.5 0 0 1 3.5-3.5h0.25" />
                <path d="M5.75 11.25a3 3 0 0 0 0-5.5" />
              </svg>
            </span>
            <span>
              {Number(order?.applicantsCount || 0)} {Number(order?.applicantsCount || 0) === 1 ? "متقدم" : "متقدمون"}
            </span>
          </div>
          {showActions ? (
            bidding ? (
              <button
                type="button"
                className="oh-order-row__action-btn"
                disabled={actionsDisabled || bidBusy || order?.myBid?.status === "pending"}
                onClick={(e) => {
                  e.stopPropagation();
                  onBid?.();
                }}
                title={actionsDisabledReason || (order?.myBid?.status === "pending" ? "لقد قدمت عرضاً لهذا الطلب." : "")}
              >
                {bidBusy ? "جارٍ الإرسال…" : order?.myBid?.status === "pending" ? "عرضك مُرسل" : "تقديم عرض"}
              </button>
            ) : (
              <button
                type="button"
                className="oh-order-row__action-btn"
                disabled={
                  actionsDisabled ||
                  taking ||
                  order?.myClaim?.status === "pending" ||
                  (order?.orderSource === "fake" && order?.myBid?.status === "pending")
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onTake?.();
                }}
                title={actionsDisabledReason || ""}
              >
                {taking
                  ? "جارٍ الاستلام…"
                  : order?.orderSource === "fake" && order?.myBid?.status === "pending"
                    ? "تم التسجيل"
                    : "استلام الطلب"}
              </button>
            )
          ) : null}
        </div>
        <div className="oh-order-row__main">
          <h3 className="oh-order-row__title">{categoryLine(order)}</h3>
          <div className="oh-order-row__meta">
            <span>{typeLabelAr(order?.projectType)}</span>
            {order?.orderSource === "fake" && order?.trainingLabel ? (
              <span className="help" style={{ opacity: 0.9 }}>
                {order.trainingLabel}
              </span>
            ) : null}
            <span className="oh-order-row__price" dir="ltr">
              {orderPriceText(order)}
            </span>
          </div>
          <p className="oh-order-row__desc">{order?.title || "—"}</p>
          <p className="oh-order-row__summary">{shortDescription(order?.description)}</p>
          <p className="oh-order-row__hint">اضغط للتفاصيل</p>
        </div>
      </div>
    </li>
  );
}
