import { useCallback, useEffect, useMemo, useState } from "react";
import { getSuperadminAnalyticsHealthRequest } from "../../../services/superAdminAnalytics";
import { getAnalyticsDiagnostics, isAnalyticsEnabled, isDevTrackingDisabled } from "../../../services/analytics";
import StatusBadge from "../../dashboard/StatusBadge";
import DashboardLoadingState from "../../dashboard/DashboardLoadingState";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "./registerAnalysisLocale";

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

function deriveSummaryChip({ loading, error, health, clientEnabled, t }) {
  if (loading) return { tone: "neutral", label: t("analysis.health.checking") };
  if (error) return { tone: "inactive", label: t("analysis.health.loadFailedChip") };
  if (health?.degraded) return { tone: "inactive", label: t("analysis.health.degraded") };
  if (!isAnalyticsEnabled() || !clientEnabled) return { tone: "inactive", label: t("analysis.health.trackingOff") };
  return { tone: "active", label: t("analysis.health.healthy") };
}

export default function SuperAdminAnalyticsHealthPanel() {
  const { t } = useTranslation();
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
      setError(e?.response?.data?.message || e?.message || t("analysis.health.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryChip = useMemo(
    () => deriveSummaryChip({ loading, error, health, clientEnabled: isAnalyticsEnabled(), t }),
    [loading, error, health, t],
  );

  return (
    <div className="sa-analytics-health sa-analytics-health--accordion">
      <button
        type="button"
        className="sa-analytics-health__accordion-trigger"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="sa-analytics-health__accordion-title">{t("analysis.health.title")}</span>
        <span className="sa-analytics-health__accordion-meta">
          <StatusBadge tone={summaryChip.tone}>{summaryChip.label}</StatusBadge>
          <span className="sa-analytics-health__accordion-chevron" aria-hidden>
            {expanded ? "▾" : "◂"}
          </span>
        </span>
      </button>

      {expanded ? (
        <div className="sa-analytics-health__accordion-body">
          {loading ? <DashboardLoadingState label={t("analysis.health.loadingPosthog")} /> : null}

          {!loading && error ? (
            <div className="sa-analytics-health__error">
              <p>{error}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
                {t("analysis.health.recheck")}
              </button>
            </div>
          ) : null}

          {!loading && !error && health ? (
            <>
              <div className="sa-analytics-health__toolbar">
                <p className="sa-analytics-health__intro">{t("analysis.health.intro")}</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
                  {t("analysis.health.refresh")}
                </button>
              </div>

              <div className="sa-analytics-health__grid">
                <HealthCard
                  title={t("analysis.health.browserTracking")}
                  tone={toneFromOk(isAnalyticsEnabled())}
                  statusLabel={isAnalyticsEnabled() ? t("analysis.health.active") : t("analysis.health.disabled")}
                >
                  <ul className="sa-analytics-health__list">
                    <li>
                      {t("analysis.health.envLabel")}:{" "}
                      {import.meta.env.PROD ? t("analysis.health.envProd") : t("analysis.health.envDev")}
                    </li>
                    <li>
                      {t("analysis.health.vitePosthogKey")}:{" "}
                      {client.hasKey
                        ? client.keyValid
                          ? t("analysis.health.validPhc")
                          : t("analysis.health.invalid")
                        : t("analysis.health.missing")}
                    </li>
                    <li>
                      {t("analysis.health.ingestionHost")}: {client.host || "—"}
                      {client.hostCorrected ? t("analysis.health.hostCorrectedSuffix") : ""}
                    </li>
                    <li>
                      {t("analysis.health.ingestionHostValid")}:{" "}
                      {client.ingestionHostValid ? t("analysis.health.yes") : t("analysis.health.no")}
                    </li>
                    <li>
                      {t("analysis.health.posthogInit")}:{" "}
                      {client.initialized ? t("analysis.health.yes") : t("analysis.health.no")}
                    </li>
                    <li>{t("analysis.health.featureFlagsOff")}</li>
                    <li>
                      {t("analysis.health.lastBrowserPageview")}: {fmtTime(client.lastPageviewTrackedAt)}
                    </li>
                    <li>
                      {t("analysis.health.devTracking")}:{" "}
                      {client.devTrackingEnabled ? t("analysis.health.active") : t("analysis.health.disabled")}
                    </li>
                    {isDevTrackingDisabled() ? (
                      <li className="sa-analytics-health__warn">{t("analysis.health.devTrackingWarn")}</li>
                    ) : null}
                  </ul>
                </HealthCard>

                <HealthCard
                  title={t("analysis.health.localStats")}
                  tone={toneFromOk(
                    health?.snapshot?.localPageViewsTotal != null || health?.snapshot?.localActiveUsersLast7Days != null,
                  )}
                  statusLabel={
                    health?.snapshot?.localPageViewsTotal != null || health?.snapshot?.localActiveUsersLast7Days != null
                      ? t("analysis.health.local")
                      : t("analysis.health.unavailable")
                  }
                >
                  <ul className="sa-analytics-health__list">
                    <li>
                      {t("analysis.health.localPageViews")}:{" "}
                      {health?.snapshot?.localPageViewsTotal != null ? health.snapshot.localPageViewsTotal : "—"}
                    </li>
                    <li>
                      {t("analysis.health.localActive7d")}:{" "}
                      {health?.snapshot?.localActiveUsersLast7Days != null ? health.snapshot.localActiveUsersLast7Days : "—"}
                    </li>
                    <li>
                      {t("analysis.health.localLastPageview")}: {fmtTime(health?.snapshot?.localLastPageviewAt)}
                    </li>
                  </ul>
                </HealthCard>

                <HealthCard
                  title={t("analysis.health.posthogRef")}
                  tone={toneFromOk(health?.posthog?.hogqlConfigured && health?.posthog?.hogqlReachable)}
                  statusLabel={
                    !health?.posthog?.hogqlConfigured
                      ? t("analysis.health.notConfigured")
                      : health?.posthog?.hogqlReachable
                        ? t("analysis.health.connected")
                        : t("analysis.health.unavailable")
                  }
                >
                  <ul className="sa-analytics-health__list">
                    <li>
                      {t("analysis.health.posthogLastPageview")}: {fmtTime(health?.snapshot?.lastPageviewAt)}
                    </li>
                    <li>
                      {t("analysis.health.posthogViewsAllTime")}:{" "}
                      {health?.snapshot?.pageViewsAllTime != null ? health.snapshot.pageViewsAllTime : "—"}
                    </li>
                    <li>
                      {t("analysis.health.posthogUniq7d")}:{" "}
                      {health?.snapshot?.activeUsersLast7Days != null ? health.snapshot.activeUsersLast7Days : "—"}
                    </li>
                    <li>
                      {t("analysis.health.host")}: {health?.posthog?.host || "—"}
                    </li>
                    <li>
                      {t("analysis.health.lastHogqlOk")}: {fmtTime(health?.lastSuccessfulHogqlAt)}
                    </li>
                  </ul>
                </HealthCard>

                <HealthCard
                  title={t("analysis.health.systemStatus")}
                  tone={health?.degraded ? "inactive" : "active"}
                  statusLabel={health?.degraded ? t("analysis.health.degraded") : t("analysis.health.healthy")}
                >
                  <ul className="sa-analytics-health__list">
                    <li>
                      {t("analysis.health.serverEnv")}: {health?.environment || "—"}
                    </li>
                    <li>
                      {t("analysis.health.lastCheck")}: {fmtTime(health?.queriedAt)}
                    </li>
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
