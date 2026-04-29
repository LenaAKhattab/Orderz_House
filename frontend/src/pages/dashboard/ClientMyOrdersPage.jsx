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
  const paymentFailureMessage = useMemo(
    () =>
      isArabicUi
        ? "فشل إنشاء المشروع لأن عملية الدفع لم تكتمل. يرجى المحاولة مرة أخرى."
        : "Project creation failed because the payment was not completed. Please try again.",
    [isArabicUi],
  );

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
          } else if (orderId) {
            await confirmClientFixedOrderPaidRequest(orderId);
          }
          push({ type: "success", title: "تم الدفع بنجاح", message: "تم إنشاء/تفعيل الطلب وإتاحته بحسب نوعه." });
        } catch {
          if (orderId && !bidId) {
            try {
              await cancelClientFixedOrderPaymentRequest(orderId);
            } catch {
              // best-effort cleanup
            }
          }
          push({ type: "error", title: isArabicUi ? "فشل إنشاء المشروع" : "Project creation failed", message: paymentFailureMessage });
        } finally {
          navigate(location.pathname, { replace: true });
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
        push({ type: "error", title: isArabicUi ? "فشل إنشاء المشروع" : "Project creation failed", message: paymentFailureMessage });
        navigate(location.pathname, { replace: true });
      })();
    }
  }, [isArabicUi, location.pathname, location.search, navigate, paymentFailureMessage, push]);

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
    const inPool = orders.filter((o) => o?.orderStatus === "published" && !o?.assignedFreelancerId && !o?.isArchived).length;
    const assigned = orders.filter((o) => Boolean(o?.assignedFreelancerId)).length;
    return { total, inPool, assigned };
  }, [orders]);

  return (
    <main className="container page-content dashboard-orders-system" dir="rtl">
      <section className="card dashboard-orders-system__header">
        <div className="dashboard-orders-system__header-main">
          <p className="dashboard-orders-system__kicker">لوحة العميل</p>
          <h1>طلباتي</h1>
          <p>تتبّع طلباتك، حالة الدفع، واستقبال العروض للمزايدة، ثم اختيار العرض والدفع لبدء التنفيذ.</p>
        </div>
        <div className="dashboard-orders-system__header-actions">
          <button type="button" className="btn btn-primary" onClick={() => openCreateOrder()}>
            + طلب جديد
          </button>
          <Link to="/orders" className="btn btn-secondary">
            استكشاف الحوض
          </Link>
        </div>
      </section>

      <section className="card dashboard-orders-system__filters" aria-label="ملخص سريع">
        <div className="dashboard-orders-system__chips">
          <span className="oh-mini-chip">إجمالي الطلبات: {busy ? "—" : stats.total}</span>
          <span className="oh-mini-chip">في الحوض: {busy ? "—" : stats.inPool}</span>
          <span className="oh-mini-chip">مُسندة: {busy ? "—" : stats.assigned}</span>
        </div>
        <p className="help">القائمة مرتبة من الأحدث إلى الأقدم.</p>
        <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={busy || refreshing}>
          {refreshing ? "جارٍ التحديث…" : "تحديث القائمة"}
        </button>
      </section>

      <section className="cards-grid dashboard-orders-system__list" aria-busy={busy}>
        {busy ? (
          <OrderCardsGridSkeleton count={3} />
        ) : orders.length === 0 ? (
          <section className="card dashboard-orders-system__empty">
            <h2>لا توجد طلبات بعد</h2>
            <p>أنشئ أول طلب ليظهر هنا مع حالته وتفاصيله.</p>
            <div className="dashboard-orders-system__header-actions">
              <button type="button" className="btn btn-primary" onClick={() => openCreateOrder()}>
                إنشاء طلب
              </button>
              <Link to="/orders" className="btn btn-secondary">
                تصفّح الحوض
              </Link>
            </div>
          </section>
        ) : (
          orders.map((order) => <ClientOrderCardCompact key={order.id} order={order} onOrdersChange={load} />)
        )}
      </section>
    </main>
  );
}
