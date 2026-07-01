import { useCallback, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  BookOpen,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock,
  CreditCard,
  FilePlus2,
  FolderOpen,
  Globe,
  Info,
  LayoutGrid,
  Megaphone,
  RefreshCw,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { useClientCreateOrderModal } from "../../../context/ClientCreateOrderModalContext";
import DashboardPageHeader from "../../../components/dashboard/DashboardPageHeader";
import { useSuperAdminDashboardHomeBundle } from "../../../hooks/useSuperAdminDashboardHomeBundle";
import { buildUnifiedAttention } from "./buildUnifiedAttention";
import { computeAttentionTotalCount } from "./UnifiedAttentionPanel";
import { formatInt, formatMoneyJod, LABEL_UNAVAILABLE } from "./superAdminHomeBundleUi";
import { SA_ROUTES, resolveSuperAdminDashboardHomeLink } from "./superAdminHomeDataUtils";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../styles/adminControlCenter.css";

const MAX_ATTENTION = 6;

const QUICK_ACTIONS = [
  {
    key: "create-order",
    type: "button",
    label: "إنشاء طلب",
    description: "طلب داخلي جديد",
    icon: FilePlus2,
  },
  {
    key: "orders",
    type: "link",
    to: SA_ROUTES.internalOrders,
    label: "الطلبات الداخلية",
    description: "طلبات أنشأتها الإدارة فقط",
    icon: LayoutGrid,
  },
  {
    key: "admins",
    type: "link",
    to: SA_ROUTES.admins,
    label: "إدارة المستخدمين",
    description: "حسابات المدراء والصلاحيات",
    icon: Users,
  },
  {
    key: "subscriptions",
    type: "link",
    to: SA_ROUTES.subscriptions,
    label: "الاشتراكات",
    description: "اشتراكات المستقلين",
    icon: CreditCard,
  },
  {
    key: "ads",
    type: "link",
    to: SA_ROUTES.ads,
    label: "الإعلانات",
    description: "إعلانات المنصة",
    icon: Megaphone,
  },
  {
    key: "courses",
    type: "link",
    to: SA_ROUTES.courses,
    label: "الدورات",
    description: "إدارة الدورات والتسجيلات",
    icon: BookOpen,
  },
  {
    key: "website",
    type: "link",
    to: SA_ROUTES.editWebsite,
    label: "إعدادات الموقع",
    description: "محتوى وصفحات الموقع العام",
    icon: Globe,
  },
  {
    key: "claims",
    type: "link",
    to: SA_ROUTES.financialClaims,
    label: "المطالبات المالية",
    description: "مراجعة مطالبات المستقلين",
    icon: Wallet,
  },
];

function isMetricMissing(value) {
  return value === null || value === undefined || Number.isNaN(Number(value));
}

function formatMetricValue(value, { money = false, failed = false } = {}) {
  if (failed) return "غير متاح";
  if (isMetricMissing(value)) return LABEL_UNAVAILABLE;
  return money ? formatMoneyJod(value) : formatInt(value);
}

function KpiCard({ label, value, to, loading, failed, refreshing, money = false, icon: Icon }) {
  const display = formatMetricValue(value, { money, failed });
  const showValueSkeleton = Boolean(loading);
  const safeTo = resolveSuperAdminDashboardHomeLink(to);
  const cardClass = `acc-kpi-card${refreshing ? " acc-kpi-card--refreshing" : ""}`;

  const inner = (
    <>
      <div className="acc-kpi-card__body">
        <span className="acc-kpi-card__label">{label}</span>
        {showValueSkeleton ? (
          <span className="acc-kpi-card__value-skeleton" aria-hidden />
        ) : (
          <strong
            className={`acc-kpi-card__value${display === LABEL_UNAVAILABLE || display === "غير متاح" ? " acc-kpi-card__value--muted" : ""}`}
          >
            {display}
          </strong>
        )}
      </div>
      {Icon ? (
        <span className="acc-kpi-card__icon" aria-hidden>
          <Icon size={15} strokeWidth={2} />
        </span>
      ) : null}
    </>
  );

  if (safeTo && !showValueSkeleton && display !== LABEL_UNAVAILABLE && display !== "غير متاح") {
    return (
      <NavLink to={safeTo} className={cardClass}>
        {inner}
      </NavLink>
    );
  }

  return <div className={cardClass}>{inner}</div>;
}

function AttentionSkeletonItem() {
  return (
    <div className="acc-attention-skel">
      <div className="acc-attention-skel__lines">
        <span className="acc-attention-skel__line" />
        <span className="acc-attention-skel__line acc-attention-skel__line--short" />
      </div>
      <span className="acc-attention-skel__badge" aria-hidden />
    </div>
  );
}

function SummaryMetricCard({ label, value, tone, icon: Icon, loading, failed, title }) {
  const display = formatMetricValue(value, { failed });
  return (
    <div className={`acc-summary-card acc-summary-card--${tone}`} title={title}>
      <span className="acc-summary-card__icon" aria-hidden>
        <Icon size={14} strokeWidth={2} />
      </span>
      <span className="acc-summary-card__label">{label}</span>
      <strong className="acc-summary-card__value">
        {loading ? <span className="acc-summary-card__value-skeleton" aria-hidden /> : display}
      </strong>
    </div>
  );
}

function severityClass(severity) {
  if (severity === 3) return "acc-attention-item--urgent";
  if (severity === 2) return "acc-attention-item--medium";
  return "acc-attention-item--info";
}

function SeverityIcon({ severity }) {
  if (severity === 3) return <AlertCircle size={14} strokeWidth={2.25} aria-hidden />;
  if (severity === 2) return <AlertTriangle size={14} strokeWidth={2.25} aria-hidden />;
  return <Info size={14} strokeWidth={2.25} aria-hidden />;
}

function AttentionList({ items, loading, failed }) {
  if (loading) {
    return (
      <ul className="acc-attention-list" aria-busy="true" aria-label="جارٍ تحميل التنبيهات">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <AttentionSkeletonItem />
          </li>
        ))}
      </ul>
    );
  }

  if (failed) {
    return <p className="acc-empty acc-empty--inline">تعذر تحميل التنبيهات. حاول التحديث مرة أخرى.</p>;
  }

  if (!items?.length) {
    return <p className="acc-empty acc-empty--inline">لا توجد مهام تحتاج انتباهك حالياً — المنصة مستقرة.</p>;
  }

  return (
    <ul className="acc-attention-list">
      {items.slice(0, MAX_ATTENTION).map((item) => {
        const severity = item.severity ?? 1;
        const count = item.count != null ? formatInt(item.count) : null;
        const safeTo = resolveSuperAdminDashboardHomeLink(item.to);
        const body = (
          <>
            <span className="acc-attention-item__severity" aria-hidden>
              <SeverityIcon severity={severity} />
            </span>
            <span className="acc-attention-item__copy">
              <span className="acc-attention-item__title">{item.text}</span>
              {item.description ? <span className="acc-attention-item__desc">{item.description}</span> : null}
            </span>
            {count ? <span className="acc-attention-item__badge">{count}</span> : null}
          </>
        );

        return (
          <li key={item.id}>
            {safeTo ? (
              <NavLink to={safeTo} className={`acc-attention-item ${severityClass(severity)}`}>
                {body}
              </NavLink>
            ) : (
              <div className={`acc-attention-item ${severityClass(severity)}`}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function QuickActionCard({ action, onCreateOrder }) {
  const Icon = action.icon;
  const content = (
    <>
      <span className="acc-action-card__icon" aria-hidden>
        <Icon size={16} strokeWidth={2} />
      </span>
      <span className="acc-action-card__label">{action.label}</span>
      <span className="acc-action-card__desc">{action.description}</span>
      <span className="acc-action-card__chevron" aria-hidden>
        <ChevronLeft size={14} strokeWidth={2.25} />
      </span>
    </>
  );

  if (action.type === "button") {
    return (
      <button type="button" className="acc-action-card" onClick={onCreateOrder}>
        {content}
      </button>
    );
  }

  const safeTo = resolveSuperAdminDashboardHomeLink(action.to);
  if (!safeTo) {
    return <div className="acc-action-card">{content}</div>;
  }

  return (
    <NavLink to={safeTo} className="acc-action-card">
      {content}
    </NavLink>
  );
}

export default function SuperAdminProductAnalytics() {
  const { dir, locale } = useTranslation();
  const { openModal: openCreateOrderModal } = useClientCreateOrderModal();

  const {
    data: bundle,
    fastLoading,
    intelligenceLoading,
    fastError,
    intelligenceError,
    requestIntelligence,
    refresh,
  } = useSuperAdminDashboardHomeBundle({ preset: "7d", posthogRange: "7d", cacheKey: "7d" });

  useEffect(() => {
    if (!fastLoading && bundle) {
      requestIntelligence();
    }
  }, [fastLoading, bundle, requestIntelligence]);

  const summaryData = bundle?.summary;
  const businessData = bundle?.businessKpis;
  const intelligence = bundle?.intelligence;
  const intelSummary = intelligence?.summary?.data;
  const platformOrders = summaryData?.platformOrders;
  const unifiedAttention = intelligence?.attention?.data;

  const attentionItems = useMemo(
    () => buildUnifiedAttention({ intelligence, attention: unifiedAttention }),
    [intelligence, unifiedAttention],
  );

  const ordersToday = useMemo(() => {
    const fromFast = businessData?.ordersToday;
    if (fromFast != null && !Number.isNaN(Number(fromFast))) return fromFast;
    const fromIntel = intelligence?.orders?.data?.totals?.ordersToday;
    if (fromIntel != null && !Number.isNaN(Number(fromIntel))) return fromIntel;
    return null;
  }, [businessData?.ordersToday, intelligence?.orders?.data?.totals?.ordersToday]);

  const attentionTotal = useMemo(() => computeAttentionTotalCount(attentionItems), [attentionItems]);
  const hasFastBundle = Boolean(summaryData || businessData);
  const isInitialLoad = fastLoading && !bundle;
  const isRefreshing = Boolean(bundle) && (fastLoading || intelligenceLoading);
  const pendingClaims = summaryData?.attention?.financialClaimsPending;
  const kpiFailed = Boolean(fastError) && !hasFastBundle;
  const intelFailed = Boolean(intelligenceError) && !intelSummary && !intelligenceLoading;

  const intelMetricLoading = (field) =>
    !intelFailed &&
    isMetricMissing(intelSummary?.[field]) &&
    (intelligenceLoading || isInitialLoad);

  const fastMetricLoading = (field) => {
    const value =
      field === "pendingClaims"
        ? summaryData?.attention?.financialClaimsPending
        : businessData?.[field];
    return !kpiFailed && isMetricMissing(value) && isInitialLoad;
  };

  const ordersTodayLoading =
    isMetricMissing(ordersToday) &&
    !kpiFailed &&
    !intelFailed &&
    (isInitialLoad || (hasFastBundle && intelligenceLoading && isMetricMissing(businessData?.ordersToday)));

  const revenueValue = intelSummary?.monthlyRevenueJod ?? businessData?.revenueThisMonthJod;
  const revenueLoading =
    isMetricMissing(revenueValue) &&
    !kpiFailed &&
    !intelFailed &&
    (isInitialLoad || (hasFastBundle && intelligenceLoading && isMetricMissing(intelSummary?.monthlyRevenueJod)));

  const attentionLoading =
    isInitialLoad || (hasFastBundle && intelligenceLoading && attentionItems.length === 0 && !intelligenceError);
  const attentionFailed = Boolean(intelligenceError) && attentionItems.length === 0 && !attentionLoading;

  const platformSummaryLoading = isInitialLoad || (fastLoading && !platformOrders);
  const platformSummaryFailed = kpiFailed && !platformOrders;

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <DashboardPageHeader
        eyebrow="لوحة الإدارة"
        title="مركز التحكم"
        description="نظرة تنفيذية سريعة على المنصة — المؤشرات والمهام الأهم فقط."
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => openCreateOrderModal()}>
              إنشاء طلب
            </button>
            <button
              type="button"
              className={`btn btn-secondary${isRefreshing ? " acc-btn--refreshing" : ""}`}
              onClick={handleRefresh}
              disabled={isInitialLoad}
            >
              <RefreshCw
                size={16}
                strokeWidth={2}
                className={isRefreshing ? "acc-spin" : undefined}
                style={{ verticalAlign: "middle", marginInlineEnd: 4 }}
                aria-hidden
              />
              {isRefreshing ? "جارٍ التحديث…" : "تحديث"}
            </button>
          </>
        }
      />

      <div className="acc-page" dir={dir} lang={locale}>

      {fastError && !bundle ? (
        <p className="acc-notice acc-notice--error" role="alert">
          {fastError}{" "}
          <button type="button" className="acc-notice__btn" onClick={handleRefresh}>
            إعادة المحاولة
          </button>
        </p>
      ) : null}

      {(intelligenceError || fastError) && bundle ? (
        <p className="acc-notice" role="status">
          تعذر تحديث بعض البيانات.{" "}
          <button type="button" className="acc-notice__btn" onClick={handleRefresh}>
            إعادة المحاولة
          </button>
        </p>
      ) : null}

      <section className="acc-section" aria-labelledby="acc-kpi-heading">
        <div className="acc-section__head">
          <h2 id="acc-kpi-heading" className="acc-section__title">
            المؤشرات الرئيسية
          </h2>
        </div>
        <div className="acc-kpi-grid">
          <KpiCard
            label="إجمالي المستخدمين"
            value={intelSummary?.totalUsers}
            loading={intelMetricLoading("totalUsers")}
            failed={intelFailed && isMetricMissing(intelSummary?.totalUsers)}
            refreshing={isRefreshing}
            icon={Users}
          />
          <KpiCard
            label="العملاء"
            value={intelSummary?.totalClients}
            loading={intelMetricLoading("totalClients")}
            failed={intelFailed && isMetricMissing(intelSummary?.totalClients)}
            refreshing={isRefreshing}
            icon={UserRound}
          />
          <KpiCard
            label="المستقلون"
            value={intelSummary?.totalFreelancers}
            loading={intelMetricLoading("totalFreelancers")}
            failed={intelFailed && isMetricMissing(intelSummary?.totalFreelancers)}
            refreshing={isRefreshing}
            icon={Briefcase}
          />
          <KpiCard
            label="اشتراكات نشطة"
            value={businessData?.activeSubscriptions}
            to={SA_ROUTES.subscriptions}
            loading={fastMetricLoading("activeSubscriptions")}
            failed={kpiFailed && isMetricMissing(businessData?.activeSubscriptions)}
            refreshing={isRefreshing}
            icon={CreditCard}
          />
          <KpiCard
            label="طلبات اليوم"
            value={ordersToday}
            loading={ordersTodayLoading}
            failed={(kpiFailed || intelFailed) && isMetricMissing(ordersToday)}
            refreshing={isRefreshing}
            icon={ClipboardList}
          />
          <KpiCard
            label="مطالبات معلّقة"
            value={pendingClaims}
            to={SA_ROUTES.financialClaims}
            loading={fastMetricLoading("pendingClaims")}
            failed={kpiFailed && isMetricMissing(pendingClaims)}
            refreshing={isRefreshing}
            icon={Wallet}
          />
          <KpiCard
            label="إيرادات الشهر"
            value={revenueValue}
            loading={revenueLoading}
            failed={(intelFailed || kpiFailed) && isMetricMissing(revenueValue)}
            refreshing={isRefreshing}
            money
            icon={Banknote}
          />
        </div>
      </section>

      <section className="acc-section" aria-labelledby="acc-attention-heading">
        <div className="acc-section__head">
          <h2 id="acc-attention-heading" className="acc-section__title">
            ما يحتاج انتباهك؟
          </h2>
          {!attentionLoading && !attentionFailed && attentionTotal > 0 ? (
            <p className="acc-section__hint">{formatInt(attentionTotal)} مهمة</p>
          ) : null}
        </div>
        <AttentionList items={attentionItems} loading={attentionLoading} failed={attentionFailed} />
      </section>

      <section className="acc-section" aria-labelledby="acc-actions-heading">
        <div className="acc-section__head">
          <h2 id="acc-actions-heading" className="acc-section__title">
            إجراءات سريعة
          </h2>
        </div>
        <div className="acc-actions-grid">
          {QUICK_ACTIONS.map((action) => (
            <QuickActionCard key={action.key} action={action} onCreateOrder={() => openCreateOrderModal()} />
          ))}
        </div>
      </section>

      <section className="acc-section" aria-labelledby="acc-summary-heading">
        <div className="acc-section__head acc-section__head--stacked">
          <div className="acc-section__head-main">
            <h2 id="acc-summary-heading" className="acc-section__title">
              حالة طلبات المنصة
            </h2>
            <p className="acc-section__desc">
              جميع طلبات العملاء والمستقلين على المنصة — لا تشمل الطلبات الداخلية والتجريبية للإدارة.
            </p>
          </div>
        </div>
        <div className="acc-summary-grid">
          <SummaryMetricCard
            label="مفتوحة على المنصة"
            value={platformOrders?.openProjects}
            tone="open"
            icon={FolderOpen}
            loading={platformSummaryLoading}
            failed={platformSummaryFailed}
            title="طلبات بحالة مفتوحة أو بانتظار على المنصة"
          />
          <SummaryMetricCard
            label="قيد التنفيذ"
            value={platformOrders?.inProgressProjects}
            tone="progress"
            icon={Clock}
            loading={platformSummaryLoading}
            failed={platformSummaryFailed}
            title="طلبات قيد التنفيذ على المنصة"
          />
          <SummaryMetricCard
            label="مكتملة"
            value={platformOrders?.completedProjects}
            tone="done"
            icon={CheckCircle2}
            loading={platformSummaryLoading}
            failed={platformSummaryFailed}
            title="طلبات مكتملة على المنصة"
          />
        </div>
      </section>
      </div>
    </>
  );
}
