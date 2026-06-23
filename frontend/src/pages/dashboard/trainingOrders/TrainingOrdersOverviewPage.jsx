import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminGetTrainingOrdersAutomationHealthRequest,
  adminGetTrainingFakeOrdersCountRequest,
  adminGetTrainingOrdersSettingsRequest,
  adminListTrainingApplicationsSummaryRequest,
  adminListTrainingRoundsRequest,
  adminRunTrainingOrdersAutomationTickRequest,
} from "../../../services/api";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardFormCard from "../../../components/dashboard/DashboardFormCard";
import DashboardStatsGrid from "../../../components/dashboard/DashboardStatsGrid";
import DashboardStatCard from "../../../components/dashboard/DashboardStatCard";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import { useTranslation } from "../../../i18n/LanguageProvider";
import OverviewWidgetFrame from "./OverviewWidgetFrame";
import {
  formatAutomationHealthWarnings,
  formatJoDateTime,
  formatRoundPeriod,
  getAutomationStatusLabel,
  getRoundSourceLabel,
  getRoundStatusLabel,
  unwrapTrainingPayload,
} from "./trainingOrdersDisplayUtils";
import { loadWidget, WIDGET_IDLE } from "./trainingOrdersAsyncWidget";
import "./trainingOrdersAdmin.css";

const BASE = "/dashboard/super-admin/training-orders";

function roundStatusTone(status) {
  if (status === "active") return "success";
  if (status === "scheduled") return "pending";
  if (status === "expired") return "inactive";
  if (status === "stopped") return "warning";
  return "neutral";
}

function StatWidgetCard({ label, hint, widget, onRetry, loadingLabel }) {
  return (
    <OverviewWidgetFrame status={widget.status} error={widget.error} onRetry={onRetry} loadingLabel={loadingLabel} compact>
      <DashboardStatCard label={label} value={widget.data ?? "—"} hint={hint} />
    </OverviewWidgetFrame>
  );
}

function QuickNavigationCard({ t }) {
  return (
    <DashboardFormCard title={t("trainingOrders.overview.quickNav.title")} className="oh-training-overview__card">
      <div className="oh-training-overview__quick-links">
        <Link to={`${BASE}/rounds`} className="oh-training-overview__quick-link">
          {t("trainingOrders.overview.quickNav.rounds")}
        </Link>
        <Link to={`${BASE}/templates`} className="oh-training-overview__quick-link">
          {t("trainingOrders.overview.quickNav.templates")}
        </Link>
        <Link to={`${BASE}/applications`} className="oh-training-overview__quick-link">
          {t("trainingOrders.overview.quickNav.applications")}
        </Link>
        <Link to={`${BASE}/settings`} className="oh-training-overview__quick-link">
          {t("trainingOrders.overview.quickNav.settings")}
        </Link>
      </div>
    </DashboardFormCard>
  );
}

