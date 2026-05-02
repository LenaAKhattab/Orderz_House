import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useClientCreateOrderModal } from "../../context/ClientCreateOrderModalContext";
import { listClientMyOrdersRequest, listMyNotificationsRequest } from "../../services/api";
import { orderStatusLabelAr } from "../../utils/orderFlowUi";

function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function typeLabelAr(projectType) {
  if (projectType === "fixed") return "سعر ثابت";
  if (projectType === "bidding") return "مزايدة";
  return "—";
}

function normalizeClientOrders(res) {
  const list = res?.data?.orders ?? res?.orders;
  return Array.isArray(list) ? list : [];
}

/** @returns {{ action: string } | null} */
function attentionMeta(order) {
  const s = String(order?.orderStatus || "");
  if (s === "pending_payment") return { action: "أكمل الدفع لتفعيل الطلب." };
  if (s === "awaiting_payment_after_bid_selection") return { action: "أكمل الدفع بعد اختيار عرض السعر." };
  if (s === "open_for_bids" || s === "open_for_freelancers") return { action: "راجع العروض واتخذ الإجراء المناسب." };
  if (s === "pending_client_review") return { action: "راجع التسليم واعتمد أو اطلب تعديلاً." };
  if (order?.clientRevisionNote && (s === "in_progress" || s === "assigned")) {
    return { action: "هناك تعديل مطلوب — راجع تفاصيل الطلب." };
  }
  return null;
}

function sortByRecent(orders) {
  return [...orders].sort((a, b) => {
    const ta = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const tb = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return tb - ta;
  });
}

function Section({ title, actionLabel, actionTo, children }) {
  const hasHead = Boolean(title || (actionLabel && actionTo));
  return (
    <section className="dash-section">
      {hasHead ? (
        <div className="dash-section__head">
          {title ? <h2 className="dash-section__title">{title}</h2> : <span />}
          {actionLabel && actionTo ? (
            <NavLink to={actionTo} className="dash-section__link">
              {actionLabel}
            </NavLink>
          ) : null}
        </div>
      ) : null}
      <div className="dash-section__body">{children}</div>
    </section>
  );
}

function notificationPreviewLine(n) {
  const title = String(n?.title || "").trim();
  const body = String(n?.body || n?.message || "").trim();
  return title || body || "إشعار";
}

