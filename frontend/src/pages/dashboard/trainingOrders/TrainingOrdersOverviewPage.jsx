import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminCancelTrainingRoundRequest,
  adminGetTrainingOrdersAutomationHealthRequest,
  adminGetTrainingFakeOrdersCountRequest,
  adminGetTrainingOrdersReadinessRequest,
  adminGetTrainingOrdersSettingsRequest,
  adminListTrainingApplicationsSummaryRequest,
  adminListTrainingRoundsRequest,
} from "../../../services/api";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardFormCard from "../../../components/dashboard/DashboardFormCard";
import DashboardStatsGrid from "../../../components/dashboard/DashboardStatsGrid";
import DashboardStatCard from "../../../components/dashboard/DashboardStatCard";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import { useTranslation } from "../../../i18n/LanguageProvider";
import OverviewWidgetFrame from "./OverviewWidgetFrame";
import TrainingOrderRoundsSection from "./TrainingOrderRoundsSection";
import TrainingOrdersOverviewSkeleton from "./TrainingOrdersOverviewSkeleton";
import TrainingOrdersVisiblePreview from "./TrainingOrdersVisiblePreview";
import {
  formatAdminDateTime,
  formatAdminNumber,
  formatAdminRange,
  formatAutomationHealthWarnings,
  formatReadinessWarnings,
  formatTimeRemaining,
  getAutomationStatusLabel,
  getCanCreateNextRoundLabel,
  getReadinessStatusLabel,
  getRoundSourceLabel,
  getRoundStatusLabel,
  readinessStatusTone,
  trainingAdminT,
  unwrapTrainingPayload,
} from "./trainingOrdersDisplayUtils";
import { runWidgetLoad, loadWidget, WIDGET_IDLE } from "./trainingOrdersAsyncWidget";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { useToast } from "../../../components/ui/toastContext";
import "./trainingOrdersAdmin.css";

const BASE = "/dashboard/super-admin/training-orders";

function OperationalDateTime({ value }) {
  const formatted = formatAdminDateTime(value);
  if (formatted === "—") return <span>—</span>;
  return (
    <span className="oh-training-num" dir="ltr">
      {formatted}
    </span>
  );
}

function OperationalPeriodLines({ startsAt, expiresAt, t }) {
  const from = startsAt ? formatAdminDateTime(startsAt) : null;
  const to = expiresAt ? formatAdminDateTime(expiresAt) : null;
  if (!from && !to) return <span>—</span>;
  return (
    <span className="oh-training-period-lines oh-training-metric-row__value">
      {from ? (
        <span className="oh-training-period-lines__line">
          <span className="oh-training-period-lines__label">{t("trainingOrders.rounds.periodFrom")}</span>{" "}
          <span className="oh-training-period-lines__value oh-training-num" dir="ltr">
            {from}
          </span>
        </span>
      ) : null}
      {to ? (
        <span className="oh-training-period-lines__line">
          <span className="oh-training-period-lines__label">{t("trainingOrders.rounds.periodTo")}</span>{" "}
          <span className="oh-training-period-lines__value oh-training-num" dir="ltr">
            {to}
          </span>
        </span>
      ) : null}
    </span>
  );
}

function roundStatusTone(status) {
  if (status === "active") return "success";
  if (status === "scheduled") return "pending";
  if (status === "expired") return "inactive";
  if (status === "stopped") return "warning";
  return "neutral";
}

function StatWidgetCard({ label, hint, widget, onRetry, suppressLoading, inlineError }) {
  const displayValue =
    widget.data === null || widget.data === undefined || widget.data === ""
      ? "—"
      : formatAdminNumber(widget.data);
  return (
    <OverviewWidgetFrame status={widget.status} error={widget.error} onRetry={onRetry} suppressLoading={suppressLoading} compact>
      {inlineError ? <p className="oh-training-widget-inline-error help">{inlineError}</p> : null}
      <DashboardStatCard label={label} value={displayValue} hint={hint} className="oh-training-kpi-card" />
    </OverviewWidgetFrame>
  );
}

function marketplaceWidgetStatus(settingsW, automationHealthW) {
  if (settingsW.status === "error") return "error";
  if (automationHealthW.status === "error") return "error";
  if (settingsW.status === "loading" || automationHealthW.status === "loading") return "loading";
  return "success";
}

