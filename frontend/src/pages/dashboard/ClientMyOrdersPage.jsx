import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useClientCreateOrderModal } from "../../context/ClientCreateOrderModalContext";
import { useToast } from "../../components/ui/toastContext";
import {
  cancelClientFixedOrderPaymentRequest,
  confirmClientFixedOrderPaidRequest,
  confirmClientOrderBidPaidRequest,
  listClientMyOrdersRequest,
} from "../../services/api";
import ClientOrderCardCompact from "../../components/orders/ClientOrderCardCompact";
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
    <div className="container page-content dash-shell client-my-orders-page" dir="rtl">
      <div className="dash client-my-orders-page__root">
        <header className="dash-hero dash-hero--elevated">
          <div className="dash-hero__copy">
            <p className="dash-hero__kicker">لوحة العميل</p>
            <h1 className="dash-hero__title oh-orders-sidebar-title">طلباتي</h1>
            <p className="dash-hero__subtitle">
              تتبّع طلباتك، حالة الدفع، واستقبال العروض للمزايدة، ثم اختيار العرض والدفع لبدء التنفيذ.
            </p>
            <div className="client-my-orders-page__hero-actions">
              <button type="button" className="btn btn-primary" onClick={() => openCreateOrder()}>
                + طلب جديد
              </button>
              <Link to="/orders" className="btn btn-secondary">
                استكشاف المعرض
              </Link>
            </div>
          </div>
        </header>

        <div className="client-my-orders-page__stats" aria-label="ملخص الطلبات">
          <div className="client-my-orders-page__stat">
            <span className="client-my-orders-page__stat-label">إجمالي الطلبات</span>
            <strong className="client-my-orders-page__stat-value">{busy ? "—" : stats.total}</strong>
          </div>
          <div className="client-my-orders-page__stat client-my-orders-page__stat--accent">
            <span className="client-my-orders-page__stat-label">في المعرض</span>
            <strong className="client-my-orders-page__stat-value">{busy ? "—" : stats.inPool}</strong>
          </div>
          <div className="client-my-orders-page__stat client-my-orders-page__stat--muted">
            <span className="client-my-orders-page__stat-label">مُسندة</span>
            <strong className="client-my-orders-page__stat-value">{busy ? "—" : stats.assigned}</strong>
          </div>
        </div>

        <section className="dash-section client-my-orders-page__filters-card">
          <div className="dash-section__body client-my-orders-page__filters-body">
            <p className="client-my-orders-page__list-meta help">القائمة مرتبة من الأحدث إلى الأقدم. يمكنك التحديث دورياً لمزامنة الحالة.</p>
            <button type="button" className="btn btn-secondary client-my-orders-page__refresh" onClick={onRefresh} disabled={busy || refreshing}>
              {refreshing ? "جارٍ التحديث…" : "تحديث القائمة"}
            </button>
          </div>
        </section>

        <section className="cards-grid client-my-orders-page__grid" aria-busy={busy}>
          {busy ? (
            <OrderCardsGridSkeleton count={3} />
          ) : orders.length === 0 ? (
            <div className="dash-empty client-my-orders-page__empty">
              <div className="dash-empty__icon" aria-hidden="true">
                ◌
              </div>
              <div className="dash-empty__copy">
                <h2 className="dash-empty__title">لا توجد طلبات بعد</h2>
                <p className="dash-empty__subtitle">أنشئ أول طلب ليظهر هنا مع حالته وتفاصيله.</p>
              </div>
              <div className="client-my-orders-page__empty-actions">
                <button type="button" className="btn btn-primary" onClick={() => openCreateOrder()}>
                  إنشاء طلب
                </button>
                <Link to="/orders" className="btn btn-secondary">
                  تصفّح المعرض
                </Link>
              </div>
            </div>
          ) : (
            orders.map((order) => <ClientOrderCardCompact key={order.id} order={order} onOrdersChange={load} />)
          )}
        </section>
      </div>
    </div>
  );
}
