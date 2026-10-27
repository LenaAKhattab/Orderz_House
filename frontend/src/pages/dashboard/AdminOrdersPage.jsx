import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ClientDeliveryReviewModal from "../../components/orders/ClientDeliveryReviewModal";
import OrderCard from "../../components/orders/OrderCard";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/toastContext";
import {
  adminApproveInternalPricedBidRequest,
  adminGetInternalOrderRequest,
  adminListInternalOrderBidsRequest,
  adminListInternalOrdersRequest,
} from "../../services/api";
import { INTERNAL_ORDERS_LIST_REFRESH } from "../../constants/authRoutes";
import { OrderCardsGridSkeleton } from "../../components/ui/Skeleton";
import { getOrderDeliveryTiming } from "../../utils/orderDeliveryTiming";
import { getOrderStatusLabel } from "../../utils/orderFlowUi";
import { formatOrderDuration, formatOrderProjectType } from "../../lib/orders/orderDisplayFormatters";
import { formatJoDate } from "../../components/orders/order-details/orderDetailsUtils";
import { JodMoneyDisplay } from "../../components/money/JodMoneyDisplay";
import "./adminOrdersTable.css";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/ordersAdminResources";
import { trackEvent } from "../../services/analytics";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { breadcrumbHomeFromUser } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardModal from "../../components/dashboard/DashboardModal";
import FileList from "../../components/orders/order-details/FileList";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { statusLabel as bidStatusLabel } from "../../i18n/statusRegistry.js";

