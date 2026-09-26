import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import {
  CalendarRange,
  Eye,
  Filter,
  MoreVertical,
  RefreshCw,
  Search,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useClientCreateOrderModal } from "../../../context/ClientCreateOrderModalContext";
import { useSuperAdminDashboardHomeBundle } from "../../../hooks/useSuperAdminDashboardHomeBundle";
import { formatInt, formatMoneyJod, LABEL_UNAVAILABLE } from "./superAdminHomeBundleUi";
import { SA_ROUTES, resolveSuperAdminDashboardHomeLink } from "./superAdminHomeDataUtils";
import {
  activationStatusLabel,
  formatFreelancerDisplayName,
  formatPlanPriceLabel,
  formatSubscriptionAdminDateTime,
  resolveSubscriptionPlanTitle,
  subscriptionStatusLabel,
} from "../../../admin/subscriptions/subscriptionAdminDisplay";
import { resolveFreelancerWhatsapp } from "../../../admin/subscriptions/subscriptionWhatsApp";
import SubscriptionWhatsAppModal from "../../../pages/dashboard/SubscriptionWhatsAppModal";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../styles/adminOverviewSoft.css";

const MAX_ROWS = 6;
const SEARCH_DEBOUNCE_MS = 250;
const WEEKDAY_AR = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

const LIST_TABS = [
  { id: "all", label: "الكل" },
  { id: "today", label: "اليوم" },
  { id: "followup", label: "بحاجة متابعة" },
];

function isMissing(value) {
  return value === null || value === undefined || Number.isNaN(Number(value));
}

function formatMetric(value, { money = false, failed = false } = {}) {
  if (failed) return "غير متاح";
  if (isMissing(value)) return LABEL_UNAVAILABLE;
  return money ? formatMoneyJod(value) : formatInt(value);
}

function paidAt(sub) {
  return sub?.paidAt || sub?.assignedAt || sub?.createdAt || null;
}

