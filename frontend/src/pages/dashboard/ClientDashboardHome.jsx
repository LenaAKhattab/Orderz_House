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
import { JodMoneyDisplay } from "../../components/money/JodMoneyDisplay";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/clientAreaResources";
import "../../styles/dashboardHub.css";

function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

function normalizeClientOrders(res) {
  const list = res?.data?.orders ?? res?.orders;
  return Array.isArray(list) ? list : [];
}

/** @returns {{ actionKey: string } | null} */
function attentionMeta(order) {
  const s = String(order?.orderStatus || "");
  const a = "clientArea.dashboard.attention";
  if (s === "pending_payment") return { actionKey: `${a}.completePayment` };
  if (s === "awaiting_payment_after_bid_selection") return { actionKey: `${a}.completePaymentAfterBid` };
  if (s === "open_for_bids" || s === "open_for_freelancers") return { actionKey: `${a}.reviewBids` };
  if (s === "pending_client_review") return { actionKey: `${a}.reviewDelivery` };
  if (order?.clientRevisionNote && (s === "in_progress" || s === "assigned")) {
    return { actionKey: `${a}.revisionPending` };
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

function buildClientMetrics({ orders, financial, attentionCount, unreadNotifications }, t) {
  const m = "clientArea.dashboard.metrics";
  return [
    {
      id: "orders",
      label: t(`${m}.totalOrders`),
      value: String(orders.length),
      sublabel: t(`${m}.totalOrdersSub`),
      icon: IconBriefcase,
      tone: "blue",
    },
    {
      id: "attention",
      label: t(`${m}.needsAttention`),
      value: String(attentionCount),
      sublabel: t(`${m}.needsAttentionSub`),
      icon: IconStar,
      tone: "amber",
    },
    {
      id: "paid",
      label: t(`${m}.totalPaid`),
      value: <JodMoneyDisplay amount={financial.totalPaid} compact />,
      sublabel: t(`${m}.totalPaidSub`),
      icon: IconWallet,
      tone: "green",
    },
    {
      id: "notifications",
      label: t(`${m}.unreadNotifications`),
      value: String(unreadNotifications),
      sublabel: t(`${m}.unreadNotificationsSub`),
      icon: IconStar,
      tone: "purple",
    },
  ];
}

function buildPendingActions(attentionOrders) {
  const defaultDesc = "clientArea.dashboard.pendingAction.defaultDescription";
  const defaultTitle = "clientArea.dashboard.pendingAction.defaultTitle";
  return attentionOrders.slice(0, 3).map((o) => {
    const meta = attentionMeta(o);
    return {
      title: o.title || undefined,
      titleKey: o.title ? undefined : defaultTitle,
      descriptionKey: meta?.actionKey ?? defaultDesc,
      to: "/dashboard/client/my-orders",
      ctaKey: "clientArea.dashboard.pendingAction.cta",
    };
  });
}

function buildClientInsights({ attentionOrders, financial, orders, unreadNotifications }) {
  const i = "clientArea.dashboard.insights";
  const items = [];
  if (attentionOrders.length > 0) {
    const first = attentionOrders[0];
    const meta = attentionMeta(first);
    items.push({
      id: "attention-orders",
      type: "orders",
      titleKey: `${i}.attentionOrdersTitle`,
      descriptionKey: meta?.actionKey ?? `${i}.attentionOrdersDescription`,
      helperTextKey: first?.title ? `${i}.exampleOrder` : `${i}.fromYourOrdersOnly`,
      i18nParams: {
        count: attentionOrders.length,
        ...(first?.title ? { title: first.title } : {}),
      },
      actionLabelKey: "clientArea.dashboard.myOrders",
      actionUrl: "/dashboard/client/my-orders",
    });
  }
  if (financial.pendingPayment > 0) {
    items.push({
      id: "pending-pay",
      type: "performance",
      titleKey: `${i}.pendingPaymentTitle`,
      descriptionKey: `${i}.pendingPaymentDescription`,
      helperTextKey: `${i}.paymentsFromAccount`,
      i18nParams: { count: financial.pendingPayment },
      actionLabelKey: `${i}.finance`,
      actionUrl: "/dashboard/client/financial",
    });
  }
  if (orders.length === 0) {
    items.push({
      id: "first-order",
      type: "orders",
      titleKey: `${i}.firstOrderTitle`,
      descriptionKey: `${i}.firstOrderDescription`,
      helperTextKey: `${i}.createOrderHelper`,
      actionLabelKey: "clientArea.dashboard.tip.createOrder",
      actionUrl: "/dashboard/client/orders/create",
    });
  }
  if (unreadNotifications > 0) {
    items.push({
      id: "unread-notif",
      type: "messages",
      titleKey: `${i}.unreadTitle`,
      descriptionKey: `${i}.unreadDescription`,
      helperTextKey: `${i}.messages`,
      i18nParams: { count: unreadNotifications },
      actionLabelKey: `${i}.notifications`,
      actionUrl: "/dashboard/client/notifications",
    });
  }
  return items.slice(0, 3);
}

export default function ClientDashboardHome({ user }) {
  const { openModal: openCreateOrder } = useClientCreateOrderModal();
  const { push } = useToast();
  const { t } = useTranslation();
  const d = "clientArea.dashboard";
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
          const msg = e?.response?.data?.message || e?.message || t(`${d}.loadDataFallback`);
          setError(msg);
          push({ type: "error", title: t(`${d}.loadErrorTitle`), message: msg });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, push, t]);

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
      buildClientMetrics(
        {
          orders,
          financial,
          attentionCount: attentionOrders.length,
          unreadNotifications,
        },
        t,
      ),
    [orders, financial, attentionOrders.length, unreadNotifications, t],
  );

  const pendingActions = useMemo(() => buildPendingActions(attentionOrders), [attentionOrders]);
  const insights = useMemo(
    () => buildClientInsights({ attentionOrders, financial, orders, unreadNotifications }),
    [attentionOrders, financial, orders, unreadNotifications],
  );

  const welcomeTitle = welcomeName
    ? t(`${d}.welcomeWithName`, { name: welcomeName })
    : t(`${d}.welcomeDefault`);

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
            {t("clientArea.common.retry")}
          </button>
        </div>
      </DashboardHubPage>
    );
  }

  const tipFirstOrder = {
    headline: t(`${d}.tip.firstOrderHeadline`),
    description: t(`${d}.tip.firstOrderDescription`),
    actionUrl: "/dashboard/client/orders/create",
    actionLabel: t(`${d}.tip.createOrder`),
  };

  return (
    <DashboardHubPage>
      <DashboardWelcomeHero
        title={welcomeTitle}
        subtitle={t(`${d}.subtitle`)}
        metrics={metrics}
        primaryCta={{ to: "/dashboard/client/my-orders", label: t(`${d}.myOrders`) }}
        secondaryCta={{
          to: "/dashboard/client/orders",
          label: t(`${d}.exploreMarketplace`),
        }}
        tip={
          orders.length === 0
            ? tipFirstOrder
            : pendingActions[0]
              ? {
                  headline: pendingActions[0].title || t(pendingActions[0].titleKey),
                  description: t(pendingActions[0].descriptionKey),
                  actionUrl: pendingActions[0].to,
                  actionLabel: t(pendingActions[0].ctaKey),
                }
              : null
        }
      />
      <div className="fdash-client-home-actions">
        <button type="button" className="fdash-banner__cta" onClick={() => openCreateOrder()}>
          {t(`${d}.createOrderNew`)}
        </button>
      </div>
      <DashboardActionBanner actions={pendingActions} />
      {insights.length > 0 ? <DashboardInsightsSection insights={insights} loading={false} /> : null}
    </DashboardHubPage>
  );
}
