import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useClientCreateOrderModal } from "../../context/ClientCreateOrderModalContext";
import { useToast } from "../../components/ui/toastContext";
import { listClientMyOrdersRequest } from "../../services/api";
import ClientOrderCardCompact from "../../components/orders/ClientOrderCardCompact";
import { OrderCardsGridSkeleton } from "../../components/ui/Skeleton";

export default function ClientMyOrdersPage() {
  const { push } = useToast();
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
      /* ignore — background poll should not surface errors */
    }
  }, [load]);

  /** Live list updates (e.g. delivery timing after freelancer submits) without manual refresh. */
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
      const open =
        (o?.orderStatus === "published" || o?.orderStatus === "open_for_freelancers" || o?.orderStatus === "open_for_bids") &&
        !o?.assignedFreelancerId &&
        !o?.isArchived;
      if (!open) return false;
      if (o?.sourceType === "client_created" && o?.projectType === "fixed") {
        return o?.paymentStatus === "paid" || o?.paymentStatus === "skipped_by_admin";
      }
      return true;
    }).length;
    const assigned = orders.filter((o) => Boolean(o?.assignedFreelancerId)).length;
    return { total, inPool, assigned };
  }, [orders]);

  return (
    <main className="container page-content dash-shell client-my-orders" dir="rtl">
      <header className="client-my-orders__hero">
        <div className="client-my-orders__hero-text">
          <p className="client-my-orders__kicker">لوحة العميل</p>
          <h1 className="client-my-orders__title">طلباتي</h1>
          <p className="client-my-orders__lead">
            تتبّع الطلبات التي أنشأتها: حالة النشر في الحوض، الإسناد لمستقل، وعدد العروض لطلبات المزايدة. قبول العروض وربط الدفع يُكملان لاحقاً.
          </p>
        </div>
        <div className="client-my-orders__hero-actions">
          <button type="button" className="btn btn-primary" onClick={() => openCreateOrder()}>
            + طلب جديد
          </button>
          <Link to="/orders" className="btn btn-secondary">
            استكشاف الحوض
          </Link>
        </div>
      </header>

      <section className="client-my-orders__stats" aria-label="ملخص سريع">
        <div className="client-my-orders__stat">
          <span className="client-my-orders__stat-label">إجمالي الطلبات</span>
          <strong className="client-my-orders__stat-value">{busy ? "—" : stats.total}</strong>
        </div>
        <div className="client-my-orders__stat client-my-orders__stat--accent">
          <span className="client-my-orders__stat-label">في الحوض</span>
          <strong className="client-my-orders__stat-value">{busy ? "—" : stats.inPool}</strong>
        </div>
        <div className="client-my-orders__stat">
          <span className="client-my-orders__stat-label">مُسندة</span>
          <strong className="client-my-orders__stat-value">{busy ? "—" : stats.assigned}</strong>
        </div>
      </section>

      <div className="client-my-orders__toolbar card">
        <p className="client-my-orders__toolbar-hint">القائمة مرتبة من الأحدث إلى الأقدم.</p>
        <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={busy || refreshing}>
          {refreshing ? "جارٍ التحديث…" : "تحديث القائمة"}
        </button>
      </div>

      <section className="client-my-orders__list" aria-busy={busy}>
        {busy ? (
          <OrderCardsGridSkeleton count={3} />
        ) : orders.length === 0 ? (
          <div className="client-my-orders__empty card">
            <div className="client-my-orders__empty-icon" aria-hidden="true">
              ◈
            </div>
            <h2 className="client-my-orders__empty-title">لا توجد طلبات بعد</h2>
            <p className="client-my-orders__empty-text">أنشئ أول طلب ليظهر هنا مع حالته وتفاصيله.</p>
            <div className="client-my-orders__empty-actions">
              <button type="button" className="btn btn-primary" onClick={() => openCreateOrder()}>
                إنشاء طلب
              </button>
              <Link to="/orders" className="btn btn-secondary">
                تصفّح الحوض
              </Link>
            </div>
          </div>
        ) : (
          <ul className="client-my-orders__ul">
            {orders.map((order) => (
              <li key={order.id}>
                <ClientOrderCardCompact order={order} onOrdersChange={load} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
