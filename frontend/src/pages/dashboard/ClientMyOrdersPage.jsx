import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ClipboardList, Inbox, RefreshCw } from "lucide-react";
import { useClientCreateOrderModal } from "../../context/ClientCreateOrderModalContext";
import { useToast } from "../../components/ui/toastContext";
import {
  cancelClientFixedOrderPaymentRequest,
  confirmClientFixedOrderPaidRequest,
  confirmClientOrderBidPaidRequest,
  listClientMyOrdersRequest,
} from "../../services/api";
import ClientOrderCardCompact from "../../components/orders/ClientOrderCardCompact";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import HubMetricSkeleton from "../../components/dashboard/hub/HubMetricSkeleton";
import { OrderCardsGridSkeleton } from "../../components/ui/Skeleton";
import {
  getBidCheckoutCancelledToast,
  getBidPaymentConfirmFailureToast,
  getFixedCheckoutCancelledToast,
  getFixedPaymentConfirmFailureToast,
  parseConfirmPaymentAxiosError,
} from "../../utils/clientMyOrdersPaymentReturn";
import { orderHasAssignment } from "../../utils/orderPrivacyUi";
import { trackEvent } from "../../services/analytics";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/clientAreaResources";
import "../../styles/dashboardHub.css";
import "./freelancerMyOrders.css";

function StatSegment({ tone, label, value, loading }) {
  return (
    <div className={`fmo-stat-segment fmo-stat-segment--${tone}`}>
      <span className="fmo-stat-segment__icon" aria-hidden>
        <ClipboardList size={18} strokeWidth={2} />
      </span>
      <div className="fmo-stat-segment__copy">
        {loading ? <HubMetricSkeleton variant="stat" /> : <strong className="fmo-stat-segment__value">{value}</strong>}
        <span className="fmo-stat-segment__label">{label}</span>
      </div>
    </div>
  );
}

