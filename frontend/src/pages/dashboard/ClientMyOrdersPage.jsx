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
  const location = useLocation();
  const navigate = useNavigate();
  const { openModal: openCreateOrder } = useClientCreateOrderModal();
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isArabicUi = useMemo(() => {
    if (typeof document === "undefined") return true;
    const lang = String(document.documentElement?.lang || "").toLowerCase();
    const dir = String(document.documentElement?.dir || "").toLowerCase();
    return lang.startsWith("ar") || dir === "rtl";
  }, []);

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
              ? "لا صلاحية لعرض طلبات العميل (تحقق من ربط الأدوار في الحساب). إن استمرّت المشكلة، أعد تسجيل الدخول."
              : e?.response?.data?.message || e?.message;
          push({ type: "error", title: "تعذر تحميل طلباتك", message: msg });
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, push]);

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
              title: isArabicUi ? "تم الدفع بنجاح" : "Payment successful",
              message: isArabicUi
                ? "تم تأكيد دفع العرض وربطه بالطلب."
                : "Bid payment was confirmed successfully.",
            });
          } else if (orderId) {
            await confirmClientFixedOrderPaidRequest(orderId);
            push({
              type: "success",
              title: isArabicUi ? "تم الدفع بنجاح" : "Payment successful",
              message: isArabicUi
                ? "تم إنشاء/تفعيل الطلب وإتاحته بحسب نوعه."
                : "Your order was activated according to its type.",
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
  }, [isArabicUi, location.pathname, location.search, loadSilent, navigate, push]);

  useEffect(() => {
    if (busy) return undefined;
    const t = setInterval(() => {
      void loadSilent();
    }, 20_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void loadSilent();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
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
          ? "لا صلاحية لتحديث القائمة. تحقق من أن حسابك مسجّل كعميل أو أعد تسجيل الدخول."
          : e?.response?.data?.message || e?.message;
      push({ type: "error", title: "تعذر التحديث", message: msg });
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
          <h1 className="fmo-header__title">طلباتي</h1>
          <p className="fmo-header__subtitle">
            تتبّع طلباتك، حالة الدفع، واستقبال العروض للمزايدة، ثم اختيار العرض والدفع لبدء التنفيذ.
          </p>
          <div className="fmo-header__actions">
            <button type="button" className="fmo-empty__cta" style={{ border: "none", cursor: "pointer" }} onClick={() => openCreateOrder()}>
              + طلب جديد
            </button>
            <Link className="fmo-toolbar__refresh fmo-toolbar__refresh--label" to="/dashboard/freelancer/orders">
              استكشاف المعرض
            </Link>
          </div>
        </div>
        <div className="fmo-header__art" aria-hidden>
          <span className="fmo-header__icon-chip">
            <ClipboardList size={32} strokeWidth={1.85} />
          </span>
        </div>
      </header>

      <div className="fmo-surface fmo-stats-bar" aria-label="ملخص الطلبات">
        <StatSegment tone="slate" label="إجمالي الطلبات" value={stats.total} loading={busy} />
        <StatSegment tone="amber" label="في المعرض" value={stats.inPool} loading={busy} />
        <StatSegment tone="green" label="مُسندة" value={stats.assigned} loading={busy} />
      </div>

      <div className="fmo-surface fmo-toolbar">
        <p className="fmo-toolbar__hint">القائمة مرتبة من الأحدث إلى الأقدم. يمكنك التحديث دورياً لمزامنة الحالة.</p>
        <div className="fmo-toolbar__actions">
          <button
            type="button"
            className={`fmo-toolbar__refresh fmo-toolbar__refresh--label${refreshing || busy ? " is-spinning" : ""}`}
            onClick={onRefresh}
            disabled={refreshing || busy}
            aria-label="تحديث القائمة"
            title="تحديث القائمة"
          >
            <RefreshCw size={17} strokeWidth={2.2} aria-hidden />
            <span className="fmo-toolbar__refresh-label">تحديث القائمة</span>
          </button>
        </div>
      </div>

      <section className="fmo-surface fmo-content fmo-content--client-cards" aria-busy={busy} aria-label="قائمة الطلبات">
        {busy ? (
          <OrderCardsGridSkeleton count={3} />
        ) : orders.length === 0 ? (
          <div className="fmo-empty">
            <span className="fmo-empty__icon-chip" aria-hidden>
              <Inbox size={36} strokeWidth={1.6} />
            </span>
            <h3 className="fmo-empty__title">لا توجد طلبات بعد</h3>
            <p className="fmo-empty__sub">أنشئ أول طلب ليظهر هنا مع حالته وتفاصيله.</p>
            <div className="fmo-empty__actions">
              <button type="button" className="fmo-empty__cta" onClick={() => openCreateOrder()}>
                إنشاء طلب
              </button>
              <Link className="fmo-empty__cta fmo-empty__cta--muted" to="/dashboard/freelancer/orders">
                تصفّح المعرض
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
