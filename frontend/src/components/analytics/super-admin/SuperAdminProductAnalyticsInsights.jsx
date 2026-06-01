import { useMemo, useState } from "react";
import { useSuperAdminAnalyticsOverview } from "../../../hooks/useSuperAdminAnalyticsOverview";
import DashboardEmptyState from "../../dashboard/DashboardEmptyState";
import "./super-admin-analytics.css";

const EVENT_LABELS_AR = {
  signup_completed: "تسجيل مكتمل",
  user_logged_in: "تسجيل دخول",
  client_order_created: "طلب جديد",
  fixed_order_taken: "طلب ثابت مأخوذ",
  bid_submitted: "عرض سعر مقدّم",
  order_completed: "طلب مكتمل",
  subscription_purchased: "اشتراك مشترى",
  financial_claim_submitted: "مطالبة مالية",
};

const ALL_EVENT_KEYS = [
  "signup_completed",
  "user_logged_in",
  "client_order_created",
  "subscription_purchased",
  "order_completed",
  "fixed_order_taken",
  "bid_submitted",
  "financial_claim_submitted",
];

const RANGE_LABELS = {
  today: "اليوم",
  "7d": "آخر 7 أيام",
  "30d": "آخر 30 يوماً",
};

function formatInt(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("ar-JO-u-nu-latn").format(Math.trunc(Number(value)));
}

function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${new Intl.NumberFormat("ar-JO-u-nu-latn", { maximumFractionDigits: 1 }).format(Number(value) * 100)}٪`;
}

function EventsTable({ events }) {
  return (
    <div className="sa-events-table-wrap">
      <table className="sa-events-table">
        <thead>
          <tr>
            <th scope="col">الحدث</th>
            <th scope="col">العدد</th>
          </tr>
        </thead>
        <tbody>
          {ALL_EVENT_KEYS.map((key) => (
            <tr key={key}>
              <td>{EVENT_LABELS_AR[key]}</td>
              <td>{formatInt(events[key] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConversionStrip({ conversion }) {
  const steps = [
    { label: "تسجيل", value: conversion.signups },
    { label: "دخول", value: conversion.logins },
    { label: "اشتراك", value: conversion.subscriptionsPurchased },
    { label: "طلب مكتمل", value: conversion.ordersCompleted },
  ];

  return (
    <div className="sa-conversion-strip">
      <div className="sa-conversion-strip__flow">
        {steps.map((step, idx) => (
          <div key={step.label} className="sa-conversion-strip__item">
            {idx > 0 ? (
              <span className="sa-conversion-strip__arrow" aria-hidden>
                ←
              </span>
            ) : null}
            <div className="sa-conversion-strip__step">
              <span className="sa-conversion-strip__label">{step.label}</span>
              <strong className="sa-conversion-strip__value">{formatInt(step.value)}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="sa-conversion-strip__ratio">
        <span>نسبة دخول / تسجيل</span>
        <strong>{conversion.signupToLoginRatio == null ? "—" : formatPct(conversion.signupToLoginRatio)}</strong>
      </div>
    </div>
  );
}

function TopPagesList({ rows }) {
  const maxViews = useMemo(() => Math.max(...rows.map((r) => Number(r.pageViews) || 0), 1), [rows]);

  return (
    <ul className="sa-pages-list sa-pages-list--bars">
      {rows.map((row) => {
        const views = Number(row.pageViews) || 0;
        const pct = Math.round((views / maxViews) * 100);
        return (
          <li key={`${row.pagePath}-${row.pageViews}`} className="sa-pages-list__row">
            <div className="sa-pages-list__main">
              <span className="sa-pages-list__path" dir="ltr">
                {row.pagePath || "/"}
              </span>
              <div className="sa-pages-list__bar-track" aria-hidden>
                <span className="sa-pages-list__bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <strong className="sa-pages-list__count">{formatInt(views)}</strong>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Product analytics band (events, conversion, top pages). Not mounted on the home control center.
 */
export default function SuperAdminProductAnalyticsInsights() {
  const [range, setRange] = useState("7d");
  const { data, loading } = useSuperAdminAnalyticsOverview({ range, topLimit: 10 });

  const events = useMemo(() => data?.events || {}, [data?.events]);
  const conversion = data?.conversion || {};
  const topPages = useMemo(() => (Array.isArray(data?.topPages) ? data.topPages.slice(0, 5) : []), [data?.topPages]);
  const rangeLabel = RANGE_LABELS[range] || RANGE_LABELS["7d"];

  return (
    <div className="sa-analytics-band sa-analytics-band--page">
      <div className="sa-analytics-band__toolbar">
          <div className="sa-analytics-toolbar__range">
            <label className="sa-analytics-toolbar__label" htmlFor="sa-product-analytics-range">
              مدة التحليل
            </label>
            <select
              id="sa-product-analytics-range"
              className="input max-w-[200px] rounded-lg border-slate-200/90 text-sm"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              disabled={loading && !data}
            >
              <option value="today">اليوم</option>
              <option value="7d">آخر 7 أيام</option>
              <option value="30d">آخر 30 يوماً</option>
            </select>
            <p className="sa-analytics-toolbar__hint">يؤثر على ملخص النشاط والتحويل والصفحات فقط.</p>
          </div>
          <p className="sa-analytics-band__range-note">النطاق الحالي: {rangeLabel}</p>
        </div>

        <div className="sa-analytics-band__grid">
          <div className="sa-analytics-band__panel">
            <h3 className="sa-analytics-band__panel-title">ملخص النشاط</h3>
            <EventsTable events={events} />
          </div>

          <div className="sa-analytics-band__panel">
            <h3 className="sa-analytics-band__panel-title">مسار التحويل</h3>
            <ConversionStrip conversion={conversion} />
          </div>

          <div className="sa-analytics-band__panel sa-analytics-band__panel--full">
            <h3 className="sa-analytics-band__panel-title">أكثر 5 صفحات مشاهدة</h3>
            {topPages.length === 0 ? (
              <DashboardEmptyState
                title="لا توجد مشاهدات"
                description="لا توجد مشاهدات ضمن المدة المحددة أو البيانات غير متاحة حاليًا."
              />
            ) : (
              <TopPagesList rows={topPages} />
            )}
          </div>
        </div>
    </div>
  );
}
