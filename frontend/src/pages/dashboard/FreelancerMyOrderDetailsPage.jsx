import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../components/ui/toastContext";
import { getMyAssignedOrderByIdRequest, submitFreelancerOrderDeliveryRequest } from "../../services/api";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  formatOrderDuration,
  formatOrderProjectType,
  categoryLine,
} from "../../lib/orders/orderDisplayFormatters";
import {
  getLocalizedOrderDescription,
  getLocalizedOrderTitle,
  resolveUserContentDir,
} from "../../lib/i18n/getLocalizedMarketplaceOrderText";
import { getLocalizedField } from "../../lib/i18n/getLocalizedField";
import { OrderDetailsPageSkeleton } from "../../components/ui/Skeleton";
import OrderDeliveryTimingBanner from "../../components/orders/OrderDeliveryTimingBanner";
import "../../components/orders/order-details/order-details-page.css";
import OrderSummaryCard from "../../components/orders/order-details/OrderSummaryCard";
import OrderSection from "../../components/orders/order-details/OrderSection";
import OrderTitleCard from "../../components/orders/order-details/OrderTitleCard";
import OrderDescriptionCard from "../../components/orders/order-details/OrderDescriptionCard";
import OrderFilesCard from "../../components/orders/order-details/OrderFilesCard";
import OrderMetadataBlock from "../../components/orders/order-details/OrderMetadataBlock";
import FileList from "../../components/orders/order-details/FileList";
import SubmissionHistoryTimeline from "../../components/orders/submission-history/SubmissionHistoryTimeline";
import { formatJoDate, formatJoDateTime } from "../../components/orders/order-details/orderDetailsUtils";
import { JodMoneyDisplay } from "../../components/money/JodMoneyDisplay";
import { validateOrderFilesSize } from "../../utils/orderUploadLimits";
import OrderFilesPicker from "../../components/orders/OrderFilesPicker";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";

function typeLabel(projectType, t) {
  return formatOrderProjectType(projectType, t);
}

function revisionRequesterLabel(order, t) {
  if (order?.revisionRequestedBy === "admin") return t("freelancerDashboard.myOrders.details.revisionRequesterAdmin");
  if (order?.revisionRequestedBy === "client") return t("freelancerDashboard.myOrders.details.revisionRequesterClient");
  return order?.sourceType === "admin_created" || order?.sourceType === "super_admin_created"
    ? t("freelancerDashboard.myOrders.details.revisionRequesterAdmin")
    : t("freelancerDashboard.myOrders.details.revisionRequesterClient");
}

function revisionStatusLabel(order, t) {
  const s = String(order?.orderStatus || "");
  if (s === "pending_client_review") return t("freelancerDashboard.myOrders.details.revisionDelivered");
  if (s === "in_progress" || s === "ready_for_work") {
    return t("freelancerDashboard.myOrders.details.revisionInProgress");
  }
  return t("freelancerDashboard.myOrders.details.revisionPending");
}

const DELIVERY_UPLOAD_ALLOWED_STATUSES = new Set(["in_progress", "assigned", "ready_for_work"]);