function fullNameAr(f) {
  const parts = [f?.firstName, f?.fatherName, f?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

function ClaimsSkeleton() {
  return (
    <div aria-hidden style={{ display: "grid", gap: 8, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(56,82,180,0.10)" }}>
      <div className="oh-skel oh-skel-line" style={{ height: 12, width: "44%" }} />
      <div className="oh-skel oh-skel-line" style={{ height: 10, width: "92%" }} />
      <div className="oh-skel oh-skel-line" style={{ height: 10, width: "78%" }} />
    </div>
  );
}

/** Brief attachments (the order's own files, not deliveries or revision evidence). */
function briefFilesOf(o) {
  return (Array.isArray(o?.files) ? o.files : []).filter((f) => !f?.purpose || f.purpose === "brief");
}

function isPricedInternalBidding(o) {
  return o?.projectType === "bidding" && o?.bidBudgetMin != null && o?.bidBudgetMax != null;
}

export default function AdminOrdersPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const { t, locale } = useTranslation();
  const location = useLocation();
  const role = user?.primaryRole || user?.role;
  const createPath = role === "super_admin" ? "/dashboard/super-admin/orders/create" : "/dashboard/admin/orders/create";

  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);
  const [view, setView] = useState("cards"); // cards | table
  const [bidsModalOrderId, setBidsModalOrderId] = useState(null);
  const [bidsByOrderId, setBidsByOrderId] = useState({});
  const [bidsBusyByOrderId, setBidsBusyByOrderId] = useState({});
  const [approvingBidId, setApprovingBidId] = useState(null);
  const [deliveryModal, setDeliveryModal] = useState({ open: false, order: null, variant: "workflow" });
  const [deliveryOpeningId, setDeliveryOpeningId] = useState(null);
  const [attachmentsModal, setAttachmentsModal] = useState({ open: false, orderId: null, order: null, loading: false });

  const rows = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);

  const bidsModalOrder = useMemo(() => {
    if (bidsModalOrderId == null) return null;
    return rows.find((x) => String(x?.id) === String(bidsModalOrderId)) || null;
  }, [bidsModalOrderId, rows]);

  const bidsModalKey = bidsModalOrder ? String(bidsModalOrder.id) : "";
  const bidsModalList = bidsModalKey && Array.isArray(bidsByOrderId[bidsModalKey]) ? bidsByOrderId[bidsModalKey] : null;
  const bidsModalBusy = bidsModalKey ? Boolean(bidsBusyByOrderId[bidsModalKey]) : false;

  const reloadOrders = useCallback(async () => {
    try {
      const res = await adminListInternalOrdersRequest({ limit: 50, offset: 0 });
      const list = res?.data?.orders ?? res?.orders;
      setOrders(Array.isArray(list) ? list : []);
    } catch (e) {
      push({ type: "error", title: t("ordersAdmin.listPage.toast.reloadFailed"), message: getSafeApiErrorMessage(e) });
    }
  }, [push, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await adminListInternalOrdersRequest({ limit: 50, offset: 0 });
        const list = res?.data?.orders ?? res?.orders;
        if (!cancelled) setOrders(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) push({ type: "error", title: t("ordersAdmin.listPage.toast.loadFailed"), message: getSafeApiErrorMessage(e) });
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.key, push, t]);

  useEffect(() => {
    window.addEventListener(INTERNAL_ORDERS_LIST_REFRESH, reloadOrders);
    return () => window.removeEventListener(INTERNAL_ORDERS_LIST_REFRESH, reloadOrders);
  }, [reloadOrders]);

  useEffect(() => {
    if (bidsModalOrderId == null) return;
    if (!rows.some((x) => String(x?.id) === String(bidsModalOrderId))) setBidsModalOrderId(null);
  }, [bidsModalOrderId, rows]);

  useEffect(() => {
    if (!bidsModalOrder) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !approvingBidId) setBidsModalOrderId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bidsModalOrder, approvingBidId]);

  const loadBids = useCallback(async (orderId) => {
    const key = String(orderId);
    setBidsBusyByOrderId((p) => ({ ...p, [key]: true }));
    try {
      const res = await adminListInternalOrderBidsRequest(orderId);
      const bids = res?.data?.bids ?? res?.bids ?? [];
      setBidsByOrderId((p) => ({ ...p, [key]: Array.isArray(bids) ? bids : [] }));
    } catch {
      setBidsByOrderId((p) => ({ ...p, [key]: [] }));
    } finally {
      setBidsBusyByOrderId((p) => ({ ...p, [key]: false }));
    }
  }, []);

  // Claims are loaded on-demand (when opening the applicants modal) to avoid
  // flooding the backend with background requests and triggering timeouts.

  /** Orders list (incl. delivery timing on cards) updates without manual refresh. */
  useEffect(() => {
    if (busy) return undefined;
    async function tick() {
      try {
        const res = await adminListInternalOrdersRequest({ limit: 50, offset: 0 });
        setOrders(res?.data?.orders || []);
      } catch {
        /* ignore */
      }
    }
    const intervalId = setInterval(() => {
      void tick();
    }, 25_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [busy]);

  const openAdminDeliveryModal = async (orderId, variant) => {
    const key = String(orderId);
    setDeliveryOpeningId(key);
    try {
      const res = await adminGetInternalOrderRequest(orderId);
      const order = res?.data?.order ?? res?.order;
      if (!order) throw new Error(t("ordersAdmin.listPage.toast.orderLoadFailed"));
      setDeliveryModal({ open: true, order, variant });
    } catch (e) {
      push({
        type: "error",
        title: t("ordersAdmin.listPage.toast.deliveryOpenFailed"),
        message: getSafeApiErrorMessage(e),
      });
    } finally {
      setDeliveryOpeningId(null);
    }
  };

  // Brief attachments of an internal order (canonical FileList + admin download route).
  const openAttachments = async (orderId) => {
    setAttachmentsModal({ open: true, orderId: String(orderId), order: null, loading: true });
    try {
      const res = await adminGetInternalOrderRequest(orderId);
      const order = res?.data?.order ?? res?.order;
      if (!order) throw new Error(t("ordersAdmin.listPage.toast.orderLoadFailed"));
      setAttachmentsModal((m) => (m.orderId === String(orderId) ? { ...m, order, loading: false } : m));
    } catch (e) {
      setAttachmentsModal({ open: false, orderId: null, order: null, loading: false });
      push({
        type: "error",
        title: t("ordersAdmin.listPage.attachments.loadFailed"),
        message: getSafeApiErrorMessage(e, ""),
      });
    }
  };

  const attachmentsButton = (o) =>
    briefFilesOf(o).length ? (
      <button
        type="button"
        className="btn btn-secondary oh-admin-orders-table__btn"
        data-testid={`admin-order-attachments-${o.id}`}
        disabled={attachmentsModal.loading && attachmentsModal.orderId === String(o.id)}
        onClick={() => void openAttachments(o.id)}
      >
        {t("ordersAdmin.listPage.attachments.button", { count: briefFilesOf(o).length })}
      </button>
    ) : null;

  const deliveryButtons = (o) => {
    const receive =
      Boolean(o?.assignedFreelancerId) &&
      Boolean(o?.receivedAt) &&
      !o?.isArchived &&
      o?.orderStatus !== "completed" &&
      o?.orderStatus !== "cancelled";
    const archive = Boolean(o?.assignedFreelancerId) && !o?.isArchived && o?.orderStatus === "completed";
    if (!receive && !archive) return null;
    const opening = deliveryOpeningId === String(o.id);
    return (
      <button
        type="button"
        className="btn btn-primary oh-admin-orders-table__btn"
        disabled={opening}
        onClick={() => void openAdminDeliveryModal(o.id, receive ? "workflow" : "archive")}
      >
        {opening
          ? t("ordersAdmin.listPage.card.loading")
          : receive
            ? t("ordersAdmin.listPage.card.receiveOrder")
            : t("ordersAdmin.listPage.card.freelancerDeliveryFiles")}
      </button>
    );
  };

  const approveInternalBid = async ({ orderId, bidId }) => {
    setApprovingBidId(String(bidId));
    try {
      await adminApproveInternalPricedBidRequest(orderId, bidId);
      trackEvent("bid_approved", {
        order_id: String(orderId),
        bid_id: String(bidId),
        source: "admin_internal",
      });
      push({ type: "success", title: t("ordersAdmin.listPage.toast.bidApprovedTitle"), message: t("ordersAdmin.listPage.toast.bidApprovedMessage") });
      setBidsModalOrderId(null);
      await reloadOrders();
      await loadBids(orderId);
    } catch (e) {
      push({ type: "error", title: t("ordersAdmin.listPage.toast.bidApproveFailed"), message: getSafeApiErrorMessage(e) });
    } finally {
      setApprovingBidId(null);
    }
  };

  return (
    <>
      <DashboardShell className="oh-internal-orders">
        <DashboardPageHeader
          eyebrow={t("ordersAdmin.listPage.header.eyebrow")}
          title={t("ordersAdmin.listPage.header.title")}
          description={t("ordersAdmin.listPage.header.description")}
          breadcrumbs={[
            { label: t("ordersAdmin.listPage.header.breadcrumbHome"), href: breadcrumbHomeFromUser(user) },
            { label: t("ordersAdmin.listPage.header.breadcrumbOrders") },
          ]}
          actions={
            <>
              <button
                type="button"
                className={`btn btn-secondary ${view === "cards" ? "nav-link-active" : ""}`.trim()}
                onClick={() => setView("cards")}
              >
                {t("ordersAdmin.listPage.header.viewCards")}
              </button>
              <button
                type="button"
                className={`btn btn-secondary ${view === "table" ? "nav-link-active" : ""}`.trim()}
                onClick={() => setView("table")}
              >
                {t("ordersAdmin.listPage.header.viewTable")}
              </button>
              <Link className="btn btn-primary" to={createPath}>
                {t("ordersAdmin.listPage.header.createOrder")}
              </Link>
            </>
          }
        />

        <DashboardSection>
          <div className="oh-internal-orders__list" aria-busy={busy}>
            {busy ? (
              <DashboardLoadingState label={t("ordersAdmin.listPage.loading")}>
                <OrderCardsGridSkeleton count={4} />
              </DashboardLoadingState>
            ) : orders.length === 0 ? (
              <DashboardEmptyState
                className="oh-internal-orders__empty"
                title={t("ordersAdmin.listPage.empty.title")}
                description={t("ordersAdmin.listPage.empty.description")}
                descriptionClassName="oh-internal-orders__empty-desc"
                icon={
                  <span className="text-3xl" aria-hidden>
                    📦
                  </span>
                }
                actions={
                  <Link className="btn btn-primary" to={createPath}>
                    {t("ordersAdmin.listPage.empty.createFirst")}
                  </Link>
                }
              />
            ) : view === "cards" ? (
              rows.map((o) => {
            const pricedBidding = isPricedInternalBidding(o);
            const shouldShowApplicants =
              !pricedBidding &&
              String(o?.projectType || "") !== "fixed" &&
              Boolean(o?.isOpenForPool) &&
              !o?.assignedFreelancerId &&
              !o?.receivedAt &&
              !o?.isArchived;
            const shouldShowBidAward =
              pricedBidding &&
              String(o?.orderStatus || "") === "open_for_bids" &&
              Boolean(o?.isOpenForPool) &&
              !o?.assignedFreelancerId &&
              !o?.receivedAt &&
              !o?.isArchived;
            const orderKey = String(o?.id);
            const bids = Array.isArray(bidsByOrderId[orderKey]) ? bidsByOrderId[orderKey] : null;
            const bidsBusy = Boolean(bidsBusyByOrderId[orderKey]);
            const bidsCountSuffix = bids !== null && !bidsBusy ? ` (${bids.length})` : "";
            const showDeliveryReceive =
              Boolean(o?.assignedFreelancerId) &&
              Boolean(o?.receivedAt) &&
              !o?.isArchived &&
              o?.orderStatus !== "completed" &&
              o?.orderStatus !== "cancelled";
            const showDeliveryArchive =
              Boolean(o?.assignedFreelancerId) && !o?.isArchived && o?.orderStatus === "completed";
            return (
              <OrderCard
                key={o.id}
                order={o}
                showOrderCode
                compactSummary
                footerInline={
                  <>
                    {o?.isInstitutionalOrder || o?.visibilityScope === "institution" ? (
                      <span className="oh-mini-chip oh-mini-chip--emph" title={o.institutionalStorageName || ""}>
                        {t("ordersAdmin.listPage.card.institutionalOrder")}
                        {o.institutionalStorageName ? ` · ${o.institutionalStorageName}` : ""}
                      </span>
                    ) : null}
                    {attachmentsButton(o)}
                    {shouldShowApplicants ? (
                      <span className="help">{t("ordersAdmin.listPage.card.claimsNotForFixed")}</span>
                    ) : null}
                    {shouldShowBidAward ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setBidsModalOrderId(o.id);
                          void loadBids(o.id);
                        }}
                      >
                        {t("ordersAdmin.listPage.card.priceBids")}
                        {bidsCountSuffix}
                      </button>
                    ) : null}
                    {showDeliveryReceive ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={deliveryOpeningId === String(o.id)}
                        onClick={() => void openAdminDeliveryModal(o.id, "workflow")}
                      >
                        {deliveryOpeningId === String(o.id) ? t("ordersAdmin.listPage.card.loading") : t("ordersAdmin.listPage.card.receiveOrder")}
                      </button>
                    ) : null}
                    {showDeliveryArchive ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={deliveryOpeningId === String(o.id)}
                        onClick={() => void openAdminDeliveryModal(o.id, "archive")}
                      >
                        {deliveryOpeningId === String(o.id) ? t("ordersAdmin.listPage.card.loading") : t("ordersAdmin.listPage.card.freelancerDeliveryFiles")}
                      </button>
                    ) : null}
                  </>
                }
              />
            );
          })
        ) : (
          <div className="dash-ui-table-wrap oh-admin-orders-table">
            <table className="dash-ui-table w-full border-collapse text-[0.84rem]">
              <thead>
                <tr>
                  <th>{t("ordersAdmin.listPage.table.orderCode")}</th>
                  <th>{t("ordersAdmin.listPage.table.title")}</th>
                  <th>{t("ordersAdmin.listPage.table.type")}</th>
                  <th>{t("ordersAdmin.listPage.table.budget")}</th>
                  <th className="oh-admin-orders-table__col--md">{t("ordersAdmin.listPage.table.duration")}</th>
                  <th>{t("ordersAdmin.listPage.table.status")}</th>
                  <th className="oh-admin-orders-table__col--lg">{t("ordersAdmin.listPage.table.deliveryTiming")}</th>
                  <th className="oh-admin-orders-table__col--md">{t("ordersAdmin.listPage.table.created")}</th>
                  <th className="oh-admin-orders-table__col--actions">{t("ordersAdmin.listPage.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const pricedBidding = isPricedInternalBidding(o);
                  const tableShowClaims =
                    !pricedBidding &&
                    String(o?.projectType || "") !== "fixed" &&
                    Boolean(o?.isOpenForPool) &&
                    !o?.assignedFreelancerId &&
                    !o?.receivedAt &&
                    !o?.isArchived;
                  const tableShowBids =
                    pricedBidding &&
                    String(o?.orderStatus || "") === "open_for_bids" &&
                    Boolean(o?.isOpenForPool) &&
                    !o?.assignedFreelancerId &&
                    !o?.receivedAt &&
                    !o?.isArchived;
                  const filesCount = Array.isArray(o.files) ? o.files.length : 0;
                  const institutional = o?.isInstitutionalOrder || o?.visibilityScope === "institution";
                  const deliveryTiming = getOrderDeliveryTiming(o, t, locale);
                  return (
                    <tr key={o.id}>
                      <td className="oh-admin-orders-table__code" dir="ltr">{o.orderCode || "—"}</td>
                      <td className="oh-admin-orders-table__title">
                        <span className="oh-admin-orders-table__title-text" dir="auto" title={o.title || ""}>
                          {o.title || "—"}
                        </span>
                        <span className="oh-admin-orders-table__meta">
                          {[
                            o.category?.name,
                            institutional ? t("ordersAdmin.listPage.card.institutionalOrder") : null,
                            filesCount ? t("ordersAdmin.listPage.table.filesCount", { count: filesCount }) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </td>
                      <td>{formatOrderProjectType(o.projectType, t)}</td>
                      <td className="oh-admin-orders-table__money">
                        {pricedBidding ? (
                          <JodMoneyDisplay amount={o.bidBudgetMin} amountMax={o.bidBudgetMax} compact />
                        ) : o.projectType === "bidding" || o.budget == null ? (
                          "—"
                        ) : (
                          <JodMoneyDisplay amount={o.budget} compact />
                        )}
                      </td>
                      <td className="oh-admin-orders-table__col--md">{o.durationValue ? formatOrderDuration(o, locale, t) : "—"}</td>
                      <td>
                        <span className="oh-admin-orders-table__status">{getOrderStatusLabel(o.orderStatus, t)}</span>
                        {o.isArchived ? <span className="oh-mini-chip">{t("ordersAdmin.listPage.table.archived")}</span> : null}
                        {o.isOpenForPool && !o.isArchived ? (
                          <span className="oh-mini-chip oh-mini-chip--emph">{t("ordersAdmin.listPage.table.inPool")}</span>
                        ) : null}
                      </td>
                      <td className="oh-admin-orders-table__col--lg oh-admin-orders-table__timing">
                        {deliveryTiming ? deliveryTiming.message : "—"}
                      </td>
                      <td className="oh-admin-orders-table__col--md oh-admin-orders-table__date">{formatJoDate(o.createdAt)}</td>
                      <td className="oh-admin-orders-table__col--actions">
                        <span className="oh-admin-orders-table__actions">
                        {deliveryButtons(o)}
                        {attachmentsButton(o)}
                        {tableShowBids ? (
                          <button
                            type="button"
                            className="btn btn-secondary oh-admin-orders-table__btn"
                            onClick={() => {
                              setBidsModalOrderId(o.id);
                              void loadBids(o.id);
                            }}
                          >
                            {t("ordersAdmin.listPage.table.bids")}
                          </button>
                        ) : tableShowClaims ? (
                          <span className="oh-admin-orders-table__hint">{t("ordersAdmin.listPage.table.applicants")}</span>
                        ) : !deliveryButtons(o) && !attachmentsButton(o) ? (
                          "—"
                        ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
          </div>
        </DashboardSection>
      </DashboardShell>

      <DashboardModal
        open={Boolean(bidsModalOrder)}
        title={t("ordersAdmin.listPage.bidsModal.title")}
        className="dash-ui-modal--bids"
        onClose={() => {
          if (!approvingBidId) setBidsModalOrderId(null);
        }}
        footer={
          bidsModalOrder ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={bidsModalBusy || Boolean(approvingBidId)}
                onClick={() => loadBids(bidsModalOrder.id)}
              >
                {bidsModalBusy ? t("ordersAdmin.listPage.card.loading") : t("ordersAdmin.listPage.bidsModal.refresh")}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={Boolean(approvingBidId)}
                onClick={() => setBidsModalOrderId(null)}
              >
                {t("ordersAdmin.listPage.bidsModal.close")}
              </button>
            </>
          ) : null
        }
      >
        {bidsModalOrder ? (
          <>
            <p className="dash-ui-modal__lead">
              {bidsModalOrder.orderCode ? <span dir="ltr">{bidsModalOrder.orderCode} — </span> : null}
              <span dir="auto">{bidsModalOrder.title || "—"}</span>
            </p>
            <p className="dash-ui-modal__hint">{t("ordersAdmin.listPage.bidsModal.hint")}</p>

            {bidsModalList === null && bidsModalBusy ? <ClaimsSkeleton /> : null}

            {bidsModalList !== null ? (
              bidsModalBusy ? (
                <ClaimsSkeleton />
              ) : bidsModalList.length === 0 ? (
                <p className="dash-ui-modal__empty">{t("ordersAdmin.listPage.bidsModal.empty")}</p>
              ) : (
                <div className="admin-dash-modal__bid-list">
                  {bidsModalList.map((b) => {
                    const name = fullNameAr(b?.freelancer) || b?.freelancer?.email || `#${b?.freelancerUserId || ""}`;
                    const status = String(b?.status || "").trim();
                    const statusLabel = status ? bidStatusLabel(t, "bids", status) : "";
                    const canApprove = status === "pending";
                    const cur = bidsModalOrder.currencyCode || "JOD";
                    return (
                      <div key={String(b.id)} className="admin-dash-modal__bid-row">
                        <div className="admin-dash-modal__bid-copy">
                          <div className="admin-dash-modal__bid-name">{name}</div>
                          <p className="admin-dash-modal__bid-meta">
                            {b?.amount != null
                              ? t("ordersAdmin.listPage.bidsModal.amount", { amount: `${b.amount} ${cur}` })
                              : t("ordersAdmin.listPage.bidsModal.amount", { amount: "—" })}
                            {statusLabel ? ` • ${t("ordersAdmin.listPage.bidsModal.status", { status: statusLabel })}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!canApprove || approvingBidId === String(b.id)}
                          title={!canApprove ? t("ordersAdmin.listPage.bidsModal.cannotApprove") : ""}
                          onClick={() => approveInternalBid({ orderId: bidsModalOrder.id, bidId: b.id })}
                        >
                          {approvingBidId === String(b.id) ? t("ordersAdmin.listPage.bidsModal.approving") : t("ordersAdmin.listPage.bidsModal.approve")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            ) : null}
          </>
        ) : null}
      </DashboardModal>

      {deliveryModal.open && deliveryModal.order ? (
        <ClientDeliveryReviewModal
          key={String(deliveryModal.order.id)}
          open
          order={deliveryModal.order}
          variant={deliveryModal.variant}
          audience="admin"
          onClose={() => setDeliveryModal({ open: false, order: null, variant: "workflow" })}
          onApprove={() => {
            void reloadOrders();
          }}
          onRevised={() => {
            void reloadOrders();
          }}
        />
      ) : null}

      <DashboardModal
        open={attachmentsModal.open}
        title={t("ordersAdmin.listPage.attachments.title")}
        className="dash-ui-modal--attachments"
        onClose={() => setAttachmentsModal({ open: false, orderId: null, order: null, loading: false })}
      >
        {attachmentsModal.loading || !attachmentsModal.order ? (
          <p className="od-muted" role="status">
            {t("ordersAdmin.listPage.card.loading")}
          </p>
        ) : (
          <>
            {attachmentsModal.order.title ? (
              <p className="od-muted" dir="auto" style={{ marginTop: 0 }}>
                {attachmentsModal.order.title}
              </p>
            ) : null}
            <FileList
              files={briefFilesOf(attachmentsModal.order)}
              orderId={String(attachmentsModal.order.id)}
              fileAccess="admin"
              emptyText={t("ordersAdmin.listPage.attachments.empty")}
            />
          </>
        )}
      </DashboardModal>
    </>
  );
}

