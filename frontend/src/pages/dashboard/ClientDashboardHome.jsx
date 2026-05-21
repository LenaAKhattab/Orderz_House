import { useCallback, useEffect, useMemo, useState } from "react";
import { useClientCreateOrderModal } from "../../context/ClientCreateOrderModalContext";
import { useToast } from "../../components/ui/toastContext";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import DashboardWelcomeHero from "../../components/dashboard/hub/DashboardWelcomeHero";
import DashboardWelcomeSkeleton from "../../components/dashboard/hub/DashboardWelcomeSkeleton";
import DashboardActionBanner from "../../components/dashboard/hub/DashboardActionBanner";
import DashboardInsightsSection from "../../components/dashboard/hub/DashboardInsightsSection";
import {
  IconBriefcase,
  IconStar,
  IconWallet,
} from "../../components/dashboard/hub/icons/DashboardIcons";
import { listClientMyOrdersRequest, listMyNotificationsRequest } from "../../services/api";
import "../../styles/dashboardHub.css";

function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
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

function buildClientMetrics({ orders, financial, attentionCount, unreadNotifications }) {
  return [
    {
      id: "orders",
      label: "إجمالي الطلبات",
      value: String(orders.length),
      sublabel: "طلباتك المنشورة",
      icon: IconBriefcase,
      tone: "blue",
    },
    {
      id: "attention",
      label: "تحتاج انتباهك",
      value: String(attentionCount),
      sublabel: "إجراء مطلوب",
      icon: IconStar,
      tone: "amber",
    },
    {
      id: "paid",
      label: "إجمالي المدفوع",
      value: `${formatMoney(financial.totalPaid)} د.أ`,
      sublabel: "من طلباتك المدفوعة",
      icon: IconWallet,
      tone: "green",
    },
    {
      id: "notifications",
      label: "إشعارات غير مقروءة",
      value: String(unreadNotifications),
      sublabel: "آخر التحديثات",
      icon: IconStar,
      tone: "purple",
    },
  ];
}

function buildPendingActions(attentionOrders) {
  return attentionOrders.slice(0, 3).map((o) => {
    const meta = attentionMeta(o);
    return {
      title: o.title || "طلب يحتاج انتباهك",
      description: meta?.action || "راجع الطلب واتخذ الإجراء المناسب.",
      to: "/dashboard/client/my-orders",
      cta: "متابعة",
    };
  });
}

function buildClientInsights({ attentionOrders, financial, orders, unreadNotifications }) {
  const items = [];
  if (attentionOrders.length > 0) {
    const first = attentionOrders[0];
    const meta = attentionMeta(first);
    items.push({
      id: "attention-orders",
      type: "orders",
      titleAr: `${attentionOrders.length} طلب${attentionOrders.length === 1 ? "" : "ات"} تحتاج انتباهك`,
      descriptionAr: meta?.action || "راجع الطلبات واتخذ الإجراء المناسب.",
      helperText: first?.title ? `مثال: ${first.title}` : "من طلباتك فقط",
      actionLabel: "طلباتي",
      actionUrl: "/dashboard/client/my-orders",
    });
  }
  if (financial.pendingPayment > 0) {
    items.push({
      id: "pending-pay",
      type: "performance",
      titleAr: `${financial.pendingPayment} طلب بانتظار الدفع`,
      descriptionAr: "أكمل الدفع لتفعيل الطلب أو متابعة التنفيذ.",
      helperText: "المدفوعات من حسابك فقط",
      actionLabel: "المالية",
      actionUrl: "/dashboard/client/financial",
    });
  }
  if (orders.length === 0) {
    items.push({
      id: "first-order",
      type: "orders",
      titleAr: "ابدأ أول طلب لك",
      descriptionAr: "انشر طلبك في المعرض واستقبل عروض المستقلين.",
      helperText: "إنشاء طلب جديد",
      actionLabel: "إنشاء طلب",
      actionUrl: "/dashboard/client/my-orders",
    });
  }
  if (unreadNotifications > 0) {
    items.push({
      id: "unread-notif",
      type: "messages",
      titleAr: `${unreadNotifications} إشعار غير مقروء`,
      descriptionAr: "تابع آخر التحديثات على طلباتك.",
      helperText: "رسائلي",
      actionLabel: "الإشعارات",
      actionUrl: "/dashboard/client/notifications",
    });
  }
  return items.slice(0, 3);
}

