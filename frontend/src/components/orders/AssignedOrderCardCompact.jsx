import { useMemo } from "react";
import { JodMoneyDisplay } from "../money/JodMoneyDisplay";

function typeLabel(projectType) {
  if (projectType === "fixed") return "Fixed";
  if (projectType === "bidding") return "Bidding";
  return "—";
}

function summaryText(text, max = 140) {
  const s = String(text || "").trim();
  if (!s) return "لا يوجد وصف.";
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

export default function AssignedOrderCardCompact({ order, onOpenDetails }) {
  const typeText = useMemo(() => typeLabel(order?.projectType), [order?.projectType]);
  const description = summaryText(order?.description);

  return (
    <article
      className="oh-assigned-card oh-order-card oh-order-card--marketplace"
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetails?.();
        }
      }}
    >
      <div className="oh-order-card__content">
        <h3 className="oh-assigned-card__title oh-order-card__title">{order?.title || "—"}</h3>
        <p className="oh-order-card__summary">{description}</p>
        <div className="oh-order-card__meta-row" aria-label="order type and price">
          <span className="oh-order-card__price">
            {order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null ? (
              <JodMoneyDisplay amount={order.bidBudgetMin} amountMax={order.bidBudgetMax} compact />
            ) : order?.projectType === "bidding" ? (
              order?.paymentAmount != null ? <JodMoneyDisplay amount={order.paymentAmount} compact /> : "—"
            ) : (
              <JodMoneyDisplay amount={order?.budget} compact />
            )}
          </span>
          <span className="oh-order-card__type">{typeText}</span>
        </div>
      </div>
    </article>
  );
}

