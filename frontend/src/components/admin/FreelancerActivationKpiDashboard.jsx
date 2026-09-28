import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getSuperAdminFreelancerActivationKpisRequest,
  getSuperAdminActivationCampaignRequest,
} from "../../services/api";
import { reasonForMetric } from "../../constants/freelancerActivationKpi";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/activationResources";

const FUNNEL_CARD_KEYS = [
  "trialActivatedUsers",
  "firstBidUsers",
  "firstAssignmentUsers",
  "firstAcceptedWorkUsers",
  "firstPublishedWorkUsers",
  "silverCtaShownUsers",
  "silverPaymentStartedUsers",
  "silverPaidUsers",
];

const FUNNEL_TABLE_KEYS = [
  "registeredUsers",
  "verifiedUsers",
  "trainingCompletedUsers",
  "trialActivatedUsers",
  "firstBidUsers",
  "firstAssignmentUsers",
  "firstAcceptedWorkUsers",
  "firstPublishedWorkUsers",
  "silverCtaShownUsers",
  "silverPaymentStartedUsers",
  "silverPaidUsers",
];

const RATE_CARD_KEYS = [
  "trialActivatedToPaidRate",
  "firstAcceptedToPaidRate",
  "firstPublishedToPaidRate",
  "ctaShownToPaymentStartedRate",
  "paymentStartedToPaidRate",
];

const TIMING_CARD_KEYS = [
  "averageTimeToFirstBid",
  "averageTimeToFirstWin",
  "averageTimeToFirstAccepted",
  "averageTimeToFirstPublished",
];

const QUALITY_CARD_KEYS = [
  "acceptedArticleCount",
  "rejectedArticleCount",
  "revisionRequestedCount",
  "publishedArticleCount",
  "articleAcceptanceRate",
  "articleRejectionRate",
  "revisionRate",
];

const FINANCIAL_CARD_KEYS = [
  "campaignBudgetTotalJod",
  "campaignBudgetReservedJod",
  "campaignBudgetUsedJod",
  "campaignBudgetRemainingJod",
  "pendingFreelancerEarnedJod",
  "costPerPaidFreelancer",
  "subscriptionRevenueJod",
  "workInventoryReserveAllocatedJod",
  "workInventoryReserveActiveJod",
];