export default function TrainingOrdersOverviewPage() {
  const { t, locale } = useTranslation();
  const [settingsW, setSettingsW] = useState(WIDGET_IDLE);
  const [activeRoundW, setActiveRoundW] = useState(WIDGET_IDLE);
  const [recentRoundsW, setRecentRoundsW] = useState(WIDGET_IDLE);
  const [fakeOrdersTotalW, setFakeOrdersTotalW] = useState(WIDGET_IDLE);
  const [visibleNowW, setVisibleNowW] = useState(WIDGET_IDLE);
  const [applicantsW, setApplicantsW] = useState(WIDGET_IDLE);
  const [roundsTotalW, setRoundsTotalW] = useState(WIDGET_IDLE);
  const [automationHealthW, setAutomationHealthW] = useState(WIDGET_IDLE);
  const [tickBusy, setTickBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    setSettingsW({ status: "loading", data: null, error: "" });
    const result = await loadWidget(async () => {
      const res = await adminGetTrainingOrdersSettingsRequest();
      return unwrapTrainingPayload(res);
    });
    setSettingsW({ status: result.status, data: result.status === "success" ? result.data : null, error: result.error || "" });
  }, []);

  const loadActiveRound = useCallback(async () => {
    setActiveRoundW({ status: "loading", data: null, error: "" });
    const result = await loadWidget(async () => {
      const res = await adminListTrainingRoundsRequest({ status: "active", limit: 1 });
      const payload = unwrapTrainingPayload(res);
      return payload?.rounds?.[0] || null;
    });
    setActiveRoundW({ status: result.status, data: result.status === "success" ? result.data : null, error: result.error || "" });
  }, []);

  const loadRecentRounds = useCallback(async () => {
    setRecentRoundsW({ status: "loading", data: null, error: "" });
    const result = await loadWidget(async () => {
      const res = await adminListTrainingRoundsRequest({ limit: 5 });
      const payload = unwrapTrainingPayload(res);
      return payload?.rounds || [];
    });
    setRecentRoundsW({
      status: result.status,
      data: result.status === "success" ? result.data : null,
      error: result.error || "",
    });
  }, []);

  const loadVisibleNow = useCallback(async () => {
    setVisibleNowW({ status: "loading", data: null, error: "" });
    const result = await loadWidget(async () => {
      const res = await adminGetTrainingOrdersAutomationHealthRequest();
      const payload = unwrapTrainingPayload(res);
      return payload?.pool?.visibleAnyAudience ?? 0;
    });
    setVisibleNowW({
      status: result.status,
      data: result.status === "success" ? result.data : null,
      error: result.error || "",
    });
  }, []);

  const loadFakeOrdersTotal = useCallback(async () => {
    setFakeOrdersTotalW({ status: "loading", data: null, error: "" });
    const result = await loadWidget(async () => {
      const res = await adminGetTrainingFakeOrdersCountRequest();
      const payload = unwrapTrainingPayload(res);
      return payload?.total ?? 0;
    });
    setFakeOrdersTotalW({
      status: result.status,
      data: result.status === "success" ? result.data : null,
      error: result.error || "",
    });
  }, []);

  const loadApplicants = useCallback(async () => {
    setApplicantsW({ status: "loading", data: null, error: "" });
    const result = await loadWidget(async () => {
      const res = await adminListTrainingApplicationsSummaryRequest({ limit: 1 });
      const payload = unwrapTrainingPayload(res);
      return payload?.pagination?.total ?? 0;
    });
    setApplicantsW({
      status: result.status,
      data: result.status === "success" ? result.data : null,
      error: result.error || "",
    });
  }, []);

  const loadAutomationHealth = useCallback(async () => {
    setAutomationHealthW({ status: "loading", data: null, error: "" });
    const result = await loadWidget(async () => {
      const res = await adminGetTrainingOrdersAutomationHealthRequest();
      return unwrapTrainingPayload(res);
    });
    setAutomationHealthW({
      status: result.status,
      data: result.status === "success" ? result.data : null,
      error: result.error || "",
    });
  }, []);

  const runAutomationTick = useCallback(async () => {
    setTickBusy(true);
    try {
      await adminRunTrainingOrdersAutomationTickRequest();
      await Promise.all([loadAutomationHealth(), loadSettings(), loadActiveRound()]);
    } finally {
      setTickBusy(false);
    }
  }, [loadAutomationHealth, loadSettings, loadActiveRound]);

  const loadRoundsTotal = useCallback(async () => {
    setRoundsTotalW({ status: "loading", data: null, error: "" });
    const result = await loadWidget(async () => {
      const res = await adminListTrainingRoundsRequest({ limit: 1 });
      const payload = unwrapTrainingPayload(res);
      return payload?.pagination?.total ?? 0;
    });
    setRoundsTotalW({
      status: result.status,
      data: result.status === "success" ? result.data : null,
      error: result.error || "",
    });
  }, []);

  const loadAll = useCallback(() => {
    void loadSettings();
    void loadActiveRound();
    void loadRecentRounds();
    void loadFakeOrdersTotal();
    void loadVisibleNow();
    void loadApplicants();
    void loadRoundsTotal();
    void loadAutomationHealth();
  }, [
    loadSettings,
    loadActiveRound,
    loadRecentRounds,
    loadFakeOrdersTotal,
    loadVisibleNow,
    loadApplicants,
    loadRoundsTotal,
    loadAutomationHealth,
  ]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const settings = settingsW.status === "success" ? settingsW.data : null;
  const activeRound = activeRoundW.status === "success" ? activeRoundW.data : null;
  const recentRounds = recentRoundsW.status === "success" ? recentRoundsW.data || [] : [];

  const warnings = useMemo(() => {
    if (settingsW.status !== "success" || !settings) return [];
    const items = [];
    const poolVisible = visibleNowW.status === "success" ? visibleNowW.data : null;
    const health = automationHealthW.status === "success" ? automationHealthW.data : null;
    const hasInsufficientWarning = health?.warnings?.includes("insufficient_eligible_pool") || health?.warnings?.includes("insufficient_pool") || health?.warnings?.includes("no_active_templates");

    if (!settings.trainingOrdersEnabled) {
      items.push({
        tone: "warning",
        text: t("trainingOrders.overview.warnings.marketplaceHidden"),
        to: `${BASE}/settings`,
      });
    }

    if (settings.automationEnabled && (poolVisible === 0 || hasInsufficientWarning)) {
      items.push({
        tone: "warning",
        text: t("trainingOrders.overview.warnings.automationInsufficientPool"),
        to: `${BASE}/templates`,
      });
    }

    if (settings.lastAutomationStatus === "failed") {
      items.push({
        tone: "danger",
        text: t("trainingOrders.overview.warnings.lastRunFailed"),
        to: `${BASE}/settings`,
      });
    }

    if (settings.lastAutomationStatus === "skipped_no_templates") {
      items.push({
        tone: "warning",
        text: t("trainingOrders.overview.warnings.lastRunSkippedPool"),
        to: `${BASE}/templates`,
      });
    }

    if (settings.lastAutomationStatus === "skipped_lock") {
      items.push({
        tone: "warning",
        text: t("trainingOrders.overview.warnings.lastRunSkippedLock"),
        to: `${BASE}/settings`,
      });
    }

    return items;
  }, [settings, settingsW.status, visibleNowW.data, visibleNowW.status, automationHealthW.data, automationHealthW.status, t]);

  const healthWarnings = useMemo(() => {
    const h = automationHealthW.data;
    if (!h?.warnings?.length) return [];
    return formatAutomationHealthWarnings(h.warnings, t);
  }, [automationHealthW.data, t]);

  return (
    <DashboardSection
      className="oh-training-page-section oh-training-overview"
      title={t("trainingOrders.overview.title")}
      description={t("trainingOrders.overview.description")}
    >
      {warnings.length > 0 ? (
        <div className="oh-training-overview__warnings" role="list">
          {warnings.map((w) => (
            <Link
              key={w.text}
              to={w.to}
              className={`oh-training-overview__warning oh-training-overview__warning--${w.tone}`}
              role="listitem"
            >
              {w.text}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="oh-training-overview__grid">
        <DashboardFormCard title={t("trainingOrders.overview.activeRound.title")} className="oh-training-overview__card">
          <OverviewWidgetFrame
            status={activeRoundW.status}
            error={activeRoundW.error}
            onRetry={() => void loadActiveRound()}
            loadingLabel={t("trainingOrders.overview.activeRound.loading")}
          >
            {activeRound ? (
              <div className="oh-training-overview__active-round">
                <div className="oh-training-overview__active-round-head">
                  <StatusBadge tone={roundStatusTone(activeRound.status)}>
                    {getRoundStatusLabel(activeRound.status, t)}
                  </StatusBadge>
                  <span className="oh-training-overview__meta">{getRoundSourceLabel(activeRound.roundSource, t)}</span>
                </div>
                <h3 className="oh-training-overview__card-title">{activeRound.title || "—"}</h3>
                <ul className="oh-training-overview__facts">
                  <li>
                    <span>{t("trainingOrders.overview.activeRound.orderCount")}</span>
                    <strong dir="ltr">{activeRound.generatedCount ?? "—"}</strong>
                  </li>
                  <li>
                    <span>{t("trainingOrders.overview.activeRound.range")}</span>
                    <strong dir="ltr">
                      {activeRound.minOrders} – {activeRound.maxOrders}
                    </strong>
                  </li>
                  <li>
                    <span>{t("trainingOrders.overview.activeRound.period")}</span>
                    <strong>{formatRoundPeriod(activeRound.startsAt, activeRound.expiresAt, locale)}</strong>
                  </li>
                </ul>
                <div className="oh-training-overview__card-actions">
                  <Link to={`${BASE}/rounds`} className="btn btn-secondary">
                    {t("trainingOrders.overview.activeRound.viewRound")}
                  </Link>
                  <Link to={`${BASE}/applications`} className="btn btn-secondary">
                    {t("trainingOrders.shell.applications")}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="oh-training-overview__empty-card">
                <p>{t("trainingOrders.overview.activeRound.none")}</p>
                {settings?.automationEnabled && settings?.nextAutomationRunAt ? (
                  <p className="help">
                    {t("trainingOrders.overview.activeRound.nextRun")}{" "}
                    <strong>{formatJoDateTime(settings.nextAutomationRunAt, locale)}</strong>
                  </p>
                ) : null}
                <Link to={`${BASE}/rounds`} className="btn btn-secondary">
                  {t("trainingOrders.overview.activeRound.viewHistory")}
                </Link>
              </div>
            )}
          </OverviewWidgetFrame>
        </DashboardFormCard>

        <DashboardFormCard title={t("trainingOrders.overview.programStatus.title")} className="oh-training-overview__card">
          <OverviewWidgetFrame
            status={settingsW.status}
            error={settingsW.error}
            onRetry={() => void loadSettings()}
            loadingLabel={t("trainingOrders.overview.programStatus.loading")}
          >
            <ul className="oh-training-overview__facts oh-training-overview__facts--program">
              <li>
                <span>{t("trainingOrders.overview.programStatus.marketplace")}</span>
                <StatusBadge tone={settings?.trainingOrdersEnabled ? "success" : "inactive"}>
                  {settings?.trainingOrdersEnabled
                    ? t("trainingOrders.overview.programStatus.marketplaceOn")
                    : t("trainingOrders.overview.programStatus.marketplaceOff")}
                </StatusBadge>
              </li>
              <li>
                <span>{t("trainingOrders.overview.programStatus.automation")}</span>
                <StatusBadge tone={settings?.automationEnabled ? "success" : "inactive"}>
                  {settings?.automationEnabled
                    ? t("trainingOrders.overview.programStatus.automationOn")
                    : t("trainingOrders.overview.programStatus.automationOff")}
                </StatusBadge>
              </li>
              <li>
                <span>{t("trainingOrders.overview.programStatus.lastRun")}</span>
                <strong>
                  {settings?.lastAutomationRunAt
                    ? `${getAutomationStatusLabel(settings.lastAutomationStatus, t)} — ${formatJoDateTime(settings.lastAutomationRunAt, locale)}`
                    : "—"}
                </strong>
              </li>
              {settings?.lastAutomationGeneratedCount != null ? (
                <li>
                  <span>{t("trainingOrders.overview.programStatus.lastRoundOrders")}</span>
                  <strong dir="ltr">{settings.lastAutomationGeneratedCount}</strong>
                </li>
              ) : null}
              <li>
                <span>{t("trainingOrders.overview.programStatus.nextRun")}</span>
                <strong>{settings?.nextAutomationRunAt ? formatJoDateTime(settings.nextAutomationRunAt, locale) : "—"}</strong>
              </li>
            </ul>
            <div className="oh-training-overview__card-actions">
              <Link to={`${BASE}/settings`} className="btn btn-secondary">
                {t("trainingOrders.overview.programStatus.openSettings")}
              </Link>
            </div>
          </OverviewWidgetFrame>
        </DashboardFormCard>

        <DashboardFormCard title={t("trainingOrders.overview.marketplaceStatus.title")} className="oh-training-overview__card">
          <OverviewWidgetFrame
            status={automationHealthW.status}
            error={automationHealthW.error}
            onRetry={() => void loadAutomationHealth()}
            loadingLabel={t("trainingOrders.overview.marketplaceStatus.loading")}
          >
            {(() => {
              const h = automationHealthW.data;
              if (!h) return null;
              const driverOn = Boolean(h.driver?.anyDriverActive);
              const schedulerOn = Boolean(h.driver?.inProcessTicksEnabled && h.driver?.schedulerRunning);
              const ms = h.driver?.tickIntervalMs || 0;

              return (
                <>
                  <ul className="oh-training-overview__facts oh-training-overview__facts--program">
                    <li>
                      <span>{t("trainingOrders.overview.marketplaceStatus.automaticScheduling")}</span>
                      <StatusBadge tone={schedulerOn ? "success" : "inactive"}>
                        {schedulerOn
                          ? t("trainingOrders.overview.marketplaceStatus.automaticSchedulingActive")
                          : t("trainingOrders.overview.marketplaceStatus.automaticSchedulingInactive")}
                      </StatusBadge>
                    </li>
                    <li>
                      <span>{t("trainingOrders.overview.marketplaceStatus.roundDuration")}</span>
                      <strong>{h.rotation?.label || "—"}</strong>
                    </li>
                    <li>
                      <span>{t("trainingOrders.overview.marketplaceStatus.visibleEligible")}</span>
                      <strong dir="ltr">{h.pool?.visibleAnyAudience ?? 0}</strong>
                    </li>
                    <li>
                      <span>{t("trainingOrders.overview.marketplaceStatus.visiblePublic")}</span>
                      <strong dir="ltr">{h.pool?.visiblePublicAudience ?? 0}</strong>
                    </li>
                    {healthWarnings.length ? (
                      <li>
                        <span>{t("trainingOrders.overview.marketplaceStatus.warnings")}</span>
                        <strong className="oh-training-overview__warn">{healthWarnings.join(" · ")}</strong>
                      </li>
                    ) : null}
                  </ul>

                  <details className="oh-training-overview__technical">
                    <summary>{t("trainingOrders.overview.marketplaceStatus.technicalDetails")}</summary>
                    <ul className="oh-training-overview__facts oh-training-overview__facts--program">
                      <li>
                        <span>{t("trainingOrders.overview.marketplaceStatus.automationDriver")}</span>
                        <StatusBadge tone={driverOn ? "success" : "warning"}>
                          {driverOn
                            ? t("trainingOrders.overview.marketplaceStatus.driverConfigured")
                            : t("trainingOrders.overview.marketplaceStatus.driverNotConfigured")}
                        </StatusBadge>
                      </li>
                      <li>
                        <span>{t("trainingOrders.overview.marketplaceStatus.serverScheduler")}</span>
                        <strong>
                          {schedulerOn
                            ? t("trainingOrders.overview.marketplaceStatus.schedulerEvery", {
                                seconds: Math.round(ms / 1000),
                              })
                            : t("trainingOrders.overview.marketplaceStatus.automaticSchedulingInactive")}
                        </strong>
                      </li>
                    </ul>
                  </details>

                  <div className="oh-training-overview__card-actions oh-training-overview__card-actions--stacked">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={tickBusy}
                      onClick={() => void runAutomationTick()}
                    >
                      {tickBusy
                        ? t("trainingOrders.overview.marketplaceStatus.checkingRotation")
                        : t("trainingOrders.overview.marketplaceStatus.checkRotationNow")}
                    </button>
                    <p className="help oh-training-overview__action-help">
                      {t("trainingOrders.overview.marketplaceStatus.checkRotationNowHelp")}
                    </p>
                  </div>
                </>
              );
            })()}
          </OverviewWidgetFrame>
        </DashboardFormCard>
      </div>

      <DashboardStatsGrid className="oh-training-overview__stats">
        <StatWidgetCard
          label={t("trainingOrders.overview.stats.totalFakeOrders")}
          hint={t("trainingOrders.overview.stats.totalFakeOrdersHint")}
          widget={fakeOrdersTotalW}
          onRetry={() => void loadFakeOrdersTotal()}
          loadingLabel={t("trainingOrders.overview.stats.totalFakeOrdersLoading")}
        />
        <StatWidgetCard
          label={t("trainingOrders.overview.stats.visibleNow")}
          hint={t("trainingOrders.overview.stats.visibleNowHint")}
          widget={visibleNowW}
          onRetry={() => void loadVisibleNow()}
          loadingLabel={t("trainingOrders.overview.stats.visibleNowLoading")}
        />
        <StatWidgetCard
          label={t("trainingOrders.overview.stats.ordersWithApplicants")}
          hint={t("trainingOrders.overview.stats.ordersWithApplicantsHint")}
          widget={applicantsW}
          onRetry={() => void loadApplicants()}
          loadingLabel={t("trainingOrders.overview.stats.ordersWithApplicantsLoading")}
        />
        <StatWidgetCard
          label={t("trainingOrders.overview.stats.totalRounds")}
          hint={t("trainingOrders.overview.stats.totalRoundsHint")}
          widget={roundsTotalW}
          onRetry={() => void loadRoundsTotal()}
          loadingLabel={t("trainingOrders.overview.stats.totalRoundsLoading")}
        />
      </DashboardStatsGrid>

      <div className="oh-training-overview__bottom">
        <DashboardFormCard title={t("trainingOrders.overview.recentRounds.title")} className="oh-training-overview__card">
          <OverviewWidgetFrame
            status={recentRoundsW.status}
            error={recentRoundsW.error}
            onRetry={() => void loadRecentRounds()}
            loadingLabel={t("trainingOrders.overview.recentRounds.loading")}
          >
            {recentRounds.length === 0 ? (
              <p className="help">{t("trainingOrders.overview.recentRounds.empty")}</p>
            ) : (
              <ul className="oh-training-overview__activity">
                {recentRounds.map((r) => (
                  <li key={r.id} className="oh-training-overview__activity-item">
                    <StatusBadge tone={roundStatusTone(r.status)}>{getRoundStatusLabel(r.status, t)}</StatusBadge>
                    <span className="oh-training-overview__activity-title">{r.title || "—"}</span>
                    <span className="oh-training-overview__activity-meta">{formatJoDateTime(r.startsAt, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="oh-training-overview__card-actions">
              <Link to={`${BASE}/rounds`} className="btn btn-secondary">
                {t("trainingOrders.overview.recentRounds.viewAll")}
              </Link>
            </div>
          </OverviewWidgetFrame>
        </DashboardFormCard>

        <QuickNavigationCard t={t} />
      </div>
    </DashboardSection>
  );
}
