import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, Clock3, PencilLine, CreditCard, Users, Archive } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/clientAreaResources";
import {
  formatOrderDuration,
  formatOrderProjectType,
  categoryLine,
} from "../../lib/orders/orderDisplayFormatters";
import {
  getLocalizedOrderTitle,
  resolveUserContentDir,
} from "../../lib/i18n/getLocalizedMarketplaceOrderText";
import { getOrderStatusLabel } from "../../utils/orderFlowUi";
import { getClientOrderNextStep } from "../../utils/clientOrderNextStep";
import ClientFreelancerClaimsModal from "./ClientFreelancerClaimsModal";
import ClientBiddingOffersModal from "./ClientBiddingOffersModal";
import ClientDeliveryReviewModal from "./ClientDeliveryReviewModal";
import ClientRevisionRequestModal from "./ClientRevisionRequestModal";
import ClientFreelancerReviewModal from "./ClientFreelancerReviewModal";
import SubmissionHistoryTimeline from "./submission-history/SubmissionHistoryTimeline";
import FileList from "./order-details/FileList";
import { formatJoDateTime } from "./order-details/orderDetailsUtils";
import { getClientOrderByIdRequest, getClientOrderReviewStatusRequest } from "../../services/api";
import { orderHasAssignment } from "../../utils/orderPrivacyUi";
import { JodMoneyDisplay } from "../money/JodMoneyDisplay";
import ClientFixedOrderPayNowButton from "./ClientFixedOrderPayNowButton";
import "./client-order-card.css";

function bidderDisplayName(bidUser) {
  if (bidUser?.displayName) return bidUser.displayName;
  const u = bidUser?.user || {};
  const full = [u.firstName, u.fatherName, u.familyName].filter(Boolean).join(" ").trim();
  return full || "—";
}

function clientStatusMeta(order, t) {
  if (order?.isArchived) return { label: t("orders.status.archived"), className: "oh-badge oh-badge--neutral" };
  const s = order?.orderStatus;
  if (s === "pending_client_review") return { label: t("orders.status.pending_client_review"), className: "oh-badge oh-badge--info" };
  if (s === "open_for_bids" || s === "open_for_freelancers") {
    return { label: t("orders.status.open_for_bids"), className: "oh-badge oh-badge--warning" };
  }
  if (s === "pending_payment") {
    return { label: getOrderStatusLabel(s, t), className: "oh-badge oh-badge--warning" };
  }
  if (s === "awaiting_payment_after_bid_selection") {
    return { label: t("orders.status.awaiting_payment_after_bid_selection"), className: "oh-badge oh-badge--info" };
  }
  if (s === "completed") return { label: t("orders.status.completed"), className: "oh-badge oh-badge--success" };
  if (s === "cancelled") return { label: t("orders.status.cancelled"), className: "oh-badge oh-badge--danger" };
  if (orderHasAssignment(order) && s === "in_progress") {
    return { label: t("orders.status.in_progress"), className: "oh-badge oh-badge--success" };
  }
  if (orderHasAssignment(order)) return { label: t("orders.status.assigned"), className: "oh-badge oh-badge--success" };
  if (s === "published") return { label: t("orders.status.available"), className: "oh-badge oh-badge--warning" };
  if (s === "assigned") return { label: t("orders.status.assigned"), className: "oh-badge oh-badge--success" };
  if (s === "in_progress") return { label: t("orders.status.in_progress"), className: "oh-badge oh-badge--info" };
  if (s === "draft") return { label: t("orders.status.draft"), className: "oh-badge oh-badge--neutral" };
  return { label: getOrderStatusLabel(s, t), className: "oh-badge oh-badge--neutral" };
}

function isPricedBidding(order) {
  return order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null;
}

const STEP_ICON = {
  pay: CreditCard,
  payAfterBid: CreditCard,
  reviewDelivery: CircleCheck,
  reviewBids: Users,
  revisionSent: PencilLine,
  completed: CircleCheck,
  cancelled: Archive,
  archived: Archive,
};

/**
 * بطاقة طلب العميل (قائمة «طلباتي»): الحالة، الخطوة التالية، والإجراء الأساسي — والتفاصيل عند التوسيع.
 */
