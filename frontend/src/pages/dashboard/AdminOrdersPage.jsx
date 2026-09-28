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
      push({ type: "error", title: t("ordersAdmin.listPage.toast.reloadFailed"), message: e?.response?.data?.message || e?.message });
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
        if (!cancelled) push({ type: "error", title: t("ordersAdmin.listPage.toast.loadFailed"), message: e?.response?.data?.message || e?.message });
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
        message: e?.response?.data?.message || e?.message || String(e?.message || ""),
      });
    } finally {
      setDeliveryOpeningId(null);
    }
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
      push({ type: "error", title: t("ordersAdmin.listPage.toast.bidApproveFailed"), message: e?.response?.data?.message || e?.message });
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
          <div className="card oh-internal-orders__table-card" style={{ overflowX: "auto" }}>
            <table className="oh-internal-orders__table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
              <thead>
                <tr>
                  {[
                    t("ordersAdmin.listPage.table.orderCode"),
                    t("ordersAdmin.listPage.table.title"),
                    t("ordersAdmin.listPage.table.scope"),
                    t("ordersAdmin.listPage.table.description"),
                    t("ordersAdmin.listPage.table.category"),
                    t("ordersAdmin.listPage.table.subSubcategory"),
                    t("ordersAdmin.listPage.table.extraCategories"),
                    t("ordersAdmin.listPage.table.type"),
                    t("ordersAdmin.listPage.table.budget"),
                    t("ordersAdmin.listPage.table.currency"),
                    t("ordersAdmin.listPage.table.duration"),
                    t("ordersAdmin.listPage.table.status"),
                    t("ordersAdmin.listPage.table.deliveryTiming"),
                    t("ordersAdmin.listPage.table.inPool"),
                    t("ordersAdmin.listPage.table.archived"),
                    "assignedFreelancerId",
                    "createdAt",
                    "files",
                    "skills",
                    t("ordersAdmin.listPage.table.actions"),
                  ].map((h) => (
                    <th key={h} style={{ textAlign: "right", padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.18)", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
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
                  const extra = Array.isArray(o.extraCategories)
                    ? o.extraCategories
                        .map((x) => `${x?.category?.name || "—"}${x?.subSubcategory?.name ? ` • ${x.subSubcategory.name}` : ""}`)
                        .join(" | ")
                    : "";
                  const files = Array.isArray(o.files) ? o.files.map((f) => f.originalName || f.filePath).filter(Boolean).join(" | ") : "";
                  const skills = Array.isArray(o.preferredSkills) ? o.preferredSkills.map((s) => s.name).filter(Boolean).join(" | ") : "";
                  const deliveryTiming = getOrderDeliveryTiming(o, t, locale);
                  return (
                    <tr key={o.id}>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.orderCode || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.title || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>
                        {o?.isInstitutionalOrder || o?.visibilityScope === "institution" ? (
                          <span title={[o.institutionalStorageName, ...(o.institutionalInstitutionNames || [])].filter(Boolean).join(" · ")}>
                            {t("ordersAdmin.listPage.card.institutionalOrder")}
                            {o.institutionalStoredOrderId ? ` (#${o.institutionalStoredOrderId})` : ""}
                          </span>
                        ) : (
                          t("ordersAdmin.listPage.table.scopeGeneral")
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)", maxWidth: 420 }}>{o.description || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.category?.name || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.subSubcategory?.name || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{extra || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.projectType || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.projectType === "bidding" ? "—" : (o.budget ?? "—")}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.projectType === "bidding" ? "—" : "JOD"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.durationValue ? `${o.durationValue} ${o.durationUnit || ""}` : "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{getOrderStatusLabel(o.orderStatus, t)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)", maxWidth: 360 }}>
                        {deliveryTiming ? (
                          <div style={{ display: "grid", gap: 6 }}>
                            <span>{deliveryTiming.message}</span>
                            {deliveryTiming.completionMessage ? (
                              <span style={{ fontSize: "0.88em", color: "var(--text-muted)" }}>{deliveryTiming.completionMessage}</span>
                            ) : null}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{String(Boolean(o.isOpenForPool))}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{String(Boolean(o.isArchived))}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.assignedFreelancerId || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.createdAt || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)", maxWidth: 420 }}>
                        {files || t("ordersAdmin.listPage.table.noFiles")}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)", maxWidth: 320 }}>{skills || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {tableShowClaims ? (
                            <span className="help">{t("ordersAdmin.listPage.table.applicants")}</span>
                          ) : null}
                          {tableShowBids ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ fontSize: "0.85rem", padding: "6px 10px" }}
                              onClick={() => {
                                setBidsModalOrderId(o.id);
                                void loadBids(o.id);
                              }}
                            >
                              {t("ordersAdmin.listPage.table.bids")}
                            </button>
                          ) : null}
                          {!tableShowClaims && !tableShowBids ? "—" : null}
                        </div>
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
              {bidsModalOrder.orderCode ? `${bidsModalOrder.orderCode} — ` : ""}
              {bidsModalOrder.title || "—"}
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
                    const statusLabel = status ? getOrderStatusLabel(status, t) : "";
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
            push({
              type: "success",
              title: t("ordersAdmin.listPage.toast.revisionSentTitle"),
              message: t("ordersAdmin.listPage.toast.revisionSentMessage"),
            });
            void reloadOrders();
          }}
        />
      ) : null}
    </>
  );
}