export default function FreelancerMyOrderDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const { t, locale, dir } = useTranslation();

  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(true);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryFiles, setDeliveryFiles] = useState([]);
  const [deliveryNote, setDeliveryNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await getMyAssignedOrderByIdRequest(id);
        if (!cancelled) setOrder(res?.data?.order || null);
      } catch (e) {
        if (!cancelled) {
          push({
            type: "error",
            title: t("freelancerDashboard.myOrders.details.loadErrorTitle"),
            message: e?.response?.data?.message || e?.message,
          });
          navigate("/dashboard/freelancer/my-orders", { replace: true });
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, push, navigate, t]);

  // Poll while the order is active. Keyed on the status (not the order object): every pull replaces
  // `order`, and depending on it re-ran this effect immediately — a back-to-back request loop.
  const orderLoaded = Boolean(order);
  const pollStatus = String(order?.orderStatus || "");
  useEffect(() => {
    if (busy || !id || !orderLoaded) return undefined;
    if (pollStatus === "completed" || pollStatus === "cancelled") return undefined;

    let cancelled = false;
    async function pull() {
      try {
        const res = await getMyAssignedOrderByIdRequest(id);
        if (cancelled) return;
        const next = res?.data?.order;
        if (next) setOrder(next);
      } catch (e) {
        if (cancelled) return;
        if (e?.response?.status === 404) {
          navigate("/dashboard/freelancer/my-orders", { replace: true });
        }
      }
    }

    const intervalMs = 12_000;
    const timer = setInterval(() => {
      void pull();
    }, intervalMs);

    const onVis = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [busy, id, orderLoaded, pollStatus, navigate]);

  const briefFiles = useMemo(
    () => (Array.isArray(order?.files) ? order.files.filter((f) => !f.purpose || f.purpose === "brief") : []),
    [order?.files],
  );
  const submittedDeliveryFiles = useMemo(
    () => (Array.isArray(order?.files) ? order.files.filter((f) => f.purpose === "delivery") : []),
    [order?.files],
  );
  // Attachments of the latest revision request only (earlier cycles stay in the submission history).
  const requestAttachments = useMemo(() => {
    let latest = null;
    for (const sub of order?.submissionHistory?.submissions || []) {
      for (const r of sub?.revisionRequests || []) {
        if (!latest || new Date(r.createdAt || 0) > new Date(latest.createdAt || 0)) latest = r;
      }
    }
    if (latest) return Array.isArray(latest.files) ? latest.files : [];
    return Array.isArray(order?.files) ? order.files.filter((f) => f.purpose === "revision_request") : [];
  }, [order?.files, order?.submissionHistory]);
  const isResubmission = (order?.submissionHistory?.submissions?.length || 0) > 0;

  const orderPhaseLabel = useMemo(() => {
    const s = order?.orderStatus;
    if (order?.clientRevisionNote && (s === "in_progress" || s === "ready_for_work")) {
      return t("freelancerDashboard.myOrders.details.phaseRevisionInProgress");
    }
    if (s === "pending_client_review") return t("freelancerDashboard.myOrders.details.phasePendingClientApproval");
    if (s === "completed") return t("freelancerDashboard.myOrders.details.phaseCompleted");
    if (s === "in_progress") return t("freelancerDashboard.myOrders.details.phaseInProgressDeliver");
    return s || t("freelancerDashboard.common.emDash");
  }, [order?.orderStatus, order?.clientRevisionNote, t]);

  const deliveryFilesSizeOk = useMemo(
    () => (deliveryFiles.length ? validateOrderFilesSize(deliveryFiles).ok : true),
    [deliveryFiles],
  );

  const submitDelivery = async (e) => {
    e.preventDefault();
    if (!deliveryFiles.length) {
      push({
        type: "error",
        title: t("freelancerDashboard.myOrders.details.alertTitle"),
        message: t("freelancerDashboard.myOrders.details.selectFileRequired"),
      });
      return;
    }
    if (!validateOrderFilesSize(deliveryFiles).ok) {
      push({
        type: "error",
        title: t("freelancerDashboard.myOrders.details.fileSizeTitle"),
        message: t("freelancerDashboard.myOrders.details.uploadSizeError"),
      });
      return;
    }
    setDeliveryBusy(true);
    try {
      const fd = new FormData();
      for (const f of deliveryFiles) fd.append("files", f);
      if (deliveryNote.trim()) fd.append("note", deliveryNote.trim());
      const res = await submitFreelancerOrderDeliveryRequest(id, fd);
      const next = res?.data?.order ?? res?.order;
      if (next) setOrder(next);
      setDeliveryFiles([]);
      setDeliveryNote("");
      push({
        type: "success",
        title: t("freelancerDashboard.myOrders.details.deliverySuccessTitle"),
        message: t("freelancerDashboard.myOrders.details.deliverySuccessMessage"),
      });
    } catch (err) {
      push({
        type: "error",
        title: t("freelancerDashboard.myOrders.details.deliveryErrorTitle"),
        message: getSafeApiErrorMessage(err, t("freelancerDashboard.myOrders.details.deliveryErrorMessage")),
      });
    } finally {
      setDeliveryBusy(false);
    }
  };

  const categoryText = useMemo(
    () => categoryLine(order, locale) || t("freelancerDashboard.common.emDash"),
    [order, locale, t],
  );
  const localizedTitle = useMemo(() => getLocalizedOrderTitle(order, locale), [order, locale]);
  const localizedDescription = useMemo(() => getLocalizedOrderDescription(order, locale), [order, locale]);
  const descriptionDir = resolveUserContentDir(localizedDescription, dir);

  const typeAndBudgetValue = !order ? (
    t("freelancerDashboard.common.emDash")
  ) : order?.projectType === "bidding" ? (
    typeLabel(order?.projectType, t)
  ) : (
    <>
      {typeLabel(order?.projectType, t)} — <JodMoneyDisplay amount={order?.budget} compact />
    </>
  );

  const summaryRows = useMemo(() => {
    if (!order) return [];
    const receivedAt = order?.receivedAt || null;
    const rows = [
      { label: t("orders.details.deliveryTime"), value: formatOrderDuration(order, locale, t) },
      { label: t("orders.details.category"), value: categoryText },
      { label: t("orders.details.receivedAt"), value: formatJoDateTime(receivedAt) },
      { label: t("orders.details.executionStatus"), value: orderPhaseLabel },
    ];
    if (Array.isArray(order?.extraCategories) && order.extraCategories.length) {
      rows.push({
        label: t("orders.details.extraCategories"),
        value: order.extraCategories
          .map((x) => {
            const c = getLocalizedField(x?.category, "name", locale);
            const ss = getLocalizedField(x?.subSubcategory, "name", locale);
            return `${c || t("freelancerDashboard.common.emDash")}${ss ? ` • ${ss}` : ""}`;
          })
          .join(" | "),
      });
    }
    return rows;
  }, [order, categoryText, orderPhaseLabel, locale, t]);

  const skillsLine = useMemo(() => {
    if (!order) return t("orders.details.noPreferredSkills");
    const names = Array.isArray(order.preferredSkills) ? order.preferredSkills.map((s) => s.name).filter(Boolean) : [];
    return names.length ? names.join(locale === "en" ? ", " : "، ") : t("orders.details.noPreferredSkills");
  }, [order, locale, t]);

  return (
    <main className="container page-content dash-shell od-page od-page--pool od-page--pool-has-main" dir={dir}>
      <div className="od-pool-toolbar od-pool-toolbar--bare">
        <Link className="btn btn-secondary" to="/dashboard/freelancer/my-orders">
          {t("orders.details.backToMyOrders")}
        </Link>
      </div>

      <p className="od-pool-hint" style={{ margin: 0 }}>
        {t("orders.details.freelancerHub")}
      </p>

      {!busy && order ? <OrderDeliveryTimingBanner order={order} className="od-delivery-banner" /> : null}

      {busy ? (
        <OrderDetailsPageSkeleton />
      ) : order ? (
        <div className="od-pool-shell">
          <div className="od-pool-title">
            <div className="od-title-desc-group">
              <OrderTitleCard title={localizedTitle} />
              <div dir={descriptionDir}>
                <OrderDescriptionCard text={localizedDescription} />
              </div>
              <OrderDescriptionCard label={t("orders.details.skillsLabel")} text={skillsLine} />
            </div>
          </div>

          <div className="od-pool-summary">
            <div className="od-aside-col">
              <OrderSummaryCard
                title={t("orders.details.summaryTitle")}
                primaryBlock={{ label: t("orders.details.projectTypeBudget"), value: typeAndBudgetValue, dir: "ltr" }}
                rows={summaryRows}
              />
              <OrderFilesCard
                title={t("orders.details.attachmentsTitle")}
                orderId={String(id)}
                fileAccess="freelancer"
                files={briefFiles}
                emptyText={t("orders.details.noAttachments")}
              />
            </div>
          </div>

          <div className="od-pool-main">
            {order?.clientRevisionNote ? (
              <OrderSection title={t("freelancerDashboard.myOrders.details.revisionSectionTitle")} accent>
                <OrderMetadataBlock
                  rows={[
                    { label: t("freelancerDashboard.myOrders.details.requestedBy"), value: revisionRequesterLabel(order, t) },
                    { label: t("freelancerDashboard.myOrders.details.requestMessage"), value: order.clientRevisionNote },
                    {
                      label: t("freelancerDashboard.myOrders.details.requestDate"),
                      value: formatJoDate(order?.revisionRequestedAt || order?.updatedAt),
                    },
                    {
                      label: t("freelancerDashboard.myOrders.details.deadline"),
                      value: formatJoDate(order?.revisionDeadlineAt || order?.dueAt),
                    },
                    { label: t("freelancerDashboard.myOrders.details.status"), value: revisionStatusLabel(order, t) },
                  ]}
                />
                <div style={{ marginTop: "0.85rem" }}>
                  <p className="od-meta-label" style={{ marginBottom: "0.35rem" }}>
                    {t("freelancerDashboard.myOrders.details.linkedAttachments")}
                  </p>
                  <FileList
                    orderId={String(id)}
                    fileAccess="freelancer"
                    files={requestAttachments}
                    emptyText={t("freelancerDashboard.myOrders.details.noExtraAttachments")}
                  />
                </div>
              </OrderSection>
            ) : null}


            {DELIVERY_UPLOAD_ALLOWED_STATUSES.has(String(order?.orderStatus || "")) ? (
              <OrderSection title={t("freelancerDashboard.myOrders.details.deliverOrder")}>
                <p className="od-muted" style={{ marginTop: 0 }}>
                  {isResubmission
                    ? t("freelancerDashboard.myOrders.details.resubmitHint")
                    : t("freelancerDashboard.myOrders.details.deliveryHint")}{" "}
                  {t("freelancerDashboard.myOrders.details.uploadSizeHelper")}
                </p>
                <form onSubmit={submitDelivery}>
                  <div className="field">
                    <OrderFilesPicker
                      label={t("freelancerDashboard.myOrders.details.selectFiles")}
                      files={deliveryFiles}
                      onChange={setDeliveryFiles}
                      disabled={deliveryBusy}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="od-delivery-note">{t("freelancerDashboard.myOrders.details.deliveryNoteLabel")}</label>
                    <textarea
                      id="od-delivery-note"
                      className="od-delivery-note"
                      rows={3}
                      maxLength={4000}
                      dir="auto"
                      value={deliveryNote}
                      disabled={deliveryBusy}
                      placeholder={t("freelancerDashboard.myOrders.details.deliveryNotePlaceholder")}
                      onChange={(e) => setDeliveryNote(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary od-delivery-submit"
                    disabled={deliveryBusy || !deliveryFiles.length || !deliveryFilesSizeOk}
                  >
                    {deliveryBusy
                      ? t("freelancerDashboard.myOrders.details.submitting")
                      : isResubmission
                        ? t("freelancerDashboard.myOrders.details.resubmitDelivery")
                        : t("freelancerDashboard.myOrders.details.submitDelivery")}
                  </button>
                </form>
              </OrderSection>
            ) : null}

            {order?.orderStatus === "pending_client_review" ? (
              <OrderSection title={t("freelancerDashboard.myOrders.details.deliveryStatus")}>
                <p className="od-muted" style={{ margin: 0 }}>
                  {t("freelancerDashboard.myOrders.details.pendingReviewMessage")}
                </p>
              </OrderSection>
            ) : null}

            {/* History after the next action (delivery / review status), not before it. */}
            {order?.submissionHistory?.submissions?.length ? (
              <OrderSection title={t("freelancerDashboard.myOrders.details.submissionHistory")} accent>
                <SubmissionHistoryTimeline
                  hideTitle
                  submissionHistory={order.submissionHistory}
                  orderId={String(id)}
                  fileAccess="freelancer"
                />
              </OrderSection>
            ) : submittedDeliveryFiles.length ? (
              <OrderSection title={t("freelancerDashboard.myOrders.details.yourDelivery")}>
                <FileList
                  orderId={String(id)}
                  fileAccess="freelancer"
                  files={submittedDeliveryFiles}
                  emptyText={t("freelancerDashboard.common.emDash")}
                />
              </OrderSection>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
