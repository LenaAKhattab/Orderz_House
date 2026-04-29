import { useMemo } from "react";

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function typeLabel(projectType) {
  if (projectType === "fixed") return "Fixed";
  if (projectType === "bidding") return "Bidding";
  return "—";
}

function isPricedBiddingOrder(order) {
  return order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null;
}

function summaryText(text, max = 140) {
  const s = String(text || "").trim();
  if (!s) return "لا يوجد وصف.";
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

export default function PoolOrderCardCompact({
  order,
  onOpenDetails,
}) {
  const pricedBidding = useMemo(() => isPricedBiddingOrder(order), [order]);
  const typeText = typeLabel(order?.projectType);
  const priceText = pricedBidding
    ? `${formatMoney(order.bidBudgetMin)} JOD - ${formatMoney(order.bidBudgetMax)} JOD`
    : order?.projectType === "bidding"
      ? "—"
      : `${formatMoney(order?.budget)} JOD`;
  const description = summaryText(order?.description);

  return (
    <article
      className="oh-pool-card oh-order-card oh-order-card--marketplace"
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
        <h3 className="oh-pool-card__title oh-order-card__title">{order?.title || "—"}</h3>
        <p className="oh-order-card__summary">{description}</p>
        <div className="oh-order-card__meta-row" aria-label="order type and price">
          <span className="oh-order-card__price" dir="ltr">
            {priceText}
          </span>
          <span className="oh-order-card__type">{typeText}</span>
        </div>
      </div>
    </article>
  );
}

