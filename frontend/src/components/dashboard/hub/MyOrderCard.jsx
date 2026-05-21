import { useNavigate } from "react-router-dom";
import {
  categoryChips,
  durationLabel,
  orderPriceText,
  shortDescription,
} from "../../open-orders/openOrdersFormatters";
import { orderStatusDisplayBadge } from "../../../utils/orderFlowUi";
import { fdashBadgeClassFromOh } from "./orderBadgeUi";

function formatJoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium" }).format(d);
}

function deadlineHint(order) {
  const status = String(order?.orderStatus || "");
  if (status === "completed") return { text: "مكتمل", className: "fmo-order-row__stat-value--ok" };
  if (status === "cancelled") return { text: "ملغي", className: "fmo-order-row__stat-value--muted" };
  const due = order?.revisionDeadlineAt || order?.dueAt;
  const label = formatJoDate(due);
  if (!label) return { text: "—", className: "fmo-order-row__stat-value--muted" };
  const end = new Date(due);
  if (!Number.isFinite(end.getTime())) return { text: label, className: "" };
  const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: `${label} · متأخر`, className: "fmo-order-row__stat-value--urgent" };
  if (days <= 3) return { text: `${label} · ${days} يوم`, className: "fmo-order-row__stat-value--urgent" };
  return { text: `${label} · ${days} يوم`, className: "" };
}

function primaryCtaLabel(order) {
  const status = String(order?.orderStatus || "");
  const hasRevision = Boolean(order?.clientRevisionNote);
  if (
    hasRevision &&
    (status === "in_progress" || status === "ready_for_work" || status === "pending_client_review")
  ) {
    return "تنفيذ التعديل";
  }
  if (status === "pending_client_review") return "بانتظار المراجعة";
  if (status === "completed") return "عرض الطلب";
  if (status === "cancelled") return "عرض التفاصيل";
  if (status === "assigned" || status === "in_progress" || status === "ready_for_work") {
    return "متابعة التنفيذ";
  }
  return "متابعة التنفيذ";
}

function actionBtnModifier(order) {
  const status = String(order?.orderStatus || "");
  if (order?.clientRevisionNote && (status === "in_progress" || status === "ready_for_work")) {
    return " fmo-order-row__action-btn--revision";
  }
  if (status === "pending_client_review") return " fmo-order-row__action-btn--review";
  if (status === "completed") return " fmo-order-row__action-btn--done";
  if (status === "cancelled") return " fmo-order-row__action-btn--muted";
  return "";
}

export default function MyOrderCard({ order, detailsPath }) {
  const navigate = useNavigate();
  const badge = orderStatusDisplayBadge(order);
  const badgeClass = fdashBadgeClassFromOh(badge.className);
  const hasRevision = Boolean(order?.clientRevisionNote);
  const status = String(order?.orderStatus || "");
  const deadline = deadlineHint(order);
  const path = detailsPath || `/dashboard/freelancer/my-orders/${order.id}`;
  const chips = categoryChips(order);
  const filesCount = Number(order?.filesCount || 0);
  const updatedLabel = formatJoDate(order?.updatedAt || order?.createdAt);
  const codeLabel = order?.orderCode ? `#${order.orderCode}` : `#${order.id}`;
  const ctaLabel = primaryCtaLabel(order);

  const openDetails = () => navigate(path);

  return (
    <article
      className={[
        "fmo-order-row fdash-surface-3d fdash-surface-3d--soft",
        hasRevision ? "fmo-order-row--revision" : "",
        status === "completed" ? "fmo-order-row--completed" : "",
        status === "cancelled" ? "fmo-order-row--cancelled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className="fmo-order-row__surface"
        role="button"
        tabIndex={0}
        onClick={openDetails}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDetails();
          }
        }}
        aria-label={`${ctaLabel} — ${order.title || "طلب"}`}
      >
        <div className="fmo-order-row__stats">
          <span className={badgeClass}>{badge.label}</span>
          <div className="fmo-order-row__stat">
            <span className="fmo-order-row__stat-label">القيمة</span>
            <strong className="fmo-order-row__stat-value fmo-order-row__stat-value--price" dir="ltr">
              {orderPriceText(order)}
            </strong>
          </div>
          <div className="fmo-order-row__stat">
            <span className="fmo-order-row__stat-label">الموعد النهائي</span>
            <strong className={`fmo-order-row__stat-value ${deadline.className}`.trim()}>{deadline.text}</strong>
          </div>
          <div className="fmo-order-row__stat">
            <span className="fmo-order-row__stat-label">مدة التسليم</span>
            <strong className="fmo-order-row__stat-value">{durationLabel(order)}</strong>
          </div>
        </div>

        <div className="fmo-order-row__divider" aria-hidden />

        <div className="fmo-order-row__center">
          <div className="fmo-order-row__head">
            <h3 className="fmo-order-row__title">{order.title || "—"}</h3>
            <span className="fmo-order-row__code">{codeLabel}</span>
          </div>
          <p className="fmo-order-row__summary">{shortDescription(order.description, 120)}</p>
          {chips.length ? (
            <div className="fmo-order-row__chips">
              {chips.map((chip) => (
                <span key={chip} className="fmo-order-row__chip">
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          <div className="fmo-order-row__meta-line">
            {updatedLabel ? <span>آخر تحديث: {updatedLabel}</span> : null}
            {filesCount > 0 ? <span>{filesCount} ملف</span> : <span>بدون مرفقات</span>}
          </div>
          {hasRevision ? (
            <p className="fmo-order-row__revision" role="status">
              تعديل مطلوب — راجع ملاحظات العميل أو الإدارة في التفاصيل
            </p>
          ) : null}
        </div>

        <div className="fmo-order-row__divider" aria-hidden />

        <div className="fmo-order-row__actions">
          <button
            type="button"
            className={`fmo-order-row__action-btn${actionBtnModifier(order)}`}
            onClick={(e) => {
              e.stopPropagation();
              openDetails();
            }}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </article>
  );
}
