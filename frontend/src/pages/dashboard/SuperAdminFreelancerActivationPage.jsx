import { useCallback, useEffect, useState } from "react";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  getSuperAdminFreelancerActivationSettingsRequest,
  getSuperAdminFreelancerActivationEarnedBalanceRequest,
  getSuperAdminFreelancerActivationTrialsRequest,
  getSuperAdminWorkInventoryReserveRequest,
  listSuperAdminActivationCampaignsRequest,
  createSuperAdminActivationCampaignRequest,
  getSuperAdminActivationCampaignRequest,
  pauseSuperAdminActivationCampaignRequest,
  resumeSuperAdminActivationCampaignRequest,
  emergencyStopSuperAdminActivationCampaignRequest,
  createSuperAdminActivationWaveRequest,
  updateSuperAdminFreelancerActivationSettingsRequest,
} from "../../services/api";
import { sharesSumToTotal } from "../../constants/freelancerActivationCampaign";
import FreelancerActivationKpiDashboard from "../../components/admin/FreelancerActivationKpiDashboard";
import { Link } from "react-router-dom";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/activationResources";

const emptyCampaignForm = {
  name: "",
  totalBudgetJod: "0.000",
  articleTotalValueJod: "1.000",
  freelancerShareJod: "0.500",
  companyShareJod: "0.300",
  reviewerShareJod: "0.200",
};

const emptyWaveForm = {
  name: "",
  budgetJod: "0.000",
};

export default function SuperAdminFreelancerActivationPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [earnedBalance, setEarnedBalance] = useState(null);
  const [conversion, setConversion] = useState(null);
  const [workInventoryReserve, setWorkInventoryReserve] = useState(null);
  const [wirSaving, setWirSaving] = useState(false);
  const [wirFormError, setWirFormError] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyCampaignForm);
  const [formError, setFormError] = useState("");
  const [waveForm, setWaveForm] = useState(emptyWaveForm);
  const [waveError, setWaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settingsRes, listRes, earnedRes, trialsRes, wirRes] = await Promise.all([
        getSuperAdminFreelancerActivationSettingsRequest(),
        listSuperAdminActivationCampaignsRequest(),
        getSuperAdminFreelancerActivationEarnedBalanceRequest().catch(() => null),
        getSuperAdminFreelancerActivationTrialsRequest().catch(() => null),
        getSuperAdminWorkInventoryReserveRequest().catch(() => null),
      ]);
      setSettings(settingsRes?.data?.settings || null);
      setCampaigns(listRes?.data?.campaigns || []);
      setEarnedBalance(earnedRes?.data || null);
      setConversion(trialsRes?.data?.conversion || null);
      setWorkInventoryReserve(wirRes?.data || null);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("activation.page.errLoadCampaigns"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function openCampaign(id) {
    try {
      const res = await getSuperAdminActivationCampaignRequest(id);
      setDetail(res?.data || null);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("activation.page.errLoadCampaign"));
    }
  }

  async function onCreateCampaign(e) {
    e.preventDefault();
    setFormError("");
    if (Number(form.totalBudgetJod) < 0) {
      setFormError(t("activation.page.errBudgetNegative"));
      return;
    }
    if (!sharesSumToTotal(form.articleTotalValueJod, form.freelancerShareJod, form.companyShareJod, form.reviewerShareJod)) {
      setFormError(t("activation.page.errSharesSum"));
      return;
    }
    setSaving(true);
    try {
      const res = await createSuperAdminActivationCampaignRequest(form);
      setForm(emptyCampaignForm);
      await loadList();
      if (res?.data?.campaign?.id) await openCampaign(res.data.campaign.id);
    } catch (err) {
      setFormError(getSafeApiErrorMessage(err) || t("activation.page.errCreateCampaign"));
    } finally {
      setSaving(false);
    }
  }

  async function onCreateWave(e) {
    e.preventDefault();
    if (!detail?.campaign?.id) return;
    setWaveError("");
    if (Number(waveForm.budgetJod) < 0) {
      setWaveError(t("activation.page.errWaveBudgetNegative"));
      return;
    }
    setSaving(true);
    try {
      await createSuperAdminActivationWaveRequest(detail.campaign.id, waveForm);
      setWaveForm(emptyWaveForm);
      await openCampaign(detail.campaign.id);
      await loadList();
    } catch (err) {
      setWaveError(getSafeApiErrorMessage(err) || t("activation.page.errCreateWave"));
    } finally {
      setSaving(false);
    }
  }

  async function onEmergencyStop() {
    if (!detail?.campaign?.id) return;
    const ok = window.confirm(t("activation.page.emergencyStopConfirm"));
    if (!ok) return;
    setSaving(true);
    try {
      await emergencyStopSuperAdminActivationCampaignRequest(detail.campaign.id);
      await openCampaign(detail.campaign.id);
      await loadList();
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("activation.page.errStopCampaign"));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveWorkInventorySettings(e) {
    e.preventDefault();
    setWirFormError("");
    const enabled = e.target.workInventoryEnabled?.checked === true;
    const percentage = Number(e.target.workInventoryPercentage?.value);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      setWirFormError(t("activation.page.errPctRange"));
      return;
    }
    setWirSaving(true);
    try {
      const res = await updateSuperAdminFreelancerActivationSettingsRequest({
        workInventoryEnabled: enabled,
        workInventoryPercentage: percentage,
      });
      setSettings(res?.data?.settings || null);
      const wirRes = await getSuperAdminWorkInventoryReserveRequest().catch(() => null);
      setWorkInventoryReserve(wirRes?.data || null);
    } catch (err) {
      setWirFormError(getSafeApiErrorMessage(err) || t("activation.page.errSaveWir"));
    } finally {
      setWirSaving(false);
    }
  }

  const budget = detail?.budget;

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("activation.page.title")}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.freelancerActivation")}
      />
      {loading ? <DashboardLoadingState /> : null}
      {!loading && error ? <DashboardErrorState message={error} onRetry={loadList} /> : null}

      <DashboardSection title={t("activation.page.articleMgmtTitle")}>
        <div data-testid="activation-article-mgmt-link-card" className="grid gap-2 max-w-xl">
          <p>{t("activation.page.articleMgmtBody")}</p>
          <Link
            to="/dashboard/super-admin/articles"
            className="oh-account-btn-primary"
            data-testid="activation-open-article-management"
            style={{ display: "inline-block", textAlign: "center", maxWidth: "16rem" }}
          >
            {t("activation.page.openArticles")}
          </Link>
        </div>
      </DashboardSection>

      {settings ? (
        <DashboardSection title={t("activation.page.settingsTitle")}>
          <p data-testid="activation-settings-snapshot">
            {t("activation.page.settingsSnapshot", {
              engine: settings.engineEnabled ? t("activation.page.engineOn") : t("activation.page.engineOff"),
              days: settings.trialDurationDays,
              bids: settings.trialBids,
              daily: settings.dailyBidLimit,
            })}
          </p>
        </DashboardSection>
      ) : null}

      {earnedBalance ? (
        <DashboardSection title={t("activation.page.earnedTitle")}>
          <p data-testid="admin-earned-balance-summary">
            {t("activation.page.earnedSummary", {
              pending: earnedBalance.totalPendingJod,
              accepted: earnedBalance.totalAcceptedArticles,
              published: earnedBalance.totalPublishedArticles,
            })}
          </p>
        </DashboardSection>
      ) : null}

      {workInventoryReserve || settings ? (
        <DashboardSection title={t("activation.page.wirTitle")}>
          <div data-testid="admin-work-inventory-reserve" className="grid gap-3 max-w-2xl">
            <p data-testid="admin-wir-status">
              {t("activation.page.wirStatus", {
                status:
                  (workInventoryReserve?.settings?.workInventoryEnabled ?? settings?.workInventoryEnabled)
                    ? t("activation.page.engineOn")
                    : t("activation.page.engineOff"),
                pct:
                  workInventoryReserve?.settings?.workInventoryPercentage ??
                  settings?.workInventoryPercentage ??
                  50,
              })}
            </p>
            <p data-testid="admin-wir-totals">
              {t("activation.page.wirTotals", {
                allocated: workInventoryReserve?.totalReserveAllocatedJod ?? "0.000",
                active: workInventoryReserve?.totalReserveActiveJod ?? "0.000",
                reversed: workInventoryReserve?.totalReserveReversedJod ?? "0.000",
              })}
            </p>
            <p data-testid="admin-wir-internal-note" className="text-sm opacity-90">
              {t("activation.page.wirNote")}
            </p>
            <form
              onSubmit={onSaveWorkInventorySettings}
              data-testid="admin-wir-settings-form"
              className="grid gap-2"
            >
              <label>
                <input
                  type="checkbox"
                  name="workInventoryEnabled"
                  defaultChecked={Boolean(
                    workInventoryReserve?.settings?.workInventoryEnabled ??
                      settings?.workInventoryEnabled,
                  )}
                />{" "}
                {t("activation.page.wirEnable")}
              </label>
              <label>
                {t("activation.page.wirPctLabel")}
                <input
                  name="workInventoryPercentage"
                  type="number"
                  min={0}
                  max={100}
                  step="0.001"
                  defaultValue={
                    workInventoryReserve?.settings?.workInventoryPercentage ??
                    settings?.workInventoryPercentage ??
                    50
                  }
                />
              </label>
              {wirFormError ? <p data-testid="admin-wir-settings-error">{wirFormError}</p> : null}
              <button type="submit" className="oh-account-btn-primary" disabled={wirSaving}>
                {t("activation.page.wirSave")}
              </button>
            </form>
            {(workInventoryReserve?.recentEntries || []).length > 0 ? (
              <ul data-testid="admin-wir-recent-entries">
                {workInventoryReserve.recentEntries.slice(0, 10).map((entry) => (
                  <li key={entry.id}>
                    {t("activation.page.wirEntry", {
                      userId: entry.freelancerUserId,
                      plan: entry.planCode,
                      amount: entry.reserveAmountJod,
                      status: entry.status,
                    })}
                  </li>
                ))}
              </ul>
            ) : (
              <p data-testid="admin-wir-empty">{t("activation.page.wirEmpty")}</p>
            )}
          </div>
        </DashboardSection>
      ) : null}

      {conversion ? (
        <DashboardSection title={t("activation.page.conversionTitle")}>
          <p data-testid="admin-conversion-counters">
            {t("activation.page.conversionCounters", {
              shown: conversion.ctaShownCount ?? 0,
              started: conversion.paymentStartedCount ?? 0,
              paid: conversion.paidActiveCount ?? 0,
              ratePart:
                conversion.trialToSilverRate != null
                  ? t("activation.page.ratePart", { rate: conversion.trialToSilverRate })
                  : t("activation.page.rateDash"),
            })}
          </p>
        </DashboardSection>
      ) : null}

      {!loading ? (
        <DashboardSection title={t("activation.page.kpiSectionTitle")}>
          <FreelancerActivationKpiDashboard campaigns={campaigns} />
        </DashboardSection>
      ) : null}

      <DashboardSection title={t("activation.page.createCampaignTitle")}>
        <form onSubmit={onCreateCampaign} data-testid="create-campaign-form" className="grid gap-2 max-w-xl">
          <input
            required
            placeholder={t("activation.page.campaignNamePlaceholder")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <label>
            {t("activation.page.totalBudgetLabel")}
            <input
              value={form.totalBudgetJod}
              onChange={(e) => setForm({ ...form, totalBudgetJod: e.target.value })}
            />
          </label>
          <label>
            {t("activation.page.sharesLabel")}
            <input
              value={form.articleTotalValueJod}
              onChange={(e) => setForm({ ...form, articleTotalValueJod: e.target.value })}
            />
            <input
              value={form.freelancerShareJod}
              onChange={(e) => setForm({ ...form, freelancerShareJod: e.target.value })}
            />
            <input
              value={form.companyShareJod}
              onChange={(e) => setForm({ ...form, companyShareJod: e.target.value })}
            />
            <input
              value={form.reviewerShareJod}
              onChange={(e) => setForm({ ...form, reviewerShareJod: e.target.value })}
            />
          </label>
          {formError ? <p data-testid="create-campaign-error">{formError}</p> : null}
          <button type="submit" className="oh-account-btn-primary" disabled={saving}>
            {t("activation.page.createCampaign")}
          </button>
        </form>
      </DashboardSection>

      <DashboardSection title={t("activation.page.campaignsTitle")}>
        {campaigns.length === 0 ? (
          <DashboardEmptyState title={t("activation.page.noCampaigns")} description={t("activation.page.noCampaignsDesc")} />
        ) : (
          <ul data-testid="activation-campaign-list">
            {campaigns.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => void openCampaign(c.id)}>
                  {t("activation.page.campaignListItem", {
                    name: c.name,
                    status: c.status,
                    remaining: c.budget?.remainingBudgetJod,
                  })}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      {detail?.campaign ? (
        <DashboardSection title={t("activation.page.detailTitle")}>
          <div data-testid="campaign-detail">
            <p>
              {detail.campaign.name} · {detail.campaign.status}
              {detail.campaign.emergencyStopEnabled ? t("activation.page.emergencyStopTag") : ""}
            </p>
            <p data-testid="linked-articles-count">
              {t("activation.page.linkedArticles", { count: detail.linkedArticlesCount ?? 0 })}
            </p>
            <p data-testid="emergency-stop-copy">{t("activation.page.emergencyStopCopy")}</p>
            <dl data-testid="campaign-budget-summary">
              <div>{t("activation.page.budgetTotal", { value: budget?.totalBudgetJod })}</div>
              <div>{t("activation.page.budgetReserved", { value: budget?.reservedBudgetJod })}</div>
              <div>{t("activation.page.budgetUsed", { value: budget?.usedBudgetJod })}</div>
              <div>{t("activation.page.budgetRemaining", { value: budget?.remainingBudgetJod })}</div>
              <div>{t("activation.page.budgetAllocatedWaves", { value: budget?.allocatedToWavesJod })}</div>
              <div>{t("activation.page.budgetUnallocated", { value: budget?.unallocatedBudgetJod })}</div>
            </dl>
            <p data-testid="assigned-articles-count">
              {t("activation.page.assignedArticles", { count: detail.assignedArticleCount ?? 0 })}
            </p>
            <p data-testid="accepted-articles-count">
              {t("activation.page.acceptedArticles", { count: detail.acceptedArticleCount ?? 0 })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void pauseSuperAdminActivationCampaignRequest(detail.campaign.id).then(() => openCampaign(detail.campaign.id))}
              >
                {t("activation.page.pause")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void resumeSuperAdminActivationCampaignRequest(detail.campaign.id).then(() => openCampaign(detail.campaign.id))}
              >
                {t("activation.page.resume")}
              </button>
              <button
                type="button"
                data-testid="emergency-stop-button"
                disabled={saving}
                onClick={() => void onEmergencyStop()}
              >
                {t("activation.page.emergencyStop")}
              </button>
            </div>
            <h3 className="mt-3">{t("activation.page.wavesTitle")}</h3>
            <ul data-testid="activation-wave-list">
              {(detail.waves || []).map((w) => (
                <li key={w.id} data-testid="activation-wave-budget">
                  {t("activation.page.waveListItem", {
                    name: w.name,
                    status: w.status,
                    reserved: w.budget?.reservedBudgetJod,
                    used: w.budget?.usedBudgetJod,
                    remaining: w.budget?.remainingBudgetJod,
                  })}
                </li>
              ))}
            </ul>
            <form onSubmit={onCreateWave} data-testid="create-wave-form" className="mt-2 grid gap-2 max-w-xl">
              <input
                required
                placeholder={t("activation.page.waveNamePlaceholder")}
                value={waveForm.name}
                onChange={(e) => setWaveForm({ ...waveForm, name: e.target.value })}
              />
              <input
                value={waveForm.budgetJod}
                onChange={(e) => setWaveForm({ ...waveForm, budgetJod: e.target.value })}
              />
              {waveError ? <p>{waveError}</p> : null}
              <button type="submit" disabled={saving}>
                {t("activation.page.createWave")}
              </button>
            </form>
          </div>
        </DashboardSection>
      ) : null}
    </DashboardShell>
  );
}