function isPaidToday(sub) {
  const raw = paidAt(sub);
  if (!raw) return false;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function needsFollowUp(sub) {
  const activation = String(sub?.activationStatus || "").toLowerCase();
  return activation.includes("pending") || activation === "company_pending";
}

function initialOf(name) {
  return String(name || "?").trim().slice(0, 1).toUpperCase() || "?";
}

function buildCopyText(sub) {
  const lines = [`الاسم: ${formatFreelancerDisplayName(sub)}`];
  if (sub?.freelancer?.email) lines.push(`البريد: ${sub.freelancer.email}`);
  if (sub?.freelancer?.phone) lines.push(`الهاتف: ${sub.freelancer.phone}`);
  if (sub?.freelancer?.whatsapp) lines.push(`واتساب: ${sub.freelancer.whatsapp}`);
  const planTitle = resolveSubscriptionPlanTitle(sub);
  if (planTitle) lines.push(`الباقة: ${planTitle}`);
  const price = formatPlanPriceLabel(sub?.plan);
  if (price && price !== "—") lines.push(`سعر الباقة: ${price}`);
  lines.push(`حالة التفعيل: ${activationStatusLabel(sub?.activationStatus)}`);
  lines.push(`حالة الاشتراك: ${subscriptionStatusLabel(sub?.status)}`);
  return lines.join("\n");
}

function statusPill(sub) {
  if (needsFollowUp(sub)) {
    return { label: activationStatusLabel(sub?.activationStatus) || "بانتظار التفعيل", tone: "warn" };
  }
  const status = String(sub?.status || "").toLowerCase();
  if (status === "active") return { label: "نشط", tone: "ok" };
  if (status.includes("cancel") || status === "expired") return { label: subscriptionStatusLabel(sub?.status), tone: "muted" };
  return { label: subscriptionStatusLabel(sub?.status) || "مدفوع", tone: "info" };
}

function SoftKpiCard({ icon: Icon, label, value, delta, deltaTone = "neutral", loading, failed, money, to }) {
  const display = formatMetric(value, { money, failed });
  const muted = display === LABEL_UNAVAILABLE || display === "غير متاح";
  const body = (
    <>
      <div className="aos-kpi__icon" aria-hidden>
        {Icon ? <Icon size={18} strokeWidth={2} /> : null}
      </div>
      <p className="aos-kpi__label">{label}</p>
      <div className="aos-kpi__row">
        {loading ? (
          <span className="aos-kpi__skel" aria-hidden />
        ) : (
          <strong className={`aos-kpi__value${muted ? " aos-kpi__value--muted" : ""}`}>{display}</strong>
        )}
        {delta ? <span className={`aos-kpi__delta aos-kpi__delta--${deltaTone}`}>{delta}</span> : null}
      </div>
    </>
  );
  const safeTo = resolveSuperAdminDashboardHomeLink(to);
  if (safeTo && !loading && !muted) {
    return (
      <NavLink to={safeTo} className="aos-kpi">
        {body}
      </NavLink>
    );
  }
  return <div className="aos-kpi">{body}</div>;
}

function RevenueBarsChart({ series }) {
  const max = Math.max(1, ...series.map((r) => Number(r.revenueJod) || 0));
  if (!series.length) {
    return <p className="aos-chart__empty">لا تتوفر بيانات إيرادات لهذه الفترة بعد.</p>;
  }

  return (
    <div className="aos-bars" role="img" aria-label="مخطط إيرادات الأيام الأخيرة">
      {series.map((row, i) => {
        const value = Number(row.revenueJod) || 0;
        const pct = Math.max(8, Math.round((value / max) * 100));
        const label = String(row.date || "").slice(5).replace("-", "/");
        const top = Math.min(42, Math.round(pct * 0.38));
        const mid = Math.min(34, Math.round(pct * 0.32));
        const base = Math.max(12, pct - top - mid);
        return (
          <div key={row.date || i} className="aos-bars__col" title={formatMoneyJod(value)}>
            <div className="aos-bars__stack" style={{ height: `${pct}%` }}>
              <span className="aos-bars__seg aos-bars__seg--a" style={{ flexGrow: top }} />
              <span className="aos-bars__seg aos-bars__seg--b" style={{ flexGrow: mid }} />
              <span className="aos-bars__seg aos-bars__seg--c" style={{ flexGrow: base }} />
            </div>
            <span className="aos-bars__label">{label || "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

function WeeklyBarsChart({ days, highlightIndex }) {
  const max = Math.max(1, ...days.map((d) => Number(d.value) || 0));
  if (!days.length) {
    return <p className="aos-chart__empty">لا تتوفر بيانات أسبوعية بعد.</p>;
  }

  return (
    <div className="aos-week" role="img" aria-label="المشتركون خلال الأسبوع">
      {days.map((day, i) => {
        const value = Number(day.value) || 0;
        const pct = Math.max(10, Math.round((value / max) * 100));
        const active = i === highlightIndex;
        return (
          <div key={day.key} className={`aos-week__col${active ? " is-active" : ""}`}>
            <div className="aos-week__bar-wrap">
              <span className="aos-week__bar" style={{ height: `${pct}%` }} title={formatInt(value)} />
            </div>
            <span className="aos-week__label">{day.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function SoftDonut({ slices }) {
  const total = slices.reduce((s, x) => s + (Number(x.value) || 0), 0);
  if (total <= 0) {
    return <p className="aos-chart__empty">لا تتوفر بيانات للتوزيع بعد.</p>;
  }

  let cursor = 0;
  const stops = slices
    .map((slice) => {
      const v = Number(slice.value) || 0;
      const start = cursor;
      const end = cursor + (v / total) * 100;
      cursor = end;
      return `${slice.color} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="aos-donut">
      <div className="aos-donut__ring" style={{ background: `conic-gradient(${stops})` }} aria-hidden />
      <ul className="aos-donut__legend">
        {slices.map((slice) => (
          <li key={slice.id}>
            <span className="aos-donut__swatch" style={{ background: slice.color }} aria-hidden />
            <span className="aos-donut__name">{slice.label}</span>
            <strong className="aos-donut__value">{formatInt(slice.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SoftRings({ items }) {
  if (!items?.length) return <p className="aos-chart__empty">لا تتوفر بيانات بعد.</p>;
  return (
    <div className="aos-rings">
      {items.map((item) => {
        const pct = Math.max(0, Math.min(100, Number(item.pct) || 0));
        return (
          <div key={item.id} className="aos-ring">
            <div
              className="aos-ring__circle"
              style={{
                background: `conic-gradient(${item.color} ${pct}%, #e8edf5 ${pct}% 100%)`,
              }}
              title={`${formatInt(item.value)}`}
            >
              <span className="aos-ring__value">{Math.round(pct)}%</span>
            </div>
            <span className="aos-ring__label">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function SoftHBars({ rows }) {
  if (!rows?.length) return <p className="aos-chart__empty">لا تتوفر بيانات باقات بعد.</p>;
  const max = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  return (
    <div className="aos-hbars">
      {rows.map((row) => {
        const value = Number(row.value) || 0;
        const pct = Math.max(6, Math.round((value / max) * 100));
        return (
          <div key={row.id} className="aos-hbar">
            <div className="aos-hbar__top">
              <span className="aos-hbar__name">{row.label}</span>
              <span className="aos-hbar__meta">{formatInt(value)}</span>
            </div>
            <div className="aos-hbar__track" aria-hidden>
              <span className="aos-hbar__fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SoftPulseList({ items }) {
  if (!items?.length) return <p className="aos-chart__empty">لا توجد تنبيهات حالياً.</p>;
  return (
    <div className="aos-pulse">
      {items.map((item) => {
        const inner = (
          <>
            <span className={`aos-pulse__dot${item.tone ? ` aos-pulse__dot--${item.tone}` : ""}`}>
              {formatInt(item.count)}
            </span>
            <span className="aos-pulse__text">
              <strong className="aos-pulse__title">{item.title}</strong>
              {item.sub ? <p className="aos-pulse__sub">{item.sub}</p> : null}
            </span>
          </>
        );
        if (item.to) {
          return (
            <NavLink key={item.id} to={item.to} className="aos-pulse__item">
              {inner}
            </NavLink>
          );
        }
        return (
          <div key={item.id} className="aos-pulse__item">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function SoftMonthCompare({ metrics }) {
  if (!metrics?.length) return <p className="aos-chart__empty">لا تتوفر مقارنة شهرية بعد.</p>;
  return (
    <div className="aos-compare">
      {metrics.map((m) => {
        const tone = m.trend === "up" ? "up" : m.trend === "down" ? "down" : "flat";
        const delta =
          m.changePct == null
            ? "—"
            : `${m.changePct > 0 ? "+" : ""}${Number(m.changePct).toFixed(0)}%`;
        return (
          <div key={m.key} className="aos-compare__row">
            <span className="aos-compare__label">{m.label}</span>
            <div className="aos-compare__vals">
              <strong className="aos-compare__current">
                {m.money ? formatMoneyJod(m.current) : formatInt(m.current)}
              </strong>
              <span className={`aos-compare__trend aos-compare__trend--${tone}`}>{delta}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RowActionsMenu({ open, onOpenChange, viewTo, onWhatsApp, onCopy, canWhatsApp }) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 168;
      const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
      setPos({ top: r.bottom + 6, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const t = e.target;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const panel =
    open && pos
      ? createPortal(
          <div ref={panelRef} className="aos-row-menu__panel" role="menu" style={{ top: pos.top, left: pos.left }}>
            <NavLink
              to={viewTo}
              role="menuitem"
              className="aos-row-menu__item"
              onClick={() => onOpenChange(false)}
            >
              عرض الاشتراك
            </NavLink>
            {canWhatsApp ? (
              <button
                type="button"
                role="menuitem"
                className="aos-row-menu__item"
                onClick={() => {
                  onOpenChange(false);
                  onWhatsApp();
                }}
              >
                واتساب
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="aos-row-menu__item"
              onClick={() => {
                onOpenChange(false);
                onCopy();
              }}
            >
              نسخ البيانات
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="aos-row-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`aos-row-menu__trigger${open ? " is-open" : ""}`}
        aria-label="إجراءات الاشتراك"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <MoreVertical size={18} strokeWidth={2.25} aria-hidden />
      </button>
      {panel}
    </div>
  );
}

export default function SuperAdminProductAnalytics() {
  const { dir, locale } = useTranslation();
  const { openModal: openCreateOrderModal } = useClientCreateOrderModal();
  const {
    data: bundle,
    fastLoading,
    intelligenceLoading,
    posthogLoading,
    executiveLoading,
    fastError,
    intelligenceError,
    requestIntelligence,
    requestPosthog,
    requestExecutive,
    refresh,
  } = useSuperAdminDashboardHomeBundle({ preset: "7d", posthogRange: "7d", cacheKey: "7d" });

  useEffect(() => {
    if (!fastLoading && bundle) {
      requestIntelligence();
      requestPosthog();
      requestExecutive();
    }
  }, [fastLoading, bundle, requestIntelligence, requestPosthog, requestExecutive]);

  const summaryData = bundle?.summary;
  const businessData = bundle?.businessKpis;
  const intelSummary = bundle?.intelligence?.summary?.data;
  const platformOrders = summaryData?.platformOrders;
  const paidSubscriptions = bundle?.paidSubscriptions;
  const paidSubsRecent = paidSubscriptions?.recent || [];
  const posthog = bundle?.posthog;

  const hasFastBundle = Boolean(summaryData || businessData);
  const isInitialLoad = fastLoading && !bundle;
  const isRefreshing =
    Boolean(bundle) && (fastLoading || intelligenceLoading || posthogLoading || executiveLoading);
  const kpiFailed = Boolean(fastError) && !hasFastBundle;
  const intelFailed = Boolean(intelligenceError) && !intelSummary && !intelligenceLoading;

  const visitorsValue = posthog?.kpis?.visitorsToday ?? posthog?.kpis?.uniqueVisitors;
  const freelancersValue = intelSummary?.totalFreelancers;
  const clientsValue = intelSummary?.totalClients;
  const revenueValue = intelSummary?.monthlyRevenueJod ?? businessData?.revenueThisMonthJod;
  const revenueToday = businessData?.revenueTodayJod;
  const projectsOpen = Number(platformOrders?.openProjects || 0) + Number(platformOrders?.inProgressProjects || 0);
  const ordersIntel = bundle?.intelligence?.orders?.data;
  const subsIntel = bundle?.intelligence?.subscriptions?.data;
  const coursesIntel = bundle?.intelligence?.courses?.data;
  const attentionData = bundle?.intelligence?.attention?.data;
  const executiveMetrics = bundle?.intelligence?.executiveKpis?.data;

  const visitorsLoading = isMissing(visitorsValue) && (posthogLoading || isInitialLoad);
  const revenueLoading =
    isMissing(revenueValue) &&
    !kpiFailed &&
    !intelFailed &&
    (isInitialLoad || (hasFastBundle && intelligenceLoading && isMissing(intelSummary?.monthlyRevenueJod)));
  const usersLoading = !intelFailed && isMissing(freelancersValue) && (intelligenceLoading || isInitialLoad);

  const revenueSeries = useMemo(() => {
    const rows = Array.isArray(businessData?.revenueByDay) ? businessData.revenueByDay : [];
    return rows
      .map((r) => ({
        date: String(r.date || r.day || "").slice(0, 10),
        revenueJod: Number(r.revenueJod ?? r.revenue_jod) || 0,
      }))
      .filter((r) => r.date)
      .slice(-7);
  }, [businessData?.revenueByDay]);

  const weekDays = useMemo(() => {
    const counts = Array.from({ length: 7 }, (_, i) => ({
      key: String(i),
      label: WEEKDAY_AR[i],
      value: 0,
    }));
    for (const sub of paidSubsRecent) {
      const raw = paidAt(sub);
      if (!raw) continue;
      const d = new Date(raw);
      if (!Number.isFinite(d.getTime())) continue;
      counts[d.getDay()].value += 1;
    }
    return counts;
  }, [paidSubsRecent]);

  const weekHighlight = useMemo(() => {
    let best = 0;
    weekDays.forEach((d, i) => {
      if (d.value > weekDays[best].value) best = i;
    });
    return best;
  }, [weekDays]);

  const weekTotal = useMemo(() => weekDays.reduce((s, d) => s + d.value, 0), [weekDays]);

  const distributionSlices = useMemo(() => {
    const clients = Number(clientsValue) || 0;
    const freelancers = Number(freelancersValue) || 0;
    const projects = Number(projectsOpen) || 0;
    return [
      { id: "clients", label: "العملاء", value: clients, color: "#8b7fd4" },
      { id: "freelancers", label: "المستقلون", value: freelancers, color: "#5bb8ae" },
      { id: "projects", label: "مشاريع نشطة", value: projects, color: "#93c5fd" },
    ];
  }, [clientsValue, freelancersValue, projectsOpen]);

  const orderRings = useMemo(() => {
    const completed = Number(ordersIntel?.totals?.completedOrders ?? intelSummary?.completedOrders) || 0;
    const open = Number(ordersIntel?.totals?.pendingOrders ?? intelSummary?.openOrders) || 0;
    const cancelled = Number(ordersIntel?.totals?.cancelledOrders ?? intelSummary?.cancelledOrders) || 0;
    const total = Math.max(1, completed + open + cancelled);
    return [
      { id: "done", label: "مكتملة", value: completed, pct: (completed / total) * 100, color: "#5bb8ae" },
      { id: "open", label: "مفتوحة", value: open, pct: (open / total) * 100, color: "#8b7fd4" },
      { id: "cancel", label: "ملغاة", value: cancelled, pct: (cancelled / total) * 100, color: "#f59e0b" },
    ];
  }, [ordersIntel, intelSummary]);

  const topPlans = useMemo(() => {
    const rows = Array.isArray(subsIntel?.byPlan) ? subsIntel.byPlan : [];
    return rows.slice(0, 5).map((p) => ({
      id: String(p.planId || p.planTitle),
      label: p.planTitle || `باقة #${p.planId}`,
      value: Number(p.activeSubscribers || p.subscribers) || 0,
    }));
  }, [subsIntel]);

  const pulseItems = useMemo(() => {
    const items = [];
    const alerts = Array.isArray(attentionData?.alerts) ? attentionData.alerts : [];
    for (const a of alerts.slice(0, 4)) {
      items.push({
        id: a.key || a.title,
        title: a.title || "تنبيه",
        count: a.count,
        to: resolveSuperAdminDashboardHomeLink(a.path),
        tone: "warn",
        sub: "يتطلب متابعة",
      });
    }
    const pendingSubs = Number(subsIntel?.totals?.pendingActivation ?? intelSummary?.pendingSubscriptions) || 0;
    if (pendingSubs > 0 && !items.some((x) => String(x.id).includes("pending"))) {
      items.push({
        id: "pending-activation",
        title: "تفعيل اشتراكات معلّق",
        count: pendingSubs,
        to: SA_ROUTES.subscriptions,
        tone: "warn",
      });
    }
    const claims = Number(intelSummary?.pendingFinancialClaims) || 0;
    if (claims > 0) {
      items.push({
        id: "claims",
        title: "مطالبات مالية معلّقة",
        count: claims,
        to: SA_ROUTES.financialClaims,
        tone: "mint",
      });
    }
    const stuck = Number(coursesIntel?.totals?.stuckAbove80Percent) || 0;
    if (stuck > 0) {
      items.push({
        id: "stuck-courses",
        title: "متعلمون عالقون فوق 80%",
        count: stuck,
        to: SA_ROUTES.courses,
        tone: null,
      });
    }
    return items.slice(0, 5);
  }, [attentionData, subsIntel, intelSummary, coursesIntel]);

  const monthCompare = useMemo(() => {
    const rows = Array.isArray(executiveMetrics) ? executiveMetrics : [];
    const prefer = ["revenueThisMonth", "ordersThisMonth", "totalUsers", "activeSubscriptions", "totalClients"];
    const picked = [];
    for (const key of prefer) {
      const hit = rows.find((r) => r.key === key);
      if (hit) picked.push(hit);
    }
    if (!picked.length) return rows.slice(0, 4);
    return picked.slice(0, 5);
  }, [executiveMetrics]);

  const courseRings = useMemo(() => {
    const enrolled = Number(coursesIntel?.totals?.studentsEnrolled ?? intelSummary?.enrolledStudents) || 0;
    const published = Number(coursesIntel?.totals?.publishedCourses) || 0;
    const examRate = Number(coursesIntel?.totals?.finalExamCompletionRate) || 0;
    const totalCourses = Number(coursesIntel?.totals?.totalCourses ?? intelSummary?.totalCourses) || 0;
    const freelancers = Number(freelancersValue) || 0;
    return [
      {
        id: "exam",
        label: "إكمال الاختبار",
        value: examRate,
        pct: examRate,
        color: "#8b7fd4",
      },
      {
        id: "pub",
        label: "دورات منشورة",
        value: published,
        pct: totalCourses > 0 ? (published / totalCourses) * 100 : 0,
        color: "#5bb8ae",
      },
      {
        id: "enroll",
        label: "مسجّلون",
        value: enrolled,
        pct: freelancers > 0 ? Math.min(100, (enrolled / freelancers) * 100) : 0,
        color: "#93c5fd",
      },
    ];
  }, [coursesIntel, intelSummary, freelancersValue]);

  const [listTab, setListTab] = useState("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef(null);
  const [menuId, setMenuId] = useState(null);
  const [whatsAppSub, setWhatsAppSub] = useState(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const tabCounts = useMemo(() => {
    const all = paidSubsRecent.length;
    const today = paidSubsRecent.filter(isPaidToday).length;
    const followup = paidSubsRecent.filter(needsFollowUp).length;
    return { all, today, followup };
  }, [paidSubsRecent]);

  const filteredSubs = useMemo(() => {
    let rows = paidSubsRecent;
    if (listTab === "today") rows = rows.filter(isPaidToday);
    if (listTab === "followup") rows = rows.filter(needsFollowUp);
    if (searchQuery) {
      rows = rows.filter((sub) => {
        const blob = [
          formatFreelancerDisplayName(sub),
          sub?.freelancer?.email,
          resolveSubscriptionPlanTitle(sub),
          sub?.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(searchQuery);
      });
    }
    return rows.slice(0, MAX_ROWS);
  }, [paidSubsRecent, listTab, searchQuery]);

  const paidSubsLoading = isInitialLoad || (fastLoading && !paidSubscriptions);
  const paidSubsFailed = kpiFailed && !paidSubscriptions;
  const chartLoading = paidSubsLoading && !revenueSeries.length;

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  const handleCopy = useCallback(async (sub) => {
    try {
      await navigator.clipboard?.writeText(buildCopyText(sub));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <>
      <div className="aos-page" dir={dir} lang={locale}>
        <header className="aos-dash-head">
          <div className="aos-dash-head__titles">
            <h1 className="aos-dash-head__title">نظرة عامة</h1>
            <p className="aos-dash-head__desc">ملخص سريع لحركة المنصة خلال آخر 7 أيام</p>
          </div>
          <div className="aos-dash-head__tools">
            <span className="aos-tool">
              <CalendarRange size={14} strokeWidth={2} aria-hidden />
              آخر 7 أيام
            </span>
            <button type="button" className="aos-tool aos-tool--btn" onClick={() => openCreateOrderModal()}>
              إنشاء طلب
            </button>
            <NavLink to={SA_ROUTES.analysis} className="aos-tool aos-tool--btn">
              <Filter size={14} strokeWidth={2} aria-hidden />
              تحليلات
            </NavLink>
            <button
              type="button"
              className="aos-tool aos-tool--btn"
              onClick={handleRefresh}
              disabled={isInitialLoad}
            >
              <RefreshCw size={14} strokeWidth={2} className={isRefreshing ? "aos-spin" : undefined} aria-hidden />
              {isRefreshing ? "تحديث…" : "تحديث"}
            </button>
          </div>
        </header>

        {fastError && !bundle ? (
          <p className="aos-notice aos-notice--error" role="alert">
            {fastError}{" "}
            <button type="button" className="aos-notice__btn" onClick={handleRefresh}>
              إعادة المحاولة
            </button>
          </p>
        ) : null}

        {(intelligenceError || fastError) && bundle ? (
          <p className="aos-notice" role="status">
            تعذر تحديث بعض البيانات.{" "}
            <button type="button" className="aos-notice__btn" onClick={handleRefresh}>
              إعادة المحاولة
            </button>
          </p>
        ) : null}

        <section className="aos-kpi-grid" aria-label="المؤشرات الرئيسية">
          <SoftKpiCard
            icon={Eye}
            label="الزيارات"
            value={visitorsValue}
            loading={visitorsLoading}
            failed={!posthogLoading && isMissing(visitorsValue) && Boolean(bundle)}
            delta={!isMissing(posthog?.kpis?.activeUsersToday) ? `${formatInt(posthog.kpis.activeUsersToday)} نشط` : null}
            deltaTone="up"
          />
          <SoftKpiCard
            icon={Wallet}
            label="الإيرادات"
            value={revenueValue}
            money
            loading={revenueLoading}
            failed={(intelFailed || kpiFailed) && isMissing(revenueValue)}
            delta={!isMissing(revenueToday) ? formatMoneyJod(revenueToday) : null}
            deltaTone="up"
          />
          <SoftKpiCard
            icon={Users}
            label="المستقلون"
            value={freelancersValue}
            loading={usersLoading}
            failed={intelFailed && isMissing(freelancersValue)}
            delta={!isMissing(clientsValue) ? `${formatInt(clientsValue)} عميل` : null}
            deltaTone="neutral"
            to={SA_ROUTES.users}
          />
        </section>

        <section className="aos-mid-grid" aria-label="المخططات">
          <article className="aos-card aos-card--wide">
            <header className="aos-card__head">
              <div>
                <h2 className="aos-card__title">نظرة الإيرادات</h2>
                <p className="aos-card__desc">توزيع الإيراد اليومي خلال الأسبوع</p>
              </div>
              <span className="aos-chip">إيرادات</span>
            </header>
            {chartLoading ? <p className="aos-chart__empty">جارٍ تحميل المخطط…</p> : <RevenueBarsChart series={revenueSeries} />}
          </article>

          <article className="aos-card">
            <header className="aos-card__head">
              <div>
                <h2 className="aos-card__title">المشتركون</h2>
                <p className="aos-card__desc">حسب يوم الأسبوع</p>
              </div>
              <strong className="aos-card__metric">{formatInt(weekTotal)}</strong>
            </header>
            {paidSubsLoading && !weekTotal ? (
              <p className="aos-chart__empty">جارٍ التحميل…</p>
            ) : (
              <WeeklyBarsChart days={weekDays} highlightIndex={weekHighlight} />
            )}
          </article>
        </section>

        <section className="aos-insight-grid" aria-label="تحليلات المنصة">
          <article className="aos-card">
            <header className="aos-card__head">
              <div>
                <h2 className="aos-card__title">حالة الطلبات</h2>
                <p className="aos-card__desc">نسب المكتمل والمفتوح والملغى</p>
              </div>
            </header>
            {intelligenceLoading && !ordersIntel && !intelSummary ? (
              <p className="aos-chart__empty">جارٍ التحميل…</p>
            ) : (
              <SoftRings items={orderRings} />
            )}
          </article>

          <article className="aos-card">
            <header className="aos-card__head">
              <div>
                <h2 className="aos-card__title">أشهر الباقات</h2>
                <p className="aos-card__desc">المشتركون النشطون حسب الباقة</p>
              </div>
            </header>
            {intelligenceLoading && !subsIntel ? (
              <p className="aos-chart__empty">جارٍ التحميل…</p>
            ) : (
              <SoftHBars rows={topPlans} />
            )}
          </article>

          <article className="aos-card">
            <header className="aos-card__head">
              <div>
                <h2 className="aos-card__title">نبض المتابعة</h2>
                <p className="aos-card__desc">تنبيهات تحتاج تدخلاً الآن</p>
              </div>
            </header>
            <SoftPulseList items={pulseItems} />
          </article>
        </section>

        <section className="aos-extra-grid" aria-label="مقارنات إضافية">
          <article className="aos-card">
            <header className="aos-card__head">
              <div>
                <h2 className="aos-card__title">مقارنة الشهر</h2>
                <p className="aos-card__desc">التغيّر منذ بداية الشهر / مقابل الشهر السابق</p>
              </div>
            </header>
            {executiveLoading && !monthCompare.length ? (
              <p className="aos-chart__empty">جارٍ التحميل…</p>
            ) : (
              <SoftMonthCompare metrics={monthCompare} />
            )}
          </article>

          <article className="aos-card">
            <header className="aos-card__head">
              <div>
                <h2 className="aos-card__title">مسار الدورات</h2>
                <p className="aos-card__desc">
                  {coursesIntel?.highlights?.mostJoinedCourse?.title
                    ? `الأكثر انضماماً: ${coursesIntel.highlights.mostJoinedCourse.title}`
                    : "إكمال الاختبار والنشر والتسجيل"}
                </p>
              </div>
            </header>
            {intelligenceLoading && !coursesIntel ? (
              <p className="aos-chart__empty">جارٍ التحميل…</p>
            ) : (
              <SoftRings items={courseRings} />
            )}
          </article>
        </section>

        <section className="aos-bot-grid" aria-label="التوزيع والقائمة">
          <article className="aos-card">
            <header className="aos-card__head">
              <div>
                <h2 className="aos-card__title">توزيع النشاط</h2>
                <p className="aos-card__desc">عملاء، مستقلون، ومشاريع نشطة</p>
              </div>
            </header>
            {usersLoading && projectsOpen === 0 ? (
              <p className="aos-chart__empty">جارٍ التحميل…</p>
            ) : (
              <SoftDonut slices={distributionSlices} />
            )}
          </article>

          <section className="aos-list-panel" aria-labelledby="aos-list-title">
            <header className="aos-list-head">
              <div className="aos-list-head__top">
                <div>
                  <h2 id="aos-list-title" className="aos-list-head__title">
                    الاشتراكات المدفوعة
                  </h2>
                  <p className="aos-list-head__desc">
                    {paidSubsLoading
                      ? "جارٍ التحميل…"
                      : `${formatInt(filteredSubs.length)} من أصل ${formatInt(paidSubsRecent.length)}`}
                  </p>
                </div>
                <div className="aos-list-head__actions">
                  <NavLink to={SA_ROUTES.subscriptions} className="aos-see-all">
                    عرض الكل
                  </NavLink>
                  <div className={`aos-search${searchOpen ? " is-open" : ""}`}>
                    {searchOpen ? (
                      <>
                        <Search size={15} strokeWidth={2} aria-hidden />
                        <input
                          ref={searchRef}
                          type="search"
                          value={searchInput}
                          onChange={(e) => setSearchInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setSearchOpen(false);
                              setSearchInput("");
                            }
                          }}
                          placeholder="بحث بالاسم أو البريد"
                          aria-label="بحث في الاشتراكات"
                        />
                        <button
                          type="button"
                          className="aos-search__clear"
                          aria-label="إغلاق البحث"
                          onClick={() => {
                            setSearchOpen(false);
                            setSearchInput("");
                          }}
                        >
                          <X size={14} strokeWidth={2.25} aria-hidden />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="aos-search__btn"
                        aria-label="بحث"
                        onClick={() => setSearchOpen(true)}
                      >
                        <Search size={18} strokeWidth={2} aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="aos-tabs" role="tablist" aria-label="تصفية الاشتراكات">
                {LIST_TABS.map((tab) => {
                  const count = tabCounts[tab.id];
                  const active = listTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`aos-tab${active ? " is-active" : ""}`}
                      onClick={() => setListTab(tab.id)}
                    >
                      <span>{tab.label}</span>
                      {count > 0 ? <span className="aos-tab__badge">{formatInt(count)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </header>

            {paidSubsFailed ? (
              <p className="aos-empty">تعذر تحميل الاشتراكات المدفوعة.</p>
            ) : paidSubsLoading ? (
              <p className="aos-empty">جارٍ تحميل الاشتراكات…</p>
            ) : filteredSubs.length === 0 ? (
              <p className="aos-empty">لا توجد اشتراكات مطابقة حالياً.</p>
            ) : (
              <div className="aos-table-wrap">
                <table className="aos-table">
                  <thead>
                    <tr>
                      <th>المستقل</th>
                      <th className="aos-col--plan">الباقة</th>
                      <th className="aos-col--status">الحالة</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubs.map((sub) => {
                      const id = String(sub.id);
                      const name = formatFreelancerDisplayName(sub);
                      const email = sub?.freelancer?.email || "—";
                      const plan = resolveSubscriptionPlanTitle(sub) || "—";
                      const pill = statusPill(sub);
                      const wa = resolveFreelancerWhatsapp(sub);
                      const viewTo = `${SA_ROUTES.subscriptions}?search=${encodeURIComponent(sub?.id ?? "")}`;
                      return (
                        <tr key={id}>
                          <td>
                            <div className="aos-person">
                              <span className="aos-person__avatar" aria-hidden>
                                {initialOf(name)}
                              </span>
                              <span className="aos-person__text">
                                <strong className="aos-person__name">{name}</strong>
                                <span className="aos-person__sub" dir="ltr">
                                  {email}
                                </span>
                              </span>
                            </div>
                          </td>
                          <td className="aos-col--plan">
                            <div className="aos-stack">
                              <span className="aos-stack__primary">{plan}</span>
                              <span className="aos-stack__sub">{formatSubscriptionAdminDateTime(paidAt(sub))}</span>
                            </div>
                          </td>
                          <td className="aos-col--status">
                            <span className={`aos-pill aos-pill--${pill.tone}`}>{pill.label}</span>
                          </td>
                          <td>
                            <RowActionsMenu
                              open={menuId === id}
                              onOpenChange={(next) => setMenuId(next ? id : null)}
                              viewTo={viewTo}
                              canWhatsApp={Boolean(wa.normalized)}
                              onWhatsApp={() => setWhatsAppSub(sub)}
                              onCopy={() => handleCopy(sub)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      </div>

      <SubscriptionWhatsAppModal
        open={Boolean(whatsAppSub)}
        subscription={whatsAppSub}
        planTitle={whatsAppSub ? resolveSubscriptionPlanTitle(whatsAppSub) || "" : ""}
        onClose={() => setWhatsAppSub(null)}
      />
    </>
  );
}