export default function ClientDashboardHome({ user }) {
  const { openModal: openCreateOrder } = useClientCreateOrderModal();
  const name = fullNameAr(user) || user?.email || "مرحباً بك";

  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const [ordersRes, notifRes] = await Promise.all([
      listClientMyOrdersRequest({ limit: 200, offset: 0 }),
      listMyNotificationsRequest({ limit: 8, offset: 0 }),
    ]);
    setOrders(normalizeClientOrders(ordersRes));
    const raw = notifRes?.data?.notifications ?? notifRes?.notifications;
    setNotifications(Array.isArray(raw) ? raw.slice(0, 3) : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.message || e?.message || "تعذر تحميل البيانات.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const attentionOrders = useMemo(() => {
    return sortByRecent(orders.filter((o) => attentionMeta(o))).slice(0, 8);
  }, [orders]);

  const recentOrders = useMemo(() => sortByRecent(orders).slice(0, 5), [orders]);

  const financial = useMemo(() => {
    let totalPaid = 0;
    let pendingPayment = 0;
    let unpaid = 0;
    for (const o of orders) {
      if (String(o?.paymentStatus || "") === "paid" && o?.budget != null) {
        const n = Number(o.budget);
        if (Number.isFinite(n)) totalPaid += n;
      }
      if (["pending_payment", "awaiting_payment_after_bid_selection"].includes(String(o?.orderStatus || ""))) {
        pendingPayment += 1;
      }
      const pay = String(o?.paymentStatus || "");
      const need = Boolean(o?.paymentRequired);
      if (need && pay === "unpaid" && String(o?.orderStatus || "") !== "completed") {
        unpaid += 1;
      }
    }
    return { totalPaid, pendingPayment, unpaid };
  }, [orders]);

  if (loading) {
    return (
      <div className="dash" dir="rtl">
        <header className="dash-hero dash-hero--compact">
          <p className="dash-hero__kicker">لوحة العميل</p>
          <h1 className="dash-hero__title oh-orders-sidebar-title">جارٍ التحميل…</h1>
        </header>
        <div className="card" style={{ marginTop: 12 }}>
          <p className="help" style={{ margin: 0 }}>
            يتم جلب طلباتك وإشعاراتك…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dash" dir="rtl">
        <header className="dash-hero dash-hero--compact">
          <p className="dash-hero__kicker">لوحة العميل</p>
          <h1 className="dash-hero__title oh-orders-sidebar-title">تعذر التحميل</h1>
        </header>
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0 }}>{error}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dash" dir="rtl">
      <header className="dash-hero">
        <div className="dash-hero__copy">
          <p className="dash-hero__kicker">لوحة العميل</p>
          <h1 className="dash-hero__title oh-orders-sidebar-title">مرحباً، {name}</h1>
          <p className="dash-hero__subtitle">تابع طلباتك ومدفوعاتك وتسليماتك من مكان واحد.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14, alignItems: "center" }}>
            <button type="button" className="btn btn-primary" onClick={() => openCreateOrder()}>
              إنشاء طلب جديد
            </button>
            <NavLink to="/dashboard/client/orders/create" className="dash-section__link" style={{ fontSize: "0.95rem" }}>
              أو افتح صفحة إنشاء الطلب
            </NavLink>
          </div>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="dash-empty" style={{ marginTop: 8 }}>
          <div className="dash-empty__icon" aria-hidden="true">
            ◌
          </div>
          <div className="dash-empty__copy">
            <h3 className="dash-empty__title">لم تنشئ أي طلب بعد</h3>
            <p className="dash-empty__subtitle">ابدأ بطلبك الأول وتابع حالته من هذه اللوحة.</p>
          </div>
          <button type="button" className="btn btn-primary dash-empty__action" onClick={() => openCreateOrder()}>
            أنشئ أول طلب
          </button>
        </div>
      ) : null}

      <div className="dash-grid">
        <Section title="طلبات تحتاج انتباهك" actionLabel="كل الطلبات" actionTo="/dashboard/client/my-orders">
          {attentionOrders.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>
              لا توجد طلبات تتطلب إجراءً منك حالياً.
            </p>
          ) : (
            <ul className="dash-home-list">
              {attentionOrders.map((o) => {
                const meta = attentionMeta(o);
                return (
                  <li key={o.id} className="dash-home-list__item card">
                    <div className="dash-home-list__row">
                      <div>
                        <div style={{ fontWeight: 800 }}>{o.title || "—"}</div>
                        <div className="help" style={{ marginTop: 4 }}>
                          {orderStatusLabelAr(o.orderStatus)} · {formatJoDateTime(o.updatedAt || o.createdAt)}
                        </div>
                        {meta ? <div style={{ marginTop: 8, color: "var(--text-main)" }}>{meta.action}</div> : null}
                      </div>
                      <NavLink to="/dashboard/client/my-orders" className="btn btn-secondary" style={{ alignSelf: "center" }}>
                        عرض التفاصيل
                      </NavLink>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="آخر طلباتي" actionLabel="عرض الكل" actionTo="/dashboard/client/my-orders">
          {recentOrders.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>لا توجد طلبات.</p>
          ) : (
            <ul className="dash-home-list">
              {recentOrders.map((o) => (
                <li key={o.id} className="dash-home-list__item card">
                  <div className="dash-home-list__row">
                    <div>
                      <div style={{ fontWeight: 800 }}>{o.title || "—"}</div>
                      <div className="help" style={{ marginTop: 4 }}>
                        {orderStatusLabelAr(o.orderStatus)} · {typeLabelAr(o.projectType)} · آخر تحديث:{" "}
                        {formatJoDateTime(o.updatedAt || o.createdAt)}
                      </div>
                      <div className="help" style={{ marginTop: 4 }} dir="ltr">
                        {o.budget != null ? `${formatMoney(o.budget)} JOD` : "—"} · الدفع: {String(o.paymentStatus || "—")}
                      </div>
                    </div>
                    <NavLink to="/dashboard/client/my-orders" className="btn btn-secondary" style={{ alignSelf: "center" }}>
                      عرض
                    </NavLink>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="المالية المختصرة" actionLabel="الذهاب إلى المالية" actionTo="/dashboard/client/financial">
          <div className="card" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span className="help">إجمالي المدفوع (طلبات بميزانية ثابتة ومدفوعة)</span>
              <strong dir="ltr">{formatMoney(financial.totalPaid)} JOD</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span className="help">طلبات بانتظار دفع (عدد)</span>
              <strong>{financial.pendingPayment}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span className="help">طلبات تحتاج دفع (حقل غير مدفوع)</span>
              <strong>{financial.unpaid}</strong>
            </div>
            <p className="help" style={{ margin: 0 }}>
              الأرقام مأخوذة من طلباتك فقط؛ للتفصيل الكامل راجع صفحة المالية.
            </p>
          </div>
        </Section>

        <Section title="إشعارات مهمة" actionLabel="عرض كل الإشعارات" actionTo="/dashboard/client/notifications">
          {notifications.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>لا توجد إشعارات حديثة.</p>
          ) : (
            <ul className="dash-home-list">
              {notifications.map((n) => (
                <li key={n.id} className="dash-home-list__item card">
                  <div style={{ fontWeight: 700 }}>{notificationPreviewLine(n)}</div>
                  <div className="help" style={{ marginTop: 4 }}>{formatJoDateTime(n.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <style>{`
        .dash-home-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
        .dash-home-list__item { margin: 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius); }
        .dash-home-list__row { display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
      `}</style>
    </div>
  );
}
