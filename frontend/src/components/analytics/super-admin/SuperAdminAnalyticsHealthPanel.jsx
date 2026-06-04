import { useCallback, useEffect, useMemo, useState } from "react";
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

function deriveSummaryChip({ loading, error, health, clientEnabled }) {
  if (loading) return { tone: "neutral", label: "جاري الفحص…" };
  if (error) return { tone: "inactive", label: "تعذّر التحميل" };
  if (health?.degraded) return { tone: "inactive", label: "متدهور" };
  if (!isAnalyticsEnabled() || !clientEnabled) return { tone: "inactive", label: "تتبع معطّل" };
  return { tone: "active", label: "سليم" };
}

export default function SuperAdminAnalyticsHealthPanel() {
  const [expanded, setExpanded] = useState(false);
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

  const summaryChip = useMemo(
    () => deriveSummaryChip({ loading, error, health, clientEnabled: isAnalyticsEnabled() }),
    [loading, error, health],
  );

  return (
    <div className="sa-analytics-health sa-analytics-health--accordion">
      <button
        type="button"
        className="sa-analytics-health__accordion-trigger"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="sa-analytics-health__accordion-title">تشخيص التتبع المتقدم</span>
        <span className="sa-analytics-health__accordion-meta">
          <StatusBadge tone={summaryChip.tone}>{summaryChip.label}</StatusBadge>
          <span className="sa-analytics-health__accordion-chevron" aria-hidden>
            {expanded ? "▾" : "◂"}
          </span>
        </span>
      </button>

      {expanded ? (
        <div className="sa-analytics-health__accordion-body">
          {loading ? <DashboardLoadingState label="جاري فحص PostHog…" /> : null}

          {!loading && error ? (
            <div className="sa-analytics-health__error">
              <p>{error}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
                إعادة الفحص
              </button>
            </div>
          ) : null}

          {!loading && !error && health ? (
            <>
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
                  tone={toneFromOk(health?.posthog?.hogqlConfigured && health?.posthog?.hogqlReachable)}
                  statusLabel={
                    !health?.posthog?.hogqlConfigured ? "غير مُعد" : health?.posthog?.hogqlReachable ? "متصل" : "غير متاح"
                  }
                >
                  <ul className="sa-analytics-health__list">
                    <li>المضيف: {health?.posthog?.host || "—"}</li>
                    <li>معرّف المشروع: {health?.posthog?.projectIdPresent ? "موجود" : "ناقص"}</li>
                    <li>مفتاح شخصي: {health?.posthog?.personalKeyPresent ? "موجود" : "ناقص"}</li>
                    <li>آخر استعلام ناجح: {fmtTime(health?.lastSuccessfulHogqlAt)}</li>
                  </ul>
                </HealthCard>

                <HealthCard
                  title="تقاطعات $pageview"
                  tone={toneFromOk(health?.snapshot?.lastPageviewAt != null)}
                  statusLabel={health?.snapshot?.lastPageviewAt ? "مستلمة" : "لا أحداث"}
                >
                  <ul className="sa-analytics-health__list">
                    <li>آخر $pageview: {fmtTime(health?.snapshot?.lastPageviewAt)}</li>
                    <li>مشاهدات ($pageview، كل الوقت): {health?.snapshot?.pageViewsAllTime != null ? health.snapshot.pageViewsAllTime : "—"}</li>
                    <li>نشطون (7 أيام): {health?.snapshot?.activeUsersLast7Days != null ? health.snapshot.activeUsersLast7Days : "—"}</li>
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
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