export default function TrainingOrdersOverviewPage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const initialLoadDoneRef = useRef(false);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settingsW, setSettingsW] = useState(WIDGET_IDLE);
  const [activeRoundW, setActiveRoundW] = useState(WIDGET_IDLE);
  const [fakeOrdersTotalW, setFakeOrdersTotalW] = useState(WIDGET_IDLE);
  const [visibleNowW, setVisibleNowW] = useState(WIDGET_IDLE);
  const [applicantsW, setApplicantsW] = useState(WIDGET_IDLE);
  const [roundsTotalW, setRoundsTotalW] = useState(WIDGET_IDLE);
  const [automationHealthW, setAutomationHealthW] = useState(WIDGET_IDLE);
  const [readinessW, setReadinessW] = useState(WIDGET_IDLE);
  const [stopBusy, setStopBusy] = useState(false);
  const [roundsRefreshKey, setRoundsRefreshKey] = useState(0);
  const [clockTick, setClockTick] = useState(0);

  const loadOpts = useCallback(() => ({ initialLoadDone: initialLoadDoneRef.current }), []);

  const loadSettings = useCallback(async (options = {}) => {
    await runWidgetLoad(
      setSettingsW,
      async () => {
        const res = await adminGetTrainingOrdersSettingsRequest();
        return unwrapTrainingPayload(res);
      },
      { ...loadOpts(), ...options },
    );
  }, [loadOpts]);

  const loadActiveRound = useCallback(async (options = {}) => {
    await runWidgetLoad(
      setActiveRoundW,
      async () => {
        const res = await adminListTrainingRoundsRequest({ status: "active", limit: 1 });
        const payload = unwrapTrainingPayload(res);
        return payload?.rounds?.[0] || null;
      },
      { ...loadOpts(), ...options },
    );
  }, [loadOpts]);

  const loadFakeOrdersTotal = useCallback(async (options = {}) => {
    await runWidgetLoad(
      setFakeOrdersTotalW,
      async () => {
        const res = await adminGetTrainingFakeOrdersCountRequest();
        const payload = unwrapTrainingPayload(res);
        return payload?.total ?? 0;
      },
      { ...loadOpts(), ...options },
    );
  }, [loadOpts]);

  const loadAutomationHealthBundle = useCallback(async (options = {}) => {
    const keepStale = options.silent || initialLoadDoneRef.current;
    if (!keepStale) {
      setAutomationHealthW(WIDGET_IDLE);
      setVisibleNowW(WIDGET_IDLE);
    }
    const result = await loadWidget(async () => {
      const res = await adminGetTrainingOrdersAutomationHealthRequest();
      return unwrapTrainingPayload(res);
    });
    if (result.status === "success") {
      setAutomationHealthW({ status: "success", data: result.data, error: "" });
      setVisibleNowW({
        status: "success",
        data: result.data?.pool?.visibleAnyAudience ?? 0,
        error: "",
      });
    } else {
      setAutomationHealthW((prev) => ({
        status: keepStale && prev.data != null ? "success" : "error",
        data: prev.data,
        error: result.error,
      }));
      setVisibleNowW((prev) => ({
        status: keepStale && prev.data != null ? "success" : "error",
        data: prev.data,
        error: result.error,
      }));
    }
    return result;
  }, []);

  const loadApplicants = useCallback(async (options = {}) => {
    await runWidgetLoad(
      setApplicantsW,
      async () => {
        const res = await adminListTrainingApplicationsSummaryRequest({ limit: 1 });
        const payload = unwrapTrainingPayload(res);
        return payload?.pagination?.total ?? 0;
      },
      { ...loadOpts(), ...options },
    );
  }, [loadOpts]);

  const loadReadiness = useCallback(async (options = {}) => {
    await runWidgetLoad(
      setReadinessW,
      async () => {
        const res = await adminGetTrainingOrdersReadinessRequest();
        return unwrapTrainingPayload(res);
      },
      { ...loadOpts(), ...options },
    );
  }, [loadOpts]);

  const loadRoundsTotal = useCallback(async (options = {}) => {
    await runWidgetLoad(
      setRoundsTotalW,
      async () => {
        const res = await adminListTrainingRoundsRequest({ limit: 1 });
        const payload = unwrapTrainingPayload(res);
        return payload?.pagination?.total ?? 0;
      },
      { ...loadOpts(), ...options },
    );
  }, [loadOpts]);

  const pushActionError = useCallback(
    (e, failedKey = "serverError") => {
      const status = e?.response?.status;
      const message = getSafeApiErrorMessage(e) || t(`trainingOrders.actions.toast.${failedKey}`);
      push({
        type: "error",
        title:
          status === 403
            ? t("trainingOrders.actions.toast.permissionDenied")
            : t(`trainingOrders.actions.toast.${failedKey}`),
        message,
      });
    },
    [push, t],
  );

  const loadAll = useCallback(async () => {
    if (initialLoadDoneRef.current) {
      setIsRefreshing(true);
    }
    try {
      const critical = Promise.all([
        loadSettings({ silent: true }),
        loadActiveRound({ silent: true }),
        loadReadiness({ silent: true }),
      ]);
      const secondary = Promise.all([
        loadFakeOrdersTotal({ silent: true }),
        loadAutomationHealthBundle({ silent: true }),
        loadApplicants({ silent: true }),
        loadRoundsTotal({ silent: true }),
      ]);
      await critical;
      void secondary;
    } finally {
      setIsRefreshing(false);
    }
  }, [
    loadSettings,
    loadActiveRound,
    loadReadiness,
    loadFakeOrdersTotal,
    loadAutomationHealthBundle,
    loadApplicants,
    loadRoundsTotal,
  ]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const criticalWidgets = useMemo(
    () => [settingsW, activeRoundW, readinessW],
    [settingsW, activeRoundW, readinessW],
  );

  useEffect(() => {
    if (dashboardReady) return;
    if (criticalWidgets.every((w) => w.status !== "loading")) {
      initialLoadDoneRef.current = true;
      setDashboardReady(true);
    }
  }, [criticalWidgets, dashboardReady]);

  const isInitialDashboardLoading = !dashboardReady;
  const suppressCardLoading = dashboardReady;

  useEffect(() => {
    if (window.location.hash !== "#round-history") return undefined;
    const el = document.getElementById("round-history");
    if (!el) return undefined;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const activeRound = activeRoundW.status === "success" ? activeRoundW.data : null;
    if (!activeRound?.expiresAt) return undefined;
    const id = window.setInterval(() => setClockTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [activeRoundW.data, activeRoundW.status]);

  const settings = settingsW.status === "success" ? settingsW.data : null;
  const activeRound = activeRoundW.status === "success" ? activeRoundW.data : null;
  const canStopRound = activeRound && (activeRound.status === "active" || activeRound.status === "scheduled");

  const stopActiveRound = async () => {
    if (!activeRound || !canStopRound || stopBusy) return;
    if (!window.confirm(t("trainingOrders.actions.confirm.stopCurrentRound"))) return;
    setStopBusy(true);
    setIsRefreshing(true);
    try {
      await adminCancelTrainingRoundRequest(activeRound.id);
      push({
        type: "success",
        title: t("trainingOrders.rounds.stopRound"),
        message: t("trainingOrders.actions.toast.roundStopped"),
      });
      await Promise.all([loadActiveRound({ silent: true }), loadRoundsTotal({ silent: true }), loadReadiness({ silent: true }), loadAutomationHealthBundle({ silent: true })]);
      setRoundsRefreshKey((k) => k + 1);
    } catch (e) {
      pushActionError(e, "roundStopFailed");
    } finally {
      setStopBusy(false);
      setIsRefreshing(false);
    }
  };

  const refreshVisibleCounts = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadReadiness({ silent: true }), loadAutomationHealthBundle({ silent: true })]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadReadiness, loadAutomationHealthBundle]);

  const warnings = useMemo(() => {
    if (settingsW.status !== "success" || !settings) return [];
    const items = [];
    const poolVisible = visibleNowW.status === "success" ? visibleNowW.data : null;
    const health = automationHealthW.status === "success" ? automationHealthW.data : null;
    const hasInsufficientWarning =
      health?.warnings?.includes("insufficient_eligible_pool") ||
      health?.warnings?.includes("insufficient_pool") ||
      health?.warnings?.includes("no_active_templates");

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

  const handleRoundsChanged = useCallback(() => {
    void loadActiveRound({ silent: true });
    void loadRoundsTotal({ silent: true });
    void loadReadiness({ silent: true });
    void loadAutomationHealthBundle({ silent: true });
  }, [loadActiveRound, loadRoundsTotal, loadReadiness, loadAutomationHealthBundle]);

  const readiness = readinessW.status === "success" ? readinessW.data : null;
  const readinessWarningMessages = useMemo(() => {
    if (!readiness?.readinessWarnings?.length) return [];
    const codes = readiness.readinessWarnings.filter((code) => code !== "insufficient_eligible_pool");
    return formatReadinessWarnings(codes, t);
  }, [readiness?.readinessWarnings, t]);

  const readinessPoolBanner = useMemo(() => {
    if (!readiness) return null;
    if (readiness.nextRoundReadinessStatus === "warning") {
      return {
        tone: "warning",
        text: t("trainingOrders.overview.nextRoundReadiness.limitedVarietyWarning"),
      };
    }
    if (readiness.nextRoundReadinessStatus === "blocked") {
      return {
        tone: "danger",
        text: t("trainingOrders.overview.nextRoundReadiness.insufficientPoolDanger"),
        to: `${BASE}/templates`,
      };
    }
    return null;
  }, [readiness, t]);

  const marketplaceStatus = marketplaceWidgetStatus(settingsW, automationHealthW);

  return (
    <DashboardSection
      className="oh-training-page-section oh-training-overview"
      title={t("trainingOrders.overview.title")}
      description={t("trainingOrders.overview.description")}
    >
      {isRefreshing ? (
        <p className="oh-training-overview__refresh-note" role="status" aria-live="polite">
          {t("trainingOrders.overview.updatingData")}
        </p>
      ) : null}

      {isInitialDashboardLoading ? (
        <TrainingOrdersOverviewSkeleton />
      ) : (
        <>
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

      <section className="oh-training-overview__section oh-training-overview__section--kpis" aria-label={t("trainingOrders.overview.title")}>
        <DashboardStatsGrid className="oh-training-overview__stats oh-training-overview__stats--top oh-training-overview__kpi-strip">
          <StatWidgetCard
            label={t("trainingOrders.overview.stats.visibleNow")}
            hint={t("trainingOrders.overview.stats.visibleNowHint")}
            widget={visibleNowW}
            onRetry={() => void loadAutomationHealthBundle()}
            suppressLoading={suppressCardLoading}
            inlineError={suppressCardLoading && visibleNowW.error ? visibleNowW.error : ""}
          />
          <StatWidgetCard
            label={t("trainingOrders.overview.stats.totalFakeOrders")}
            hint={t("trainingOrders.overview.stats.totalFakeOrdersHint")}
            widget={fakeOrdersTotalW}
            onRetry={() => void loadFakeOrdersTotal()}
            suppressLoading={suppressCardLoading}
            inlineError={suppressCardLoading && fakeOrdersTotalW.error ? fakeOrdersTotalW.error : ""}
          />
          <StatWidgetCard
            label={t("trainingOrders.overview.stats.ordersWithApplicants")}
            hint={t("trainingOrders.overview.stats.ordersWithApplicantsHint")}
            widget={applicantsW}
            onRetry={() => void loadApplicants()}
            suppressLoading={suppressCardLoading}
            inlineError={suppressCardLoading && applicantsW.error ? applicantsW.error : ""}
          />
          <StatWidgetCard
            label={t("trainingOrders.overview.stats.totalRounds")}
            hint={t("trainingOrders.overview.stats.totalRoundsHint")}
            widget={roundsTotalW}
            onRetry={() => void loadRoundsTotal()}
            suppressLoading={suppressCardLoading}
            inlineError={suppressCardLoading && roundsTotalW.error ? roundsTotalW.error : ""}
          />
        </DashboardStatsGrid>
      </section>

      <section className="oh-training-overview__section oh-training-overview__section--ops">
        <div className="oh-training-overview__ops-panel">
          <div className="oh-training-overview__ops-item oh-training-overview__ops-item--current">
            <DashboardFormCard title={t("trainingOrders.overview.activeRound.title")} className="oh-training-overview__card oh-training-overview__card--compact">
          <OverviewWidgetFrame
            status={activeRoundW.status}
            error={activeRoundW.error}
            onRetry={() => void loadActiveRound()}
            suppressLoading={suppressCardLoading}
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
                <ul className="oh-training-metric-list">
                  <li className="oh-training-metric-row">
                    <span>{t("trainingOrders.overview.activeRound.orderCount")}</span>
                    <strong className="oh-training-num" dir="ltr">{formatAdminNumber(activeRound.generatedCount)}</strong>
                  </li>
                  <li className="oh-training-metric-row">
                    <span>{t("trainingOrders.overview.activeRound.range")}</span>
                    <strong className="oh-training-num" dir="ltr">
                      {formatAdminRange(activeRound.minOrders, activeRound.maxOrders)}
                    </strong>
                  </li>
                  <li className="oh-training-metric-row oh-training-metric-row--period">
                    <span>{t("trainingOrders.overview.activeRound.period")}</span>
                    <OperationalPeriodLines startsAt={activeRound.startsAt} expiresAt={activeRound.expiresAt} t={t} />
                  </li>
                  {activeRound.expiresAt ? (
                    <>
                      <li className="oh-training-metric-row">
                        <span>{t("trainingOrders.overview.activeRound.endsAt")}</span>
                        <strong>
                          <OperationalDateTime value={activeRound.expiresAt} />
                        </strong>
                      </li>
                      <li className="oh-training-metric-row">
                        <span>{t("trainingOrders.overview.activeRound.timeRemaining")}</span>
                        <strong key={clockTick}>{formatTimeRemaining(activeRound.expiresAt, t)}</strong>
                      </li>
                    </>
                  ) : null}
                </ul>
                <div className="oh-training-overview__card-actions oh-training-overview__card-actions--inline">
                  {canStopRound ? (
                    <button type="button" className="btn btn-secondary" disabled={stopBusy} onClick={() => void stopActiveRound()}>
                      {stopBusy ? t("trainingOrders.rounds.busy") : t("trainingOrders.rounds.stopRound")}
                    </button>
                  ) : null}
                  <Link to={`${BASE}/applications`} className="btn btn-secondary">
                    {t("trainingOrders.shell.applications")}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="oh-training-overview__empty-card">
                <p>{t("trainingOrders.overview.activeRound.none")}</p>
                {settings?.automationEnabled && settings?.nextAutomationRunAt ? (
                  <p className="help oh-training-overview__pool-hint">
                    {t("trainingOrders.overview.activeRound.nextRun")}{" "}
                    <OperationalDateTime value={settings.nextAutomationRunAt} />
                  </p>
                ) : null}
              </div>
            )}
          </OverviewWidgetFrame>
        </DashboardFormCard>
          </div>

          <div className="oh-training-overview__ops-item oh-training-overview__ops-item--readiness">
            <DashboardFormCard title={t("trainingOrders.overview.nextRoundReadiness.title")} className="oh-training-overview__card oh-training-overview__card--compact">
          <OverviewWidgetFrame
            status={readinessW.status}
            error={readinessW.error}
            onRetry={() => void loadReadiness()}
            suppressLoading={suppressCardLoading}
          >
            {readiness ? (
              <>
                <div className="oh-training-readiness-summary">
                  <div className="oh-training-overview__active-round-head">
                    <StatusBadge tone={readinessStatusTone(readiness.nextRoundReadinessStatus)}>
                      {getReadinessStatusLabel(readiness.nextRoundReadinessStatus, t)}
                    </StatusBadge>
                  </div>
                </div>
                {readinessPoolBanner ? (
                  readinessPoolBanner.to ? (
                    <Link
                      to={readinessPoolBanner.to}
                      className={`oh-training-overview__readiness-banner oh-training-overview__readiness-banner--${readinessPoolBanner.tone}`}
                    >
                      {readinessPoolBanner.text}
                    </Link>
                  ) : (
                    <p className={`oh-training-overview__readiness-banner oh-training-overview__readiness-banner--${readinessPoolBanner.tone}`}>
                      {readinessPoolBanner.text}
                    </p>
                  )
                ) : null}
                <ul className="oh-training-metric-list">
                  <li className="oh-training-metric-row">
                    <span>{t("trainingOrders.overview.nextRoundReadiness.eligible")}</span>
                    <strong className="oh-training-num" dir="ltr">{formatAdminNumber(readiness.eligibleForNextRound)}</strong>
                  </li>
                  <li className="oh-training-metric-row">
                    <span>{t("trainingOrders.overview.nextRoundReadiness.minimum")}</span>
                    <strong className="oh-training-num" dir="ltr">{formatAdminNumber(readiness.minOrdersPerRound)}</strong>
                  </li>
                  <li className="oh-training-metric-row">
                    <span>{t("trainingOrders.overview.nextRoundReadiness.range")}</span>
                    <strong className="oh-training-num" dir="ltr">
                      {formatAdminRange(readiness.minOrdersPerRound, readiness.maxOrdersPerRound)}
                    </strong>
                  </li>
                  <li className="oh-training-metric-row oh-training-metric-row--wrap">
                    <span>{t("trainingOrders.overview.nextRoundReadiness.canCreateQuestion")}</span>
                    <strong>{getCanCreateNextRoundLabel(readiness, t)}</strong>
                  </li>
                </ul>
                {readinessWarningMessages.length ? (
                  <ul className="oh-training-overview__readiness-warnings">
                    {readinessWarningMessages.map((msg) => (
                      <li key={msg}>{msg}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="oh-training-overview__pool-hint">{t("trainingOrders.overview.nextRoundReadiness.helper")}</p>
              </>
            ) : null}
          </OverviewWidgetFrame>
        </DashboardFormCard>
          </div>

          <div className="oh-training-overview__ops-item oh-training-overview__ops-item--marketplace">
            <DashboardFormCard title={t("trainingOrders.overview.marketplaceStatus.title")} className="oh-training-overview__card oh-training-overview__card--compact">
          <OverviewWidgetFrame
            status={marketplaceStatus}
            error={settingsW.error || automationHealthW.error}
            onRetry={() => {
              void loadSettings();
              void loadAutomationHealthBundle();
            }}
            suppressLoading={suppressCardLoading}
          >
            {settings ? (
              <>
                <ul className="oh-training-metric-list">
                  <li className="oh-training-metric-row">
                    <span>{t("trainingOrders.overview.programStatus.marketplace")}</span>
                    <StatusBadge tone={settings.trainingOrdersEnabled ? "success" : "inactive"}>
                      {settings.trainingOrdersEnabled
                        ? t("trainingOrders.overview.programStatus.marketplaceOn")
                        : t("trainingOrders.overview.programStatus.marketplaceOff")}
                    </StatusBadge>
                  </li>
                  <li className="oh-training-metric-row">
                    <span>{t("trainingOrders.overview.stats.visibleNow")}</span>
                    <strong className="oh-training-num" dir="ltr">
                      {visibleNowW.status === "success" ? formatAdminNumber(visibleNowW.data ?? 0) : "—"}
                    </strong>
                  </li>
                  {(() => {
                    const h = automationHealthW.data;
                    if (!h) return null;
                    const schedulerOn = Boolean(h.driver?.inProcessTicksEnabled && h.driver?.schedulerRunning);
                    return (
                      <>
                        <li className="oh-training-metric-row">
                          <span>{t("trainingOrders.overview.marketplaceStatus.automaticScheduling")}</span>
                          <StatusBadge tone={schedulerOn && settings.automationEnabled ? "success" : "inactive"}>
                            {schedulerOn && settings.automationEnabled
                              ? t("trainingOrders.overview.marketplaceStatus.automaticSchedulingActive")
                              : t("trainingOrders.overview.marketplaceStatus.automaticSchedulingInactive")}
                          </StatusBadge>
                        </li>
                        <li className="oh-training-metric-row oh-training-metric-row--wrap">
                          <span>{t("trainingOrders.overview.programStatus.lastRun")}</span>
                          <strong className="oh-training-metric-row__value">
                            {settings.lastAutomationRunAt ? (
                              <span className="oh-training-period-lines">
                                <span className="oh-training-period-lines__line">
                                  {getAutomationStatusLabel(settings.lastAutomationStatus, t)}
                                </span>
                                <span className="oh-training-period-lines__line oh-training-num" dir="ltr">
                                  {formatAdminDateTime(settings.lastAutomationRunAt)}
                                </span>
                              </span>
                            ) : (
                              "—"
                            )}
                          </strong>
                        </li>
                        <li className="oh-training-metric-row">
                          <span>{t("trainingOrders.overview.programStatus.nextRun")}</span>
                          <strong>
                            {settings.nextAutomationRunAt ? (
                              <OperationalDateTime value={settings.nextAutomationRunAt} />
                            ) : (
                              "—"
                            )}
                          </strong>
                        </li>
                        {healthWarnings.length ? (
                          <li className="oh-training-metric-row oh-training-metric-row--wrap">
                            <span>{t("trainingOrders.overview.marketplaceStatus.warnings")}</span>
                            <strong className="oh-training-overview__warn">{healthWarnings.join(" · ")}</strong>
                          </li>
                        ) : null}
                      </>
                    );
                  })()}
                </ul>
              </>
            ) : null}
          </OverviewWidgetFrame>
            </DashboardFormCard>
          </div>
        </div>
      </section>

      <TrainingOrdersVisiblePreview
        refreshKey={roundsRefreshKey}
        onAfterHide={refreshVisibleCounts}
        suppressLoading={suppressCardLoading}
      />

      <TrainingOrderRoundsSection refreshKey={roundsRefreshKey} onRoundsChanged={handleRoundsChanged} />
        </>
      )}
    </DashboardSection>
  );
}
