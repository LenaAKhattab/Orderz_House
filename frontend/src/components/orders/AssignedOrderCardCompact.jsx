import { useMemo } from "react";
import { arabicDurationUnit } from "../../utils/arTime";

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

function statusBadge(order) {
  const s = order?.orderStatus;
  if (s === "in_progress") return { label: "قيد التنفيذ", className: "oh-badge oh-badge--info" };
  if (s === "assigned") return { label: "مُسند", className: "oh-badge oh-badge--success" };
  if (s === "completed") return { label: "مكتمل", className: "oh-badge oh-badge--success" };
  if (s === "cancelled") return { label: "ملغي", className: "oh-badge oh-badge--danger" };
  return { label: s || "—", className: "oh-badge oh-badge--neutral" };
}

function timeLeftLabel(order) {
  const due = order?.dueAt ? new Date(order.dueAt) : null;
  if (!due || !Number.isFinite(due.getTime())) return null;
  const diffMs = due.getTime() - Date.now();
  if (diffMs <= 0) return "انتهت مدة المشروع.";
  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const nf = new Intl.NumberFormat("en-US");
  const parts = [];
  if (days > 0) parts.push(`${nf.format(days)} يوم`);
  if (hours > 0 || days > 0) parts.push(`${nf.format(hours)} ساعة`);
  parts.push(`${nf.format(minutes)} دقيقة`);
  return `متبقي ${parts.join(" و ")}.`;
}

export default function AssignedOrderCardCompact({ order, onOpenDetails }) {
  const badge = useMemo(() => statusBadge(order), [order]);
  const categoryText = `${order?.category?.name || "—"}${order?.subSubcategory?.name ? ` • ${order.subSubcategory.name}` : ""}`;
  const priceText = useMemo(() => {
    if (order?.projectType === "bidding") return "—";
    const amt = formatMoney(order?.budget);
    const cur = order?.currencyCode ? ` ${order.currencyCode}` : "";
    return `${amt}${cur}`.trim();
  }, [order]);
  const remaining = useMemo(() => timeLeftLabel(order), [order?.dueAt]);
  const durationText = useMemo(() => durationLabel(order), [order?.durationValue, order?.durationUnit]);
  const typeText = useMemo(() => typeLabel(order?.projectType), [order?.projectType]);

  return (
    <article
      className="oh-assigned-card"
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
      <div className="oh-assigned-card__main">
        <div className="oh-assigned-card__title">{order?.title || "—"}</div>
        <div className="oh-assigned-card__sub">{categoryText}</div>
        <div className="oh-assigned-card__chips" aria-label="ملخص سريع">
          <span className="oh-mini-chip oh-mini-chip--sm">النوع: {typeText}</span>
          <span className="oh-mini-chip oh-mini-chip--sm">
            السعر:{" "}
            <span dir="ltr" style={{ unicodeBidi: "plaintext" }}>
              {priceText}
            </span>
          </span>
          <span className="oh-mini-chip oh-mini-chip--sm">المدة: {durationText}</span>
          {remaining ? <span className="oh-mini-chip oh-mini-chip--sm">{remaining}</span> : null}
        </div>
      </div>

      <div className="oh-assigned-card__side" onClick={(e) => e.stopPropagation()}>
        <div className="oh-assigned-card__badge">
          <span className={badge.className}>{badge.label}</span>
        </div>
        <button type="button" className="btn btn-secondary oh-assigned-card__btn" onClick={() => onOpenDetails?.()}>
          عرض التفاصيل
        </button>
      </div>
    </article>
  );
}

