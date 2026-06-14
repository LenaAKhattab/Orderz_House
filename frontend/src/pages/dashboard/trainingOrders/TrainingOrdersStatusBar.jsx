import { useCallback, useEffect, useState } from "react";

import { Link } from "react-router-dom";

import {

  adminGetTrainingOrdersSettingsRequest,

  adminListTrainingRoundsRequest,

} from "../../../services/api";

import StatusBadge from "../../../components/dashboard/StatusBadge";

import {

  automationStatusAr,

  formatJoDateTime,

  ROUND_STATUS_AR,

  unwrapTrainingPayload,

} from "./trainingOrdersDisplayUtils";

import { loadWidget, WIDGET_IDLE } from "./trainingOrdersAsyncWidget";



const BASE = "/dashboard/super-admin/training-orders";



export default function TrainingOrdersStatusBar() {

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

    <div className="oh-training-status-bar" role="region" aria-label="حالة برنامج الطلبات التجريبية">

      {settingsW.status === "error" ? (

        <div className="oh-training-status-bar__pill oh-training-status-bar__pill--error">

          <StatusBadge tone="warning">المعرض: غير متاح</StatusBadge>

          <button type="button" className="btn btn-secondary oh-training-status-bar__retry" onClick={() => void loadSettings()}>

            إعادة المحاولة

          </button>

        </div>

      ) : settingsW.status === "loading" ? (

        <span className="oh-training-status-bar__skeleton oh-training-status-bar__skeleton--short" />

      ) : (

        <Link to={`${BASE}/settings`} className="oh-training-status-bar__pill">

          <StatusBadge tone={marketplaceOn ? "success" : "inactive"}>

            المعرض: {marketplaceOn ? "مفعّل" : "مخفي"}

          </StatusBadge>

        </Link>

      )}



      {settingsW.status === "error" ? null : settingsW.status === "loading" ? (

        <span className="oh-training-status-bar__skeleton oh-training-status-bar__skeleton--short" />

      ) : (

        <Link to={`${BASE}/settings`} className="oh-training-status-bar__pill">

          <StatusBadge tone={automationOn ? "success" : "inactive"}>

            الأتمتة: {automationOn ? "مفعّلة" : "متوقفة"}

          </StatusBadge>

        </Link>

      )}



      {activeRoundW.status === "error" ? (

        <div className="oh-training-status-bar__pill oh-training-status-bar__pill--grow oh-training-status-bar__pill--error">

          <StatusBadge tone="warning">الجولة النشطة: تعذّر التحميل</StatusBadge>

          <button type="button" className="btn btn-secondary oh-training-status-bar__retry" onClick={() => void loadActiveRound()}>

            إعادة المحاولة

          </button>

        </div>

      ) : activeRoundW.status === "loading" ? (

        <span className="oh-training-status-bar__skeleton oh-training-status-bar__skeleton--mid" />

      ) : activeRound ? (

        <Link to={`${BASE}/rounds`} className="oh-training-status-bar__pill oh-training-status-bar__pill--grow">

          <StatusBadge tone="success">

            جولة {ROUND_STATUS_AR[activeRound.status] || activeRound.status}: {activeRound.title || "—"}

          </StatusBadge>

          {activeRound.expiresAt ? (

            <span className="oh-training-status-bar__meta">تنتهي {formatJoDateTime(activeRound.expiresAt)}</span>

          ) : null}

        </Link>

      ) : automationOn && settings?.nextAutomationRunAt ? (

        <Link to={`${BASE}/settings`} className="oh-training-status-bar__pill oh-training-status-bar__pill--grow">

          <StatusBadge tone="pending">لا جولة نشطة</StatusBadge>

          <span className="oh-training-status-bar__meta">

            التشغيل القادم: {formatJoDateTime(settings.nextAutomationRunAt)}

          </span>

        </Link>

      ) : (

        <Link to={`${BASE}/rounds`} className="oh-training-status-bar__pill">

          <StatusBadge tone="neutral">لا جولة نشطة</StatusBadge>

        </Link>

      )}



      {automationFailed && settingsW.status === "success" ? (

        <Link to={`${BASE}/settings`} className="oh-training-status-bar__pill">

          <StatusBadge tone="danger">آخر تشغيل: {automationStatusAr(settings.lastAutomationStatus)}</StatusBadge>

        </Link>

      ) : null}

    </div>

  );

}


