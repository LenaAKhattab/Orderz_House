import { useCallback, useEffect, useMemo, useState } from "react";
import { arabicDurationUnit } from "../../utils/arTime";
import ClientFreelancerClaimsModal from "./ClientFreelancerClaimsModal";
import ClientBiddingOffersModal from "./ClientBiddingOffersModal";
import ClientDeliveryReviewModal from "./ClientDeliveryReviewModal";
import ClientRevisionRequestModal from "./ClientRevisionRequestModal";
import SubmissionHistoryTimeline from "./submission-history/SubmissionHistoryTimeline";
import { getClientOrderByIdRequest } from "../../services/api";
import { orderHasAssignment } from "../../utils/orderPrivacyUi";

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
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

function bidderDisplayName(bidUser) {
  if (bidUser?.displayName) return bidUser.displayName;
  const u = bidUser?.user || {};
  const full = [u.firstName, u.fatherName, u.familyName].filter(Boolean).join(" ").trim();
  return full || "—";
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
  if (s === "open_for_bids") return { label: "بانتظار عروض المستقلين", className: "oh-badge oh-badge--warning" };
  if (s === "open_for_freelancers") return { label: "بانتظار عروض المستقلين", className: "oh-badge oh-badge--warning" };
  if (s === "awaiting_payment_after_bid_selection") {
    return { label: "بانتظار الدفع بعد اختيار العرض", className: "oh-badge oh-badge--info" };
  }
  if (s === "completed") return { label: "مكتمل", className: "oh-badge oh-badge--success" };
  if (s === "cancelled") return { label: "ملغي", className: "oh-badge oh-badge--danger" };
  if (orderHasAssignment(order) && s === "in_progress") {
    return { label: "قيد التنفيذ مع المستقل", className: "oh-badge oh-badge--success" };
  }
  if (orderHasAssignment(order)) return { label: "مُسند لمستقل", className: "oh-badge oh-badge--success" };
  if (s === "published") return { label: "منشور في المعرض", className: "oh-badge oh-badge--warning" };
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
  const [detailOrder, setDetailOrder] = useState(null);
  const [claimsOpen, setClaimsOpen] = useState(false);
  const [bidsOpen, setBidsOpen] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState({ open: false, variant: "workflow" });
  const [revisionOpen, setRevisionOpen] = useState(false);
  const badge = useMemo(() => clientStatusMeta(order), [order]);
  const pricedBidding = useMemo(() => isPricedBidding(order), [order]);
  const filesCount = Array.isArray(order?.files) ? order.files.length : 0;
  const deliveryFilesCount = useMemo(
    () => (Array.isArray(order?.files) ? order.files.filter((f) => f.purpose === "delivery").length : 0),
    [order],
  );
  const categoryText = `${order?.category?.name || "—"}${order?.subSubcategory?.name ? ` • ${order.subSubcategory.name}` : ""}`;
  const bidsCount = order?.bidsCount != null ? Number(order.bidsCount) : null;
  const bidUsers = Array.isArray(order?.bidUsers) ? order.bidUsers : [];

  const isClientOrder = order?.sourceType === "client_created";
  const showClaimsButton =
    isClientOrder &&
    order?.projectType === "fixed" &&
    (order?.orderStatus === "published" || order?.orderStatus === "open_for_freelancers") &&
    order?.isOpenForPool &&
    !orderHasAssignment(order) &&
    !order?.isArchived;

  const showBiddingOffersButton =
    isClientOrder &&
    pricedBidding &&
    order?.orderStatus === "open_for_bids" &&
    order?.isOpenForPool &&
    !orderHasAssignment(order) &&
    !order?.isArchived;

  const showPostAssignActions =
    isClientOrder &&
    orderHasAssignment(order) &&
    !order?.isArchived &&
    order?.orderStatus !== "completed" &&
    order?.orderStatus !== "cancelled";

  const showCompletedDeliveryArchive =
    isClientOrder &&
    order?.orderStatus === "completed" &&
    orderHasAssignment(order) &&
    !order?.isArchived;

  const displayOrder = detailOrder ? { ...order, ...detailOrder } : order;

  const shouldLoadSubmissionDetail =
    expanded &&
    isClientOrder &&
    orderHasAssignment(order) &&
    !order?.isArchived &&
    order?.orderStatus !== "cancelled";

  useEffect(() => {
    if (!shouldLoadSubmissionDetail) {
      if (!expanded) setDetailOrder(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getClientOrderByIdRequest(order.id);
        const next = res?.data?.order;
        if (!cancelled && next) setDetailOrder(next);
      } catch {
        /* ignore — timeline optional if endpoint unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldLoadSubmissionDetail, expanded, order.id]);

  const refetchDetailOrder = useCallback(async () => {
    try {
      const res = await getClientOrderByIdRequest(order.id);
      const next = res?.data?.order;
      if (next) setDetailOrder(next);
    } catch {
      /* ignore */
    }
  }, [order.id]);

  return (
    <article className="client-order-compact">
      <header className="client-order-compact__head">
        <div className="client-order-compact__title-block">
          <div className="client-order-compact__title">{order?.title || "—"}</div>
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
              ? order?.paymentAmount != null || order?.paymentCurrency
                ? `${order?.paymentAmount != null ? formatMoney(order.paymentAmount) : "—"} JOD`
                : `${formatMoney(order.bidBudgetMin)} – ${formatMoney(order.bidBudgetMax)} JOD`
              : order?.projectType === "bidding"
                ? "—"
                : `${formatMoney(order?.budget)} JOD`}
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
        {pricedBidding && bidUsers.length ? (
          <span className="oh-mini-chip">المتقدمون: {bidUsers.slice(0, 2).map((b) => bidderDisplayName(b)).join("، ")}{bidUsers.length > 2 ? ` +${bidUsers.length - 2}` : ""}</span>
        ) : null}
      </div>

      <p className="client-order-compact__desc">{expanded ? String(order?.description || "").trim() || "—" : shortText(order?.description, 200)}</p>

      {displayOrder?.clientRevisionNote ? (
        <p className="help" style={{ margin: "8px 0 0", padding: "10px 12px", background: "rgba(59, 130, 246, 0.08)", borderRadius: 10 }}>
          <strong>ملاحظة تعديل منك للمستقل:</strong> {displayOrder.clientRevisionNote}
        </p>
      ) : null}

      {expanded && displayOrder?.submissionHistory?.submissions?.length ? (
        <SubmissionHistoryTimeline submissionHistory={displayOrder.submissionHistory} orderId={String(order.id)} fileAccess="client" />
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
            عرض مقدمي العروض
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
        order={displayOrder}
        onClose={() => setDeliveryModal({ open: false, variant: "workflow" })}
        onApprove={() => {
          onOrdersChange?.();
          void refetchDetailOrder();
        }}
        onRevised={() => {
          onOrdersChange?.();
          void refetchDetailOrder();
        }}
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
