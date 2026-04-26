import { useMemo, useState } from "react";
import { arabicDurationUnit } from "../../utils/arTime";
import ClientFreelancerClaimsModal from "./ClientFreelancerClaimsModal";
import ClientBiddingOffersModal from "./ClientBiddingOffersModal";
import ClientDeliveryReviewModal from "./ClientDeliveryReviewModal";
import ClientRevisionRequestModal from "./ClientRevisionRequestModal";

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function shortText(text, max = 160) {
  const s = String(text || "").trim();
  if (!s.length) return "—";
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

function isPricedBidding(order) {
  return order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null;
}

function clientStatusMeta(order) {
  if (order?.isArchived) return { label: "مؤرشف", className: "oh-badge oh-badge--neutral" };
  const s = order?.orderStatus;
  if (s === "pending_client_review") return { label: "مرفقات بانتظار اعتمادك", className: "oh-badge oh-badge--info" };
  if (s === "completed") return { label: "مكتمل", className: "oh-badge oh-badge--success" };
  if (s === "cancelled") return { label: "ملغي", className: "oh-badge oh-badge--danger" };
  if (order?.assignedFreelancerId && s === "in_progress") {
    return { label: "قيد التنفيذ مع المستقل", className: "oh-badge oh-badge--success" };
  }
  if (order?.assignedFreelancerId) return { label: "مُسند لمستقل", className: "oh-badge oh-badge--success" };
  if (s === "published") return { label: "منشور في الحوض", className: "oh-badge oh-badge--warning" };
  if (s === "assigned") return { label: "مُسند", className: "oh-badge oh-badge--success" };
  if (s === "in_progress") return { label: "قيد التنفيذ", className: "oh-badge oh-badge--info" };
  if (s === "draft") return { label: "مسودة", className: "oh-badge oh-badge--neutral" };
  return { label: s || "—", className: "oh-badge oh-badge--neutral" };
}

/**
 * بطاقة مدمجة لطلبات العميل (قائمة «طلباتي») — تدفق الموافقة على المستقلين والتسليم.
 */
export default function ClientOrderCardCompact({ order, onOrdersChange }) {
  const [expanded, setExpanded] = useState(false);
  const [claimsOpen, setClaimsOpen] = useState(false);
  const [bidsOpen, setBidsOpen] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState({ open: false, variant: "workflow" });
  const [revisionOpen, setRevisionOpen] = useState(false);
  const badge = useMemo(() => clientStatusMeta(order), [order]);
  const pricedBidding = useMemo(() => isPricedBidding(order), [order]);
  const filesCount = Array.isArray(order?.files) ? order.files.length : 0;
  const deliveryFilesCount = useMemo(
    () => (Array.isArray(order?.files) ? order.files.filter((f) => f.purpose === "delivery").length : 0),
    [order?.files],
  );
  const categoryText = `${order?.category?.name || "—"}${order?.subSubcategory?.name ? ` • ${order.subSubcategory.name}` : ""}`;
  const bidsCount = order?.bidsCount != null ? Number(order.bidsCount) : null;

  const isClientOrder = order?.sourceType === "client_created";
  const showClaimsButton =
    isClientOrder &&
    order?.projectType === "fixed" &&
    order?.orderStatus === "published" &&
    order?.isOpenForPool &&
    !order?.assignedFreelancerId &&
    !order?.isArchived;

  const showBiddingOffersButton =
    isClientOrder &&
    pricedBidding &&
    order?.orderStatus === "published" &&
    order?.isOpenForPool &&
    !order?.assignedFreelancerId &&
    !order?.isArchived;

  const showPostAssignActions =
    isClientOrder &&
    Boolean(order?.assignedFreelancerId) &&
    !order?.isArchived &&
    order?.orderStatus !== "completed" &&
    order?.orderStatus !== "cancelled";

  const showCompletedDeliveryArchive =
    isClientOrder &&
    order?.orderStatus === "completed" &&
    Boolean(order?.assignedFreelancerId) &&
    !order?.isArchived;

  return (
    <article className="client-order-compact">
      <header className="client-order-compact__head">
        <div className="client-order-compact__title-block">
          <div className="client-order-compact__title">{order?.title || "—"}</div>
          <div className="client-order-compact__codes">
            <span className="oh-code" title={order?.orderCode || ""}>
              {order?.orderCode || "—"}
            </span>
            <span className="client-order-compact__muted">أُنشئ {formatJoDateTime(order?.createdAt)}</span>
          </div>
        </div>
        <div className="client-order-compact__badges">
          <span className={badge.className}>{badge.label}</span>
          <span className="oh-mini-chip">{typeLabel(order?.projectType)}</span>
        </div>
      </header>

      <div className="client-order-compact__meta">
        <span className="oh-mini-chip">{categoryText}</span>
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
        <span className="oh-mini-chip">
          ملفات: {filesCount ? String(filesCount) : "لا يوجد"}
          {order?.orderStatus === "completed" && deliveryFilesCount > 0 ? (
            <span className="client-order-compact__hint"> ({deliveryFilesCount} تسليم)</span>
          ) : null}
        </span>
        {pricedBidding ? (
          <span className="oh-mini-chip">العروض: {Number.isFinite(bidsCount) ? String(bidsCount) : "—"}</span>
        ) : null}
      </div>

      <p className="client-order-compact__desc">{expanded ? String(order?.description || "").trim() || "—" : shortText(order?.description, 200)}</p>

      {order?.clientRevisionNote ? (
        <p className="help" style={{ margin: "8px 0 0", padding: "10px 12px", background: "rgba(59, 130, 246, 0.08)", borderRadius: 10 }}>
          <strong>ملاحظة تعديل منك للمستقل:</strong> {order.clientRevisionNote}
        </p>
      ) : null}

      <footer className="client-order-compact__foot" style={{ flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "طي الوصف" : "عرض الوصف كاملاً"}
        </button>
        {showClaimsButton ? (
          <button type="button" className="btn btn-primary" onClick={() => setClaimsOpen(true)}>
            مراجعة طلبات المستقلين
          </button>
        ) : null}
        {showBiddingOffersButton ? (
          <button type="button" className="btn btn-primary" onClick={() => setBidsOpen(true)}>
            مراجعة عروض الأسعار
          </button>
        ) : null}
        {showPostAssignActions ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setRevisionOpen(true)}>
              طلب تعديل
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setDeliveryModal({ open: true, variant: "workflow" })}>
              استلام الطلب
            </button>
          </>
        ) : null}
        {showCompletedDeliveryArchive ? (
          <button type="button" className="btn btn-primary" onClick={() => setDeliveryModal({ open: true, variant: "archive" })}>
            ملفات تسليم المستقل
          </button>
        ) : null}
      </footer>

      <ClientFreelancerClaimsModal
        open={claimsOpen}
        orderId={order?.id}
        onClose={() => setClaimsOpen(false)}
        onChanged={() => onOrdersChange?.()}
      />
      <ClientBiddingOffersModal
        open={bidsOpen}
        orderId={order?.id}
        order={order}
        onClose={() => setBidsOpen(false)}
        onChanged={() => onOrdersChange?.()}
      />
      <ClientDeliveryReviewModal
        open={deliveryModal.open}
        variant={deliveryModal.variant}
        order={order}
        onClose={() => setDeliveryModal({ open: false, variant: "workflow" })}
        onApprove={() => onOrdersChange?.()}
      />
      <ClientRevisionRequestModal
        open={revisionOpen}
        orderId={order?.id}
        onClose={() => setRevisionOpen(false)}
        onSaved={() => onOrdersChange?.()}
      />
    </article>
  );
}