export default function ClientOrderCardCompact({ order, onOrdersChange, initiallyExpanded = false, highlighted = false }) {
  const { t, locale, dir } = useTranslation();
  const oc = "clientArea.orderCard";
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [detailOrder, setDetailOrder] = useState(null);
  const [claimsOpen, setClaimsOpen] = useState(false);
  const [bidsOpen, setBidsOpen] = useState(false);
  const [deliveryModal, setDeliveryModal] = useState({ open: false, variant: "workflow" });
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState(null);
  const badge = useMemo(() => clientStatusMeta(order, t), [order, t]);
  const step = useMemo(() => getClientOrderNextStep(order), [order]);
  const pricedBidding = useMemo(() => isPricedBidding(order), [order]);
  const localizedTitle = getLocalizedOrderTitle(order, locale);
  const titleDir = resolveUserContentDir(localizedTitle, dir);
  const allFiles = Array.isArray(order?.files) ? order.files : [];
  const briefFiles = allFiles.filter((f) => f?.purpose !== "delivery" && f?.purpose !== "revision_request");
  const deliveryFilesCount = allFiles.filter((f) => f?.purpose === "delivery").length;
  const categoryText = categoryLine(order, locale);
  const bidUsers = Array.isArray(order?.bidUsers) ? order.bidUsers : [];
  const description = String(order?.description || "").trim();

  const isClientOrder = order?.sourceType === "client_created";
  const isActive = !order?.isArchived && order?.orderStatus !== "completed" && order?.orderStatus !== "cancelled";
  const showClaimsButton =
    isClientOrder &&
    order?.projectType !== "fixed" &&
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

  const assignedActive = isClientOrder && orderHasAssignment(order) && isActive;
  const deliveryWaiting = assignedActive && order?.orderStatus === "pending_client_review";
  // The API only accepts a revision request once a delivery exists (pending review, or after a previous revision).
  const canRequestRevision = assignedActive && (deliveryWaiting || deliveryFilesCount > 0);

  const showCompletedDeliveryArchive =
    isClientOrder && order?.orderStatus === "completed" && orderHasAssignment(order) && !order?.isArchived;

  const showReviewAction = showCompletedDeliveryArchive;

  const displayOrder = detailOrder ? { ...order, ...detailOrder } : order;

  useEffect(() => {
    if (!showReviewAction || !order?.id) {
      queueMicrotask(() => setReviewStatus(null));
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getClientOrderReviewStatusRequest(order.id);
        if (!cancelled) setReviewStatus(res?.data ?? res);
      } catch {
        if (!cancelled) setReviewStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showReviewAction, order?.id]);

  const needsSubmissionDetail = isClientOrder && orderHasAssignment(order) && !order?.isArchived && order?.orderStatus !== "cancelled";
  const shouldLoadSubmissionDetail = (expanded || deliveryModal.open) && needsSubmissionDetail;

  useEffect(() => {
    if (!shouldLoadSubmissionDetail) {
      if (!expanded) queueMicrotask(() => setDetailOrder(null));
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

  const StepIcon = STEP_ICON[step.key] || (step.attention ? CircleAlert : Clock3);
  const detailsId = `client-order-${order?.id}-details`;

  // Primary = what unblocks the order; secondary = alternatives; details toggle is always tertiary.
  const primary = [];
  const secondary = [];
  if (deliveryWaiting) {
    primary.push(
      <button key="review" type="button" className="btn btn-primary" onClick={() => setDeliveryModal({ open: true, variant: "workflow" })}>
        {t(`${oc}.reviewDelivery`)}
      </button>,
    );
  }
  if (showBiddingOffersButton) {
    primary.push(
      <button key="bids" type="button" className={step.attention ? "btn btn-primary" : "btn btn-secondary"} onClick={() => setBidsOpen(true)}>
        {t(`${oc}.viewBidOffers`)}
      </button>,
    );
  }
  if (showClaimsButton) {
    primary.push(
      <button key="claims" type="button" className="btn btn-primary" onClick={() => setClaimsOpen(true)}>
        {t(`${oc}.reviewFreelancerClaims`)}
      </button>,
    );
  }
  if (canRequestRevision) {
    secondary.push(
      <button key="revision" type="button" className="btn btn-secondary" onClick={() => setRevisionOpen(true)}>
        {t(`${oc}.requestRevision`)}
      </button>,
    );
  }
  if (showCompletedDeliveryArchive) {
    secondary.push(
      <button key="delivery-files" type="button" className="btn btn-secondary" onClick={() => setDeliveryModal({ open: true, variant: "archive" })}>
        {t(`${oc}.freelancerDeliveryFiles`)}
      </button>,
    );
  }
  if (showReviewAction && reviewStatus?.canSubmit) {
    primary.push(
      <button key="rate" type="button" className="btn btn-primary" onClick={() => setReviewOpen(true)}>
        {t(`${oc}.rateFreelancer`)}
      </button>,
    );
  }
  if (showReviewAction && reviewStatus?.existingReview) {
    secondary.push(
      <button key="my-review" type="button" className="btn btn-secondary" onClick={() => setReviewOpen(true)}>
        {reviewStatus.existingReview.canEdit ? t(`${oc}.editReview`) : t(`${oc}.viewReview`)}
      </button>,
    );
  }

  return (
    <article
      id={`client-order-${order?.id}`}
      className={`client-order-compact coc coc--${step.tone}${step.attention ? " coc--attention" : ""}${highlighted ? " coc--highlighted" : ""}`}
    >
      <header className="coc__head">
        <div className="coc__title-block">
          <h3 className="coc__title" dir={titleDir}>
            {localizedTitle}
          </h3>
          <p className="coc__meta">
            <span>{formatOrderProjectType(order?.projectType, t)}</span>
            {categoryText ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{categoryText}</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span className="coc__price">
              {pricedBidding ? (
                order?.paymentAmount != null || order?.paymentCurrency ? (
                  <JodMoneyDisplay amount={order?.paymentAmount} compact />
                ) : (
                  <JodMoneyDisplay amount={order.bidBudgetMin} amountMax={order.bidBudgetMax} compact />
                )
              ) : order?.projectType === "bidding" ? (
                "—"
              ) : (
                <JodMoneyDisplay amount={order?.budget} compact />
              )}
            </span>
            <span aria-hidden="true">·</span>
            <span>{t("orders.card.deliveryDuration")}: {formatOrderDuration(order, locale, t)}</span>
          </p>
        </div>
        <span className={`coc__badge ${badge.className}`}>{badge.label}</span>
      </header>

      <div className={`coc__next coc__next--${step.tone}`}>
        <StepIcon className="coc__next-icon" aria-hidden="true" />
        <p className="coc__next-text">{t(`${oc}.next.${step.key}`, step.params || {})}</p>
      </div>

      {!expanded && description ? (
        <p className="coc__excerpt" dir="auto">
          {description}
        </p>
      ) : null}

      {expanded ? (
        <div className="coc__details" id={detailsId}>
          <section className="coc__section">
            <h4 className="coc__section-title">{t(`${oc}.sections.description`)}</h4>
            <p className="coc__desc" dir="auto">
              {description || t("orders.marketplace.card.noDescription")}
            </p>
          </section>
          <div className="coc__facts">
            <div className="coc__fact">
              <span className="coc__fact-label">{t(`${oc}.facts.created`)}</span>
              <span className="coc__fact-value">{formatJoDateTime(order?.createdAt)}</span>
            </div>
            {order?.receivedAt ? (
              <div className="coc__fact">
                <span className="coc__fact-label">{t(`${oc}.facts.started`)}</span>
                <span className="coc__fact-value">{formatJoDateTime(order.receivedAt)}</span>
              </div>
            ) : null}
            {pricedBidding && !orderHasAssignment(order) ? (
              <div className="coc__fact">
                <span className="coc__fact-label">{t(`${oc}.bidsLabel`).replace(/[:：]\s*$/, "")}</span>
                <span className="coc__fact-value">{Number(order?.bidsCount) || 0}</span>
              </div>
            ) : null}
            {pricedBidding && !orderHasAssignment(order) && bidUsers.length ? (
              <div className="coc__fact">
                <span className="coc__fact-label">{t(`${oc}.applicantsLabel`).replace(/[:：]\s*$/, "")}</span>
                <span className="coc__fact-value">
                  {bidUsers.slice(0, 2).map((b) => bidderDisplayName(b)).join(locale === "ar" ? "، " : ", ")}
                  {bidUsers.length > 2 ? ` +${bidUsers.length - 2}` : ""}
                </span>
              </div>
            ) : null}
          </div>
          <section className="coc__section">
            <h4 className="coc__section-title">{t(`${oc}.sections.attachments`, { count: briefFiles.length })}</h4>
            <FileList files={briefFiles} orderId={String(order.id)} fileAccess="client" emptyText={t(`${oc}.noAttachments`)} />
          </section>
          {displayOrder?.clientRevisionNote && isActive ? (
            <section className="coc__section">
              <h4 className="coc__section-title">{t(`${oc}.revisionNotePrefix`)}</h4>
              <p className="coc__revision-note" dir="auto">
                {displayOrder.clientRevisionNote}
              </p>
            </section>
          ) : null}
          {displayOrder?.submissionHistory?.submissions?.length ? (
            <section className="coc__section">
              <h4 className="coc__section-title">{t("ordersAdmin.orderDetails.submissionHistory.title")}</h4>
              <SubmissionHistoryTimeline submissionHistory={displayOrder.submissionHistory} orderId={String(order.id)} fileAccess="client" hideTitle />
            </section>
          ) : null}
        </div>
      ) : null}

      <footer className="coc__foot">
        <ClientFixedOrderPayNowButton order={order} />
        {primary}
        {secondary}
        <button
          type="button"
          className="coc__toggle"
          aria-expanded={expanded}
          aria-controls={expanded ? detailsId : undefined}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t(`${oc}.hideDetails`) : t(`${oc}.showDetails`)}
          <ChevronDown className={`coc__toggle-icon${expanded ? " is-open" : ""}`} aria-hidden="true" />
        </button>
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
        orderTitle={localizedTitle}
        onClose={() => setRevisionOpen(false)}
        onSaved={() => {
          onOrdersChange?.();
          void refetchDetailOrder();
        }}
      />
      <ClientFreelancerReviewModal
        open={reviewOpen}
        orderId={order?.id}
        orderTitle={order?.title}
        onClose={() => setReviewOpen(false)}
        onSubmitted={() => {
          onOrdersChange?.();
          void getClientOrderReviewStatusRequest(order.id).then((res) => setReviewStatus(res?.data ?? res));
        }}
      />
    </article>
  );
}
