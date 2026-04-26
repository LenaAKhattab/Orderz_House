import { useMemo } from "react";
import { arabicDurationUnit } from "../../utils/arTime";
import { orderStatusDisplayBadge } from "../../utils/orderFlowUi";

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function shortText(text, max = 120) {
  const s = String(text || "").trim();
  if (!s) return "—";
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

function typeLabel(projectType) {
  if (projectType === "fixed") return "سعر ثابت";
  if (projectType === "bidding") return "مزايدة";
  return "—";
}

function durationLabel(order) {
  if (!order?.durationValue || !order?.durationUnit) return "—";
  return `${order.durationValue} ${arabicDurationUnit(order.durationValue, order.durationUnit)}`;
}

function isPricedBiddingOrder(order) {
  return order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null;
}

export default function PoolOrderCardCompact({
  order,
  onOpenDetails,
  canTake = false,
  taking = false,
  bidBusy = false,
  onTake,
  onBid,
  disabledReason,
}) {
  const badge = useMemo(() => orderStatusDisplayBadge(order), [order]);
  const filesCount = Array.isArray(order?.files) ? order.files.length : 0;
  const categoryText = `${order?.category?.name || "—"}${order?.subSubcategory?.name ? ` • ${order.subSubcategory.name}` : ""}`;
  const myClaimStatus = order?.myClaim?.status ? String(order.myClaim.status) : "";
  const pricedBidding = useMemo(() => isPricedBiddingOrder(order), [order]);
  const takenNote =
    myClaimStatus === "pending"
      ? "سبق أن تقدمت لهذا الطلب وهو قيد المراجعة."
      : myClaimStatus === "withdrawn"
        ? "سبق أن تقدمت لهذا الطلب ثم قمت بسحبه."
        : myClaimStatus === "rejected"
          ? "سبق أن تقدمت لهذا الطلب وتم رفض الطلب."
          : myClaimStatus
            ? `سبق أن تقدمت لهذا الطلب (الحالة: ${myClaimStatus}).`
            : "";
  const effectiveDisabledReason = !canTake && disabledReason ? disabledReason : takenNote ? takenNote : "";

  return (
    <article
      className="oh-pool-card"
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
      <header className="oh-pool-card__head">
        <div className="oh-pool-card__title-wrap">
          <div className="oh-pool-card__title">{order?.title || "—"}</div>
          <div className="oh-pool-card__sub">
            {/* intentionally hidden for freelancers/users */}
          </div>
        </div>
        <div className="oh-pool-card__badges">
          <span className={badge.className}>{badge.label}</span>
        </div>
      </header>

      <div className="oh-pool-card__meta">
        <span className="oh-mini-chip">{categoryText}</span>
        <span className="oh-mini-chip">النوع: {typeLabel(order?.projectType)}</span>
        <span className="oh-mini-chip">
          السعر:{" "}
          <span dir="ltr" style={{ unicodeBidi: "plaintext" }}>
            {pricedBidding
              ? `${formatMoney(order.bidBudgetMin)} – ${formatMoney(order.bidBudgetMax)}${order?.currencyCode ? ` ${order.currencyCode}` : ""}`
              : order?.projectType === "bidding"
                ? "—"
                : `${formatMoney(order?.budget)}${order?.projectType === "fixed" && order?.currencyCode ? ` ${order.currencyCode}` : ""}`}
          </span>
        </span>
        <span className="oh-mini-chip">مدة التسليم: {durationLabel(order)}</span>
        <span className="oh-mini-chip">ملفات: {filesCount ? String(filesCount) : "لا توجد ملفات مضافة"}</span>
      </div>

      <p className="oh-pool-card__desc">{shortText(order?.description, 140)}</p>

      <footer className="oh-pool-card__actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn btn-secondary" onClick={() => onOpenDetails?.()}>
          عرض التفاصيل
        </button>
        {pricedBidding ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canTake || bidBusy || order?.myBid?.status === "pending"}
            title={effectiveDisabledReason || (order?.myBid?.status === "pending" ? "لقد قدمت عرضاً لهذا الطلب." : "")}
            onClick={() => onBid?.()}
          >
            {bidBusy ? "جارٍ الإرسال…" : order?.myBid?.status === "pending" ? "عرضك مُرسل" : "تقديم عرض سعر"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canTake || taking || myClaimStatus === "pending"}
            title={effectiveDisabledReason}
            onClick={() => onTake?.()}
          >
            {taking ? "جارٍ الاستلام…" : "استلام الطلب"}
          </button>
        )}
      </footer>
    </article>
  );
}