export default function ClientDashboardHome({ user }) {
  const { openModal: openCreateOrder } = useClientCreateOrderModal();
  const { push } = useToast();
  const welcomeName = useMemo(() => {
    const n = fullNameAr(user);
    return n ? n.split(/\s+/)[0] : null;
  }, [user]);

  const [orders, setOrders] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const [ordersRes, notifRes] = await Promise.all([
      listClientMyOrdersRequest({ limit: 200, offset: 0 }),
      listMyNotificationsRequest({ limit: 50, offset: 0, isRead: false }),
    ]);
    setOrders(normalizeClientOrders(ordersRes));
    const raw = notifRes?.data?.notifications ?? notifRes?.notifications;
    const list = Array.isArray(raw) ? raw : [];
    const total = Number(notifRes?.data?.pagination?.total ?? notifRes?.pagination?.total);
    setUnreadNotifications(Number.isFinite(total) ? total : list.length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e) {
        if (!cancelled) {
          const msg = e?.response?.data?.message || e?.message || "تعذر تحميل البيانات.";
          setError(msg);
          push({ type: "error", title: "تعذر تحميل لوحة التحكم", message: msg });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, push]);

  const attentionOrders = useMemo(
    () => sortByRecent(orders.filter((o) => attentionMeta(o))),
    [orders],
  );

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

  const metrics = useMemo(
    () =>
      buildClientMetrics({
        orders,
        financial,
        attentionCount: attentionOrders.length,
        unreadNotifications,
      }),
    [orders, financial, attentionOrders.length, unreadNotifications],
  );

  const pendingActions = useMemo(() => buildPendingActions(attentionOrders), [attentionOrders]);
  const insights = useMemo(
    () => buildClientInsights({ attentionOrders, financial, orders, unreadNotifications }),
    [attentionOrders, financial, orders, unreadNotifications],
  );

  const welcomeTitle = welcomeName ? `مرحباً، ${welcomeName}` : "مرحباً بك في لوحة العميل";

  if (loading) {
    return (
      <DashboardHubPage>
        <DashboardWelcomeSkeleton />
        <div className="fdash-skel" style={{ height: 56, borderRadius: 18 }} />
      </DashboardHubPage>
    );
  }

  if (error && orders.length === 0) {
    return (
      <DashboardHubPage>
        <div className="fdash-alert">
          <p style={{ margin: 0 }}>{error}</p>
          <button type="button" className="fdash-toolbar__btn" onClick={() => void load()}>
            إعادة المحاولة
          </button>
        </div>
      </DashboardHubPage>
    );
  }

  return (
    <DashboardHubPage>
      <DashboardWelcomeHero
        title={welcomeTitle}
        subtitle="تابع طلباتك ومدفوعاتك وتسليماتك من مكان واحد — بيانات حقيقية من حسابك فقط."
        metrics={metrics}
        primaryCta={{ to: "/dashboard/client/my-orders", label: "طلباتي" }}
        secondaryCta={{
          to: "/dashboard/client/orders",
          label: "استكشاف المعرض",
        }}
        tip={
          orders.length === 0
            ? {
                headline: "ابدأ بنشر طلبك الأول",
                description: "أنشئ طلباً جديداً ليظهر في المعرض ويصلك عروض المستقلين.",
                actionUrl: "/dashboard/client/my-orders",
                actionLabel: "إنشاء طلب",
              }
            : pendingActions[0]
              ? {
                  headline: pendingActions[0].title,
                  description: pendingActions[0].description,
                  actionUrl: pendingActions[0].to,
                  actionLabel: pendingActions[0].cta,
                }
              : null
        }
      />
      <div className="fdash-client-home-actions">
        <button type="button" className="fdash-banner__cta" onClick={() => openCreateOrder()}>
          + إنشاء طلب جديد
        </button>
      </div>
      <DashboardActionBanner actions={pendingActions} />
      {insights.length > 0 ? <DashboardInsightsSection insights={insights} loading={false} /> : null}
    </DashboardHubPage>
  );
}
