import { useCallback, useEffect, useMemo, useState } from "react";

import { Link } from "react-router-dom";

import {

  adminGetTrainingOrdersSettingsRequest,

  adminListTrainingApplicationsSummaryRequest,

  adminListTrainingRoundsRequest,

  adminListTrainingTemplatesRequest,

} from "../../../services/api";

import DashboardSection from "../../../components/dashboard/DashboardSection";

import DashboardFormCard from "../../../components/dashboard/DashboardFormCard";

import DashboardStatsGrid from "../../../components/dashboard/DashboardStatsGrid";

import DashboardStatCard from "../../../components/dashboard/DashboardStatCard";

import StatusBadge from "../../../components/dashboard/StatusBadge";

import OverviewWidgetFrame from "./OverviewWidgetFrame";

import {

  automationStatusAr,

  formatJoDateTime,

  formatRoundPeriod,

  ROUND_STATUS_AR,

  roundSourceAr,

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



function StatWidgetCard({ label, widget, onRetry, loadingLabel }) {

  return (

    <OverviewWidgetFrame status={widget.status} error={widget.error} onRetry={onRetry} loadingLabel={loadingLabel} compact>

      <DashboardStatCard label={label} value={widget.data ?? "—"} />

    </OverviewWidgetFrame>

  );

}



function QuickNavigationCard() {

  return (

    <DashboardFormCard title="انتقال سريع" className="oh-training-overview__card">

      <div className="oh-training-overview__quick-links">

        <Link to={`${BASE}/rounds`} className="oh-training-overview__quick-link">

          الجولات

        </Link>

        <Link to={`${BASE}/templates`} className="oh-training-overview__quick-link">

          القوالب

        </Link>

        <Link to={`${BASE}/applications`} className="oh-training-overview__quick-link">

          المتقدمون

        </Link>

        <Link to={`${BASE}/settings`} className="oh-training-overview__quick-link">

          الإعدادات

        </Link>

      </div>

    </DashboardFormCard>

  );

}



export default function TrainingOrdersOverviewPage() {

  const [settingsW, setSettingsW] = useState(WIDGET_IDLE);

  const [activeRoundW, setActiveRoundW] = useState(WIDGET_IDLE);

  const [recentRoundsW, setRecentRoundsW] = useState(WIDGET_IDLE);

  const [templatesTotalW, setTemplatesTotalW] = useState(WIDGET_IDLE);

  const [templatesActiveW, setTemplatesActiveW] = useState(WIDGET_IDLE);

  const [applicantsW, setApplicantsW] = useState(WIDGET_IDLE);

  const [roundsTotalW, setRoundsTotalW] = useState(WIDGET_IDLE);



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



  const loadTemplatesTotal = useCallback(async () => {

    setTemplatesTotalW({ status: "loading", data: null, error: "" });

    const result = await loadWidget(async () => {

      const res = await adminListTrainingTemplatesRequest({ limit: 1 });

      const payload = unwrapTrainingPayload(res);

      return payload?.pagination?.total ?? 0;

    });

    setTemplatesTotalW({

      status: result.status,

      data: result.status === "success" ? result.data : null,

      error: result.error || "",

    });

  }, []);



  const loadTemplatesActive = useCallback(async () => {

    setTemplatesActiveW({ status: "loading", data: null, error: "" });

    const result = await loadWidget(async () => {

      const res = await adminListTrainingTemplatesRequest({ isActive: true, limit: 1 });

      const payload = unwrapTrainingPayload(res);

      return payload?.pagination?.total ?? 0;

    });

    setTemplatesActiveW({

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

    void loadTemplatesTotal();

    void loadTemplatesActive();

    void loadApplicants();

    void loadRoundsTotal();

  }, [

    loadSettings,

    loadActiveRound,

    loadRecentRounds,

    loadTemplatesTotal,

    loadTemplatesActive,

    loadApplicants,

    loadRoundsTotal,

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

    const templatesActive = templatesActiveW.status === "success" ? templatesActiveW.data : null;



    if (!settings.trainingOrdersEnabled) {

      items.push({

        tone: "warning",

        text: "البرنامج مخفي عن المعرض حالياً. الطلبات التجريبية غير ظاهرة للمستقلين.",

        to: `${BASE}/settings`,

      });

    }



    if (settings.automationEnabled && templatesActive === 0) {

      items.push({

        tone: "warning",

        text: "الأتمتة مفعّلة لكن لا توجد قوالب نشطة — لن تُنشأ جولات جديدة حتى تفعيل قالب واحد على الأقل.",

        to: `${BASE}/templates`,

      });

    }



    if (settings.lastAutomationStatus === "failed") {

      items.push({

        tone: "danger",

        text: `آخر تشغيل للأتمتة فشل${settings.lastAutomationError ? `: ${settings.lastAutomationError}` : "."}`,

        to: `${BASE}/settings`,

      });

    }



    if (settings.lastAutomationStatus === "skipped_no_templates") {

      items.push({

        tone: "warning",

        text: "آخر تشغيل للأتمتة تم تخطيه — لا توجد قوالب نشطة.",

        to: `${BASE}/templates`,

      });

    }



    if (settings.lastAutomationStatus === "skipped_lock") {

      items.push({

        tone: "warning",

        text: "آخر تشغيل للأتمتة تم تخطيه — قفل تشغيل نشط (جولة قيد المعالجة).",

        to: `${BASE}/settings`,

      });

    }



    return items;

  }, [settings, settingsW.status, templatesActiveW.data, templatesActiveW.status]);



  return (

    <DashboardSection

      className="oh-training-page-section oh-training-overview"

      title="نظرة عامة"

      description="متابعة حالة برنامج الطلبات التجريبية والجولات والقوالب والمتقدمين."

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

        <DashboardFormCard title="الجولة النشطة" className="oh-training-overview__card">

          <OverviewWidgetFrame

            status={activeRoundW.status}

            error={activeRoundW.error}

            onRetry={() => void loadActiveRound()}

            loadingLabel="جاري تحميل الجولة النشطة…"

          >

            {activeRound ? (

              <div className="oh-training-overview__active-round">

                <div className="oh-training-overview__active-round-head">

                  <StatusBadge tone={roundStatusTone(activeRound.status)}>

                    {ROUND_STATUS_AR[activeRound.status] || activeRound.status}

                  </StatusBadge>

                  <span className="oh-training-overview__meta">{roundSourceAr(activeRound.roundSource)}</span>

                </div>

                <h3 className="oh-training-overview__card-title">{activeRound.title || "—"}</h3>

                <ul className="oh-training-overview__facts">

                  <li>

                    <span>عدد الطلبات</span>

                    <strong dir="ltr">{activeRound.generatedCount ?? "—"}</strong>

                  </li>

                  <li>

                    <span>النطاق</span>

                    <strong dir="ltr">

                      {activeRound.minOrders} – {activeRound.maxOrders}

                    </strong>

                  </li>

                  <li>

                    <span>الفترة</span>

                    <strong>{formatRoundPeriod(activeRound.startsAt, activeRound.expiresAt)}</strong>

                  </li>

                </ul>

                <div className="oh-training-overview__card-actions">

                  <Link to={`${BASE}/rounds`} className="btn btn-secondary">

                    عرض الجولة

                  </Link>

                  <Link to={`${BASE}/applications`} className="btn btn-secondary">

                    المتقدمون

                  </Link>

                </div>

              </div>

            ) : (

              <div className="oh-training-overview__empty-card">

                <p>لا توجد جولة نشطة حالياً.</p>

                {settings?.automationEnabled && settings?.nextAutomationRunAt ? (

                  <p className="help">

                    التشغيل التلقائي القادم: <strong>{formatJoDateTime(settings.nextAutomationRunAt)}</strong>

                  </p>

                ) : null}

                <Link to={`${BASE}/rounds`} className="btn btn-secondary">

                  عرض سجل الجولات

                </Link>

              </div>

            )}

          </OverviewWidgetFrame>

        </DashboardFormCard>



        <DashboardFormCard title="حالة البرنامج" className="oh-training-overview__card">

          <OverviewWidgetFrame

            status={settingsW.status}

            error={settingsW.error}

            onRetry={() => void loadSettings()}

            loadingLabel="جاري تحميل حالة البرنامج…"

          >

            <ul className="oh-training-overview__facts oh-training-overview__facts--program">

              <li>

                <span>المعرض</span>

                <StatusBadge tone={settings?.trainingOrdersEnabled ? "success" : "inactive"}>

                  {settings?.trainingOrdersEnabled ? "مفعّل" : "مخفي"}

                </StatusBadge>

              </li>

              <li>

                <span>الأتمتة</span>

                <StatusBadge tone={settings?.automationEnabled ? "success" : "inactive"}>

                  {settings?.automationEnabled ? "مفعّلة" : "متوقفة"}

                </StatusBadge>

              </li>

              <li>

                <span>آخر تشغيل</span>

                <strong>

                  {settings?.lastAutomationRunAt

                    ? `${automationStatusAr(settings.lastAutomationStatus)} — ${formatJoDateTime(settings.lastAutomationRunAt)}`

                    : "—"}

                </strong>

              </li>

              {settings?.lastAutomationGeneratedCount != null ? (

                <li>

                  <span>طلبات آخر جولة</span>

                  <strong dir="ltr">{settings.lastAutomationGeneratedCount}</strong>

                </li>

              ) : null}

              <li>

                <span>التشغيل القادم</span>

                <strong>{settings?.nextAutomationRunAt ? formatJoDateTime(settings.nextAutomationRunAt) : "—"}</strong>

              </li>

            </ul>

            <div className="oh-training-overview__card-actions">

              <Link to={`${BASE}/settings`} className="btn btn-secondary">

                فتح الإعدادات

              </Link>

            </div>

          </OverviewWidgetFrame>

        </DashboardFormCard>

      </div>



      <DashboardStatsGrid className="oh-training-overview__stats">

        <StatWidgetCard

          label="إجمالي القوالب"

          widget={templatesTotalW}

          onRetry={() => void loadTemplatesTotal()}

          loadingLabel="جاري تحميل إجمالي القوالب…"

        />

        <StatWidgetCard

          label="قوالب نشطة"

          widget={templatesActiveW}

          onRetry={() => void loadTemplatesActive()}

          loadingLabel="جاري تحميل القوالب النشطة…"

        />

        <StatWidgetCard

          label="طلبات بمتقدمين"

          widget={applicantsW}

          onRetry={() => void loadApplicants()}

          loadingLabel="جاري تحميل طلبات المتقدمين…"

        />

        <StatWidgetCard

          label="إجمالي الجولات"

          widget={roundsTotalW}

          onRetry={() => void loadRoundsTotal()}

          loadingLabel="جاري تحميل إجمالي الجولات…"

        />

      </DashboardStatsGrid>



      <div className="oh-training-overview__bottom">

        <DashboardFormCard title="آخر الجولات" className="oh-training-overview__card">

          <OverviewWidgetFrame

            status={recentRoundsW.status}

            error={recentRoundsW.error}

            onRetry={() => void loadRecentRounds()}

            loadingLabel="جاري تحميل آخر الجولات…"

          >

            {recentRounds.length === 0 ? (

              <p className="help">لا توجد جولات مسجّلة بعد.</p>

            ) : (

              <ul className="oh-training-overview__activity">

                {recentRounds.map((r) => (

                  <li key={r.id} className="oh-training-overview__activity-item">

                    <StatusBadge tone={roundStatusTone(r.status)}>{ROUND_STATUS_AR[r.status] || r.status}</StatusBadge>

                    <span className="oh-training-overview__activity-title">{r.title || "—"}</span>

                    <span className="oh-training-overview__activity-meta">{formatJoDateTime(r.startsAt)}</span>

                  </li>

                ))}

              </ul>

            )}

            <div className="oh-training-overview__card-actions">

              <Link to={`${BASE}/rounds`} className="btn btn-secondary">

                عرض كل الجولات

              </Link>

            </div>

          </OverviewWidgetFrame>

        </DashboardFormCard>



        <QuickNavigationCard />

      </div>

    </DashboardSection>

  );

}