function KpiCard({ label, value, helper = null, testId }) {
  return (
    <div
      className="rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#c9d0da)] bg-[color:var(--dash-card,#fcfcfd)] p-3"
      data-testid={testId}
    >
      <p className="mb-1 text-[0.78rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
        {label}
      </p>
      <p className="mb-0 text-[1.05rem] font-extrabold text-[color:var(--dash-text,#172033)]">{value}</p>
      {helper ? (
        <p className="mt-1 mb-0 text-[0.72rem] font-medium text-[color:var(--dash-text-secondary,#6b7280)]">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function SimpleBar({ ratio }) {
  const n = Number(ratio);
  if (!Number.isFinite(n) || n < 0) return null;
  const pct = Math.max(0, Math.min(100, Math.round(n * 100)));
  return (
    <div
      className="mt-2 h-1.5 w-full overflow-hidden rounded bg-[color:var(--dash-border,#e5e7eb)]"
      aria-hidden
    >
      <div
        className="h-full rounded bg-[color:var(--dash-primary,#2f3b65)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Phase A7.2 — Super Admin Activation KPI dashboard (read-only, Arabic).
 */
export default function FreelancerActivationKpiDashboard({ campaigns = [] }) {
  const { t } = useTranslation();
  const unavailableLabel = t("activation.kpi.unavailable");
  const unavailableShort = t("activation.kpi.unavailableShort");
  const formatCount = (value) => {
    if (value == null) return unavailableLabel;
    const n = Number(value);
    if (!Number.isFinite(n)) return unavailableLabel;
    return String(Math.trunc(n));
  };
  const formatRate = (value, { shortUnavailable = false } = {}) => {
    if (value == null) return shortUnavailable ? unavailableShort : unavailableLabel;
    const n = Number(value);
    if (!Number.isFinite(n)) return shortUnavailable ? unavailableShort : unavailableLabel;
    return `${(n * 100).toFixed(1)}%`;
  };
  const formatDays = (value) => {
    if (value == null) return unavailableLabel;
    const n = Number(value);
    if (!Number.isFinite(n)) return unavailableLabel;
    const rounded = Math.round(n * 10) / 10;
    return t("activation.kpi.daysUnit", { value: rounded });
  };
  const formatJod = (value) => {
    if (value == null) return unavailableLabel;
    const raw = String(value).trim();
    if (!raw) return unavailableLabel;
    return `${raw} JOD`;
  };
  const [campaignId, setCampaignId] = useState("");
  const [waveId, setWaveId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [waves, setWaves] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const campaignOptions = useMemo(
    () => (Array.isArray(campaigns) ? campaigns : []),
    [campaigns],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadWaves() {
      if (!campaignId) {
        setWaves([]);
        setWaveId("");
        return;
      }
      try {
        const res = await getSuperAdminActivationCampaignRequest(campaignId);
        if (cancelled) return;
        setWaves(Array.isArray(res?.data?.waves) ? res.data.waves : []);
      } catch {
        if (!cancelled) setWaves([]);
      }
    }
    void loadWaves();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const loadKpis = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (campaignId) params.campaignId = campaignId;
      if (waveId) params.waveId = waveId;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await getSuperAdminFreelancerActivationKpisRequest(params);
      setKpis(res?.data || null);
    } catch {
      setKpis(null);
      setError(t("activation.kpi.loadError"));
    } finally {
      setLoading(false);
    }
  }, [campaignId, waveId, dateFrom, dateTo, t]);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  const funnel = kpis?.funnel || {};
  const rates = kpis?.rates || {};
  const timing = kpis?.timing || {};
  const quality = kpis?.articleQuality || {};
  const financial = kpis?.financial || {};
  const unavailableMetrics = kpis?.metadata?.unavailableMetrics || [];
  const notes = kpis?.metadata?.notes || [];

  return (
    <div data-testid="activation-kpi-dashboard" dir="rtl" className="grid gap-4">
      <div
        className="grid gap-2 rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#c9d0da)] bg-[color:var(--dash-info-bg,#eef1f6)] p-3 md:grid-cols-5"
        data-testid="activation-kpi-filters"
      >
        <label className="grid gap-1 text-[0.82rem] font-semibold">
          {t("activation.kpi.campaign")}
          <select
            data-testid="kpi-filter-campaign"
            value={campaignId}
            onChange={(e) => {
              setCampaignId(e.target.value);
              setWaveId("");
            }}
          >
            <option value="">{t("activation.kpi.allCampaigns")}</option>
            {campaignOptions.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name || `Campaign ${c.id}`}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[0.82rem] font-semibold">
          {t("activation.kpi.wave")}
          <select
            data-testid="kpi-filter-wave"
            value={waveId}
            disabled={!campaignId}
            onChange={(e) => setWaveId(e.target.value)}
          >
            <option value="">{t("activation.kpi.allWaves")}</option>
            {waves.map((w) => (
              <option key={w.id} value={String(w.id)}>
                {w.name || `Wave ${w.id}`}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[0.82rem] font-semibold">
          {t("activation.kpi.dateFrom")}
          <input
            type="date"
            data-testid="kpi-filter-date-from"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-[0.82rem] font-semibold">
          {t("activation.kpi.dateTo")}
          <input
            type="date"
            data-testid="kpi-filter-date-to"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            className="oh-account-btn-primary w-full"
            data-testid="kpi-refresh-button"
            disabled={loading}
            onClick={() => void loadKpis()}
          >
            {loading ? t("activation.kpi.refreshing") : t("activation.kpi.refresh")}
          </button>
        </div>
      </div>

      {loading ? (
        <p data-testid="activation-kpi-loading" className="text-[0.9rem] font-semibold">
          {t("activation.kpi.loading")}
        </p>
      ) : null}

      {!loading && error ? (
        <p
          data-testid="activation-kpi-error"
          className="rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-danger,#f3d1d1)] bg-[#fff5f5] p-3 text-[0.9rem] font-semibold text-[color:var(--dash-danger,#b42318)]"
        >
          {error}
        </p>
      ) : null}

      {!loading && !error && kpis?.schemaReady === false ? (
        <p
          data-testid="activation-kpi-schema-not-ready"
          className="rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#c9d0da)] bg-[color:var(--dash-card,#fcfcfd)] p-3 text-[0.9rem] font-semibold"
        >
          {t("activation.kpi.schemaNotReady")}
        </p>
      ) : null}

      {!loading && !error && kpis && kpis.schemaReady !== false ? (
        <>
          <section>
            <h3 className="mb-2 text-[0.95rem] font-extrabold">{t("activation.kpi.funnelTitle")}</h3>
            <div
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
              data-testid="activation-kpi-funnel-cards"
            >
              {FUNNEL_CARD_KEYS.map((key) => (
                <KpiCard
                  key={key}
                  testId={`kpi-funnel-card-${key}`}
                  label={t(`activation.kpi.funnel.${key}`)}
                  value={formatCount(funnel[key])}
                  helper={
                    funnel[key] == null
                      ? reasonForMetric(unavailableMetrics, `funnel.${key}`)
                      : null
                  }
                />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[0.95rem] font-extrabold">{t("activation.kpi.funnelTableTitle")}</h3>
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[640px] border-collapse text-[0.82rem]"
                data-testid="activation-kpi-funnel-table"
              >
                <thead>
                  <tr className="border-b border-[color:var(--dash-border,#c9d0da)] text-right">
                    <th className="p-2 font-bold">{t("activation.kpi.colStage")}</th>
                    <th className="p-2 font-bold">{t("activation.kpi.colCount")}</th>
                    <th className="p-2 font-bold">{t("activation.kpi.colNote")}</th>
                  </tr>
                </thead>
                <tbody>
                  {FUNNEL_TABLE_KEYS.map((stepKey) => {
                    const value = funnel[stepKey];
                    const unavailableReason = reasonForMetric(
                      unavailable,
                      `funnel.${stepKey}`,
                    );
                    return (
                      <tr
                        key={stepKey}
                        className="border-b border-[color:var(--dash-border,#e5e7eb)]"
                        data-testid={`kpi-funnel-row-${stepKey}`}
                      >
                        <td className="p-2 font-semibold">{t(`activation.kpi.funnelSteps.${stepKey}`)}</td>
                        <td className="p-2 font-extrabold">
                          {value == null ? unavailableLabel : formatCount(value)}
                        </td>
                        <td className="p-2 text-[color:var(--dash-text-secondary,#6b7280)]">
                          {value == null ? unavailableReason || "—" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[0.95rem] font-extrabold">{t("activation.kpi.ratesTitle")}</h3>
            <div
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="activation-kpi-rate-cards"
            >
              {RATE_CARD_KEYS.map((key) => {
                const value = rates[key];
                return (
                  <div key={key}>
                    <KpiCard
                      testId={`kpi-rate-card-${key}`}
                      label={t(`activation.kpi.rates.${key}`)}
                      value={formatRate(value, { shortUnavailable: true })}
                      helper={
                        value == null
                          ? reasonForMetric(unavailableMetrics, `rates.${key}`)
                          : null
                      }
                    />
                    {value != null ? <SimpleBar ratio={value} /> : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[0.95rem] font-extrabold">{t("activation.kpi.timingTitle")}</h3>
            <div
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
              data-testid="activation-kpi-timing-cards"
            >
              {TIMING_CARD_KEYS.map((key) => (
                <KpiCard
                  key={key}
                  testId={`kpi-timing-card-${key}`}
                  label={t(`activation.kpi.timing.${key}`)}
                  value={formatDays(timing[key])}
                />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[0.95rem] font-extrabold">{t("activation.kpi.qualityTitle")}</h3>
            <div
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
              data-testid="activation-kpi-quality-cards"
            >
              {QUALITY_CARD_KEYS.map((key) => {
                const isRate = key.endsWith("Rate");
                const value = quality[key];
                return (
                  <KpiCard
                    key={key}
                    testId={`kpi-quality-card-${key}`}
                    label={t(`activation.kpi.quality.${key}`)}
                    value={isRate ? formatRate(value, { shortUnavailable: true }) : formatCount(value)}
                  />
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[0.95rem] font-extrabold">{t("activation.kpi.financialTitle")}</h3>
            <div
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
              data-testid="activation-kpi-financial-cards"
            >
              {FINANCIAL_CARD_KEYS.map((key) => (
                <KpiCard
                  key={key}
                  testId={`kpi-financial-card-${key}`}
                  label={t(`activation.kpi.financial.${key}`)}
                  value={formatJod(financial[key])}
                  helper={
                    financial[key] == null
                      ? reasonForMetric(unavailableMetrics, `financial.${key}`)
                      : null
                  }
                />
              ))}
            </div>
          </section>

          {(unavailableMetrics.length > 0 || notes.length > 0) && (
            <section
              className="rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#c9d0da)] bg-[color:var(--dash-card,#fcfcfd)] p-3"
              data-testid="activation-kpi-notes"
            >
              <h3 className="mb-1 text-[0.92rem] font-extrabold">{t("activation.kpi.notesTitle")}</h3>
              <p className="mb-2 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
                {t("activation.kpi.notesIntro")}
              </p>
              {unavailableMetrics.length > 0 ? (
                <ul className="mb-2 list-disc pr-5 text-[0.78rem]">
                  {unavailableMetrics.slice(0, 8).map((m) => (
                    <li key={m.key}>
                      <span className="font-bold">{m.key}</span>
                      {m.reason ? ` — ${m.reason}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              {notes.length > 0 ? (
                <ul className="mb-0 list-disc pr-5 text-[0.78rem] text-[color:var(--dash-text-secondary,#4b5563)]">
                  {notes.slice(0, 6).map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
