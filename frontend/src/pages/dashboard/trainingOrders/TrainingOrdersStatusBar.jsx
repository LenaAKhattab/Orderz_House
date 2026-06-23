import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminGetTrainingOrdersSettingsRequest, adminListTrainingRoundsRequest } from "../../../services/api";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import { useTranslation } from "../../../i18n/LanguageProvider";
import {
  formatJoDateTime,
  getAutomationStatusLabel,
  getRoundStatusLabel,
  unwrapTrainingPayload,
} from "./trainingOrdersDisplayUtils";
import { loadWidget, WIDGET_IDLE } from "./trainingOrdersAsyncWidget";

const BASE = "/dashboard/super-admin/training-orders";

export default function TrainingOrdersStatusBar() {
  const { t, locale } = useTranslation();
  const [settingsW, setSettingsW] = useState(WIDGET_IDLE);
  const [activeRoundW, setActiveRoundW] = useState(WIDGET_IDLE);

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

  const load = useCallback(() => {
    void loadSettings();
    void loadActiveRound();
  }, [loadSettings, loadActiveRound]);

  useEffect(() => {
    load();
  }, [load]);

  const settings = settingsW.status === "success" ? settingsW.data : null;
  const activeRound = activeRoundW.status === "success" ? activeRoundW.data : null;
  const initialLoading = settingsW.status === "loading" && activeRoundW.status === "loading";

  if (initialLoading) {
    return (
      <div className="oh-training-status-bar oh-training-status-bar--loading" role="status" aria-live="polite">
        <span className="oh-training-status-bar__skeleton" />
        <span className="oh-training-status-bar__skeleton oh-training-status-bar__skeleton--short" />
        <span className="oh-training-status-bar__skeleton oh-training-status-bar__skeleton--mid" />
      </div>
    );
  }

  const marketplaceOn = Boolean(settings?.trainingOrdersEnabled);
  const automationOn = Boolean(settings?.automationEnabled);
  const automationFailed = settings?.lastAutomationStatus === "failed";

  return (
    <div className="oh-training-status-bar" role="region" aria-label={t("trainingOrders.statusBar.regionLabel")}>
      {settingsW.status === "error" ? (
        <div className="oh-training-status-bar__pill oh-training-status-bar__pill--error">
          <StatusBadge tone="warning">{t("trainingOrders.statusBar.marketplaceUnavailable")}</StatusBadge>
          <button type="button" className="btn btn-secondary oh-training-status-bar__retry" onClick={() => void loadSettings()}>
            {t("trainingOrders.statusBar.retry")}
          </button>
        </div>
      ) : settingsW.status === "loading" ? (
        <span className="oh-training-status-bar__skeleton oh-training-status-bar__skeleton--short" />
      ) : (
        <Link to={`${BASE}/settings`} className="oh-training-status-bar__pill">
          <StatusBadge tone={marketplaceOn ? "success" : "inactive"}>
            {t("trainingOrders.statusBar.marketplace")}:{" "}
            {marketplaceOn ? t("trainingOrders.statusBar.marketplaceOn") : t("trainingOrders.statusBar.marketplaceOff")}
          </StatusBadge>
        </Link>
      )}

      {settingsW.status === "error" ? null : settingsW.status === "loading" ? (
        <span className="oh-training-status-bar__skeleton oh-training-status-bar__skeleton--short" />
      ) : (
        <Link to={`${BASE}/settings`} className="oh-training-status-bar__pill">
          <StatusBadge tone={automationOn ? "success" : "inactive"}>
            {t("trainingOrders.statusBar.scheduling")}:{" "}
            {automationOn ? t("trainingOrders.statusBar.schedulingOn") : t("trainingOrders.statusBar.schedulingOff")}
          </StatusBadge>
        </Link>
      )}

      {activeRoundW.status === "error" ? (
        <div className="oh-training-status-bar__pill oh-training-status-bar__pill--grow oh-training-status-bar__pill--error">
          <StatusBadge tone="warning">{t("trainingOrders.statusBar.activeRoundLoadFailed")}</StatusBadge>
          <button type="button" className="btn btn-secondary oh-training-status-bar__retry" onClick={() => void loadActiveRound()}>
            {t("trainingOrders.statusBar.retry")}
          </button>
        </div>
      ) : activeRoundW.status === "loading" ? (
        <span className="oh-training-status-bar__skeleton oh-training-status-bar__skeleton--mid" />
      ) : activeRound ? (
        <Link to={`${BASE}/rounds`} className="oh-training-status-bar__pill oh-training-status-bar__pill--grow">
          <StatusBadge tone="success">
            {t("trainingOrders.statusBar.round")} {getRoundStatusLabel(activeRound.status, t)}: {activeRound.title || "—"}
          </StatusBadge>
          {activeRound.expiresAt ? (
            <span className="oh-training-status-bar__meta">
              {t("trainingOrders.statusBar.expires")} {formatJoDateTime(activeRound.expiresAt, locale)}
            </span>
          ) : null}
        </Link>
      ) : automationOn && settings?.nextAutomationRunAt ? (
        <Link to={`${BASE}/settings`} className="oh-training-status-bar__pill oh-training-status-bar__pill--grow">
          <StatusBadge tone="pending">{t("trainingOrders.statusBar.noActiveRound")}</StatusBadge>
          <span className="oh-training-status-bar__meta">
            {t("trainingOrders.statusBar.nextRun")}: {formatJoDateTime(settings.nextAutomationRunAt, locale)}
          </span>
        </Link>
      ) : (
        <Link to={`${BASE}/rounds`} className="oh-training-status-bar__pill">
          <StatusBadge tone="neutral">{t("trainingOrders.statusBar.noActiveRound")}</StatusBadge>
        </Link>
      )}

      {automationFailed && settingsW.status === "success" ? (
        <Link to={`${BASE}/settings`} className="oh-training-status-bar__pill">
          <StatusBadge tone="danger">
            {t("trainingOrders.statusBar.lastRun")}: {getAutomationStatusLabel(settings.lastAutomationStatus, t)}
          </StatusBadge>
        </Link>
      ) : null}
    </div>
  );
}