export default function ClientMyOrdersPage() {
  const { push } = useToast();
  const { t, locale } = useTranslation();
  const m = "clientArea.myOrders";
  const isArabicUi = locale === "ar";
  const location = useLocation();
  const navigate = useNavigate();
  const { openModal: openCreateOrder } = useClientCreateOrderModal();
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await listClientMyOrdersRequest({ limit: 50, offset: 0 });
    const list = res?.data?.orders ?? res?.orders;
    setOrders(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        await load();
      } catch (e) {
        if (!cancelled) {
          const status = e?.response?.status;
          const msg =
            status === 403
              ? t(`${m}.loadForbidden`)
              : e?.response?.data?.message || e?.message;
          push({ type: "error", title: t(`${m}.loadErrorTitle`), message: msg });
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, push, t]);

  const loadSilent = useCallback(async () => {
    try {
      await load();
    } catch {
      // ignore background poll errors
    }
  }, [load]);

  /** Stripe success/cancel return URLs: fixed-order vs bid-selection are handled separately (bid errors never run fixed pay-cancel). */
  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const paid = params.get("paid");
    const cancelled = params.get("cancelled");
    const orderId = params.get("orderId");
    const bidId = params.get("bidId");
    if (paid === "1") {
      (async () => {
        try {
          if (orderId && bidId) {
            await confirmClientOrderBidPaidRequest(orderId, bidId);
            trackEvent("bid_approved", {
              order_id: String(orderId),
              bid_id: String(bidId),
              source: "client_paid_selection",
            });
            push({
              type: "success",
              title: t(`${m}.paymentSuccessTitle`),
              message: t(`${m}.paymentSuccessBid`),
            });
          } else if (orderId) {
            await confirmClientFixedOrderPaidRequest(orderId);
            push({
              type: "success",
              title: t(`${m}.paymentSuccessTitle`),
              message: t(`${m}.paymentSuccessFixed`),
            });
          }
        } catch (e) {
          if (orderId && bidId) {
            const toast = getBidPaymentConfirmFailureToast(isArabicUi, parseConfirmPaymentAxiosError(e));
            push({ type: "error", title: toast.title, message: toast.message });
          } else if (orderId) {
            try {
              await cancelClientFixedOrderPaymentRequest(orderId);
            } catch {
              // best-effort cleanup — fixed-order unpaid draft only
            }
            const toast = getFixedPaymentConfirmFailureToast(isArabicUi);
            push({ type: "error", title: toast.title, message: toast.message });
          }
        } finally {
          navigate(location.pathname, { replace: true });
          void loadSilent();
        }
      })();
    } else if (cancelled === "1") {
      (async () => {
        if (orderId && !bidId) {
          try {
            await cancelClientFixedOrderPaymentRequest(orderId);
          } catch {
            // best-effort cleanup
          }
        }
        if (orderId && bidId) {
          const toast = getBidCheckoutCancelledToast(isArabicUi);
          push({ type: "error", title: toast.title, message: toast.message });
        } else {
          const toast = getFixedCheckoutCancelledToast(isArabicUi);
          push({ type: "error", title: toast.title, message: toast.message });
        }
        navigate(location.pathname, { replace: true });
      })();
    }
  }, [isArabicUi, location.pathname, location.search, loadSilent, navigate, push, t]);

  useEffect(() => {
    if (busy) return undefined;
    const timer = setInterval(() => {
      void loadSilent();
    }, 20_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void loadSilent();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [busy, loadSilent]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      const status = e?.response?.status;
      const msg =
        status === 403
          ? t(`${m}.refreshForbidden`)
          : e?.response?.data?.message || e?.message;
      push({ type: "error", title: t(`${m}.refreshErrorTitle`), message: msg });
    } finally {
      setRefreshing(false);
    }
  };

  const stats = useMemo(() => {
    const total = orders.length;
    const inPool = orders.filter((o) => {
      if (!o || o?.isArchived || orderHasAssignment(o) || !o?.isOpenForPool) return false;
      const status = String(o?.orderStatus || "");
      if (o?.projectType === "fixed") return status === "published" || status === "open_for_freelancers";
      if (o?.projectType === "bidding") return status === "open_for_bids";
      return ["published", "open_for_freelancers", "open_for_bids"].includes(status);
    }).length;
    const assigned = orders.filter((o) => orderHasAssignment(o)).length;
    return { total, inPool, assigned };
  }, [orders]);

  return (
    <DashboardHubPage className="fdash-page--my-orders">
      <header className="fmo-surface fmo-header">
        <div className="fmo-header__copy">
          <h1 className="fmo-header__title">{t(`${m}.title`)}</h1>
          <p className="fmo-header__subtitle">{t(`${m}.subtitle`)}</p>
          <div className="fmo-header__actions">
            <button type="button" className="fmo-empty__cta" style={{ border: "none", cursor: "pointer" }} onClick={() => openCreateOrder()}>
              {t(`${m}.newOrder`)}
            </button>
            <Link className="fmo-toolbar__refresh fmo-toolbar__refresh--label" to="/dashboard/freelancer/orders">
              {t(`${m}.exploreMarketplace`)}
            </Link>
          </div>
        </div>
        <div className="fmo-header__art" aria-hidden>
          <span className="fmo-header__icon-chip">
            <ClipboardList size={32} strokeWidth={1.85} />
          </span>
        </div>
      </header>

      <div className="fmo-surface fmo-stats-bar" aria-label={t(`${m}.statsAria`)}>
        <StatSegment tone="slate" label={t(`${m}.statsTotal`)} value={stats.total} loading={busy} />
        <StatSegment tone="amber" label={t(`${m}.statsInPool`)} value={stats.inPool} loading={busy} />
        <StatSegment tone="green" label={t(`${m}.statsAssigned`)} value={stats.assigned} loading={busy} />
      </div>

      <div className="fmo-surface fmo-toolbar">
        <p className="fmo-toolbar__hint">{t(`${m}.toolbarHint`)}</p>
        <div className="fmo-toolbar__actions">
          <button
            type="button"
            className={`fmo-toolbar__refresh fmo-toolbar__refresh--label${refreshing || busy ? " is-spinning" : ""}`}
            onClick={onRefresh}
            disabled={refreshing || busy}
            aria-label={t(`${m}.refreshList`)}
            title={t(`${m}.refreshList`)}
          >
            <RefreshCw size={17} strokeWidth={2.2} aria-hidden />
            <span className="fmo-toolbar__refresh-label">{t(`${m}.refreshList`)}</span>
          </button>
        </div>
      </div>

      <section className="fmo-surface fmo-content fmo-content--client-cards" aria-busy={busy} aria-label={t(`${m}.ordersListAria`)}>
        {busy ? (
          <OrderCardsGridSkeleton count={3} />
        ) : orders.length === 0 ? (
          <div className="fmo-empty">
            <span className="fmo-empty__icon-chip" aria-hidden>
              <Inbox size={36} strokeWidth={1.6} />
            </span>
            <h3 className="fmo-empty__title">{t(`${m}.emptyTitle`)}</h3>
            <p className="fmo-empty__sub">{t(`${m}.emptySub`)}</p>
            <div className="fmo-empty__actions">
              <button type="button" className="fmo-empty__cta" onClick={() => openCreateOrder()}>
                {t(`${m}.createOrder`)}
              </button>
              <Link className="fmo-empty__cta fmo-empty__cta--muted" to="/dashboard/freelancer/orders">
                {t(`${m}.browseMarketplace`)}
              </Link>
            </div>
          </div>
        ) : (
          <div className="fmo-client-cards-grid">
            {orders.map((order) => (
              <ClientOrderCardCompact key={order.id} order={order} onOrdersChange={load} />
            ))}
          </div>
        )}
      </section>
    </DashboardHubPage>
  );
}
