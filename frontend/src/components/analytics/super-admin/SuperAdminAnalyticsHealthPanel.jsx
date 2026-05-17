import { useCallback, useEffect, useState } from "react";
import { getSuperadminAnalyticsHealthRequest } from "../../../services/superAdminAnalytics";
import { getAnalyticsDiagnostics, isAnalyticsEnabled, isDevTrackingDisabled } from "../../../services/analytics";
import StatusBadge from "../../dashboard/StatusBadge";
import DashboardLoadingState from "../../dashboard/DashboardLoadingState";

function toneFromOk(ok) {
  if (ok === true) return "active";
  if (ok === false) return "inactive";
  return "neutral";
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function HealthCard({ title, statusLabel, tone, children }) {
  return (
    <article className="sa-analytics-health__card">
      <div className="sa-analytics-health__card-head">
        <h3 className="sa-analytics-health__card-title">{title}</h3>
        <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
      </div>
      <div className="sa-analytics-health__card-body">{children}</div>
    </article>
  );
}

export default function SuperAdminAnalyticsHealthPanel() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  const client = getAnalyticsDiagnostics();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSuperadminAnalyticsHealthRequest();
      setHealth(res?.data || null);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "تعذر تحميل حالة التحليلات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <DashboardLoadingState label="جاري فحص PostHog…" />;
  }

  if (error) {
    return (
      <div className="sa-analytics-health__error">
        <p>{error}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
          إعادة الفحص
        </button>
      </div>
    );
  }

  const ph = health?.posthog || {};
  const snap = health?.snapshot || {};

  return (
    <div className="sa-analytics-health">
      <div className="sa-analytics-health__toolbar">
        <p className="sa-analytics-health__intro">
          تشخيص سريع — لماذا قد يظهر «الزوار» صفراً على الصفحة الرئيسية.
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
          تحديث
        </button>
      </div>

      <div className="sa-analytics-health__grid">
        <HealthCard
          title="تتبع المتصفح"
          tone={toneFromOk(isAnalyticsEnabled())}
          statusLabel={isAnalyticsEnabled() ? "نشط" : "معطّل"}
        >
          <ul className="sa-analytics-health__list">
            <li>البيئة: {import.meta.env.PROD ? "إنتاج" : "تطوير"}</li>
            <li>مفتاح VITE_POSTHOG_KEY: {client.hasKey ? (client.keyValid ? "صالح (phc_)" : "غير صالح") : "ناقص"}</li>
            <li>
              مضيف الاستيعاب: {client.host || "—"}
              {client.hostCorrected ? " (تم تصحيحه تلقائياً)" : ""}
            </li>
            <li>مضيف صالح: {client.ingestionHostValid ? "نعم" : "لا"}</li>
            <li>تهيئة PostHog: {client.initialized ? "نعم" : "لا"}</li>
            <li>Feature flags: معطّلة (لا تؤثر على الزوار)</li>
            <li>آخر pageview من المتصفح: {fmtTime(client.lastPageviewTrackedAt)}</li>
            <li>تتبع التطوير: {client.devTrackingEnabled ? "مفعّل" : "معطّل"}</li>
            {isDevTrackingDisabled() ? (
              <li className="sa-analytics-health__warn">بدون VITE_POSTHOG_ENABLE_IN_DEV=true لن تُسجَّل زيارات محلياً.</li>
            ) : null}
          </ul>
        </HealthCard>

        <HealthCard
          title="استعلامات HogQL (الخادم)"
          tone={toneFromOk(ph.hogqlConfigured && ph.hogqlReachable)}
          statusLabel={!ph.hogqlConfigured ? "غير مُعد" : ph.hogqlReachable ? "متصل" : "غير متاح"}
        >
          <ul className="sa-analytics-health__list">
            <li>المضيف: {ph.host || "—"}</li>
            <li>معرّف المشروع: {ph.projectIdPresent ? "موجود" : "ناقص"}</li>
            <li>مفتاح شخصي: {ph.personalKeyPresent ? "موجود" : "ناقص"}</li>
            <li>آخر استعلام ناجح: {fmtTime(health?.lastSuccessfulHogqlAt)}</li>
          </ul>
        </HealthCard>

        <HealthCard
          title="تقاطعات $pageview"
          tone={toneFromOk(snap.lastPageviewAt != null)}
          statusLabel={snap.lastPageviewAt ? "مستلمة" : "لا أحداث"}
        >
          <ul className="sa-analytics-health__list">
            <li>آخر $pageview: {fmtTime(snap.lastPageviewAt)}</li>
            <li>زوار (7 أيام): {snap.visitorsLast7Days != null ? snap.visitorsLast7Days : "—"}</li>
            <li>نشطون (7 أيام): {snap.activeUsersLast7Days != null ? snap.activeUsersLast7Days : "—"}</li>
          </ul>
        </HealthCard>

        <HealthCard
          title="حالة النظام"
          tone={health?.degraded ? "inactive" : "active"}
          statusLabel={health?.degraded ? "متدهور" : "سليم"}
        >
          <ul className="sa-analytics-health__list">
            <li>بيئة الخادم: {health?.environment || "—"}</li>
            <li>آخر فحص: {fmtTime(health?.queriedAt)}</li>
            {Array.isArray(health?.hints) && health.hints.length
              ? health.hints.map((h) => (
                  <li key={h} className="sa-analytics-health__warn">
                    {h}
                  </li>
                ))
              : null}
          </ul>
        </HealthCard>
      </div>

      {(health?.errors?.length || health?.warnings?.length || client.errors?.length || client.warnings?.length) ? (
        <div className="sa-analytics-health__issues">
          {[...(health?.errors || []), ...(client?.errors || [])].map((item) => (
            <p key={item.code} className="sa-analytics-health__issue sa-analytics-health__issue--error">
              <strong>{item.code}:</strong> {item.message}
            </p>
          ))}
          {[...(health?.warnings || []), ...(client?.warnings || [])].map((item) => (
            <p key={item.code} className="sa-analytics-health__issue">
              <strong>{item.code}:</strong> {item.message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
