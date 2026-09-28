import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/economyResources";
import { useToast } from "../../components/ui/toastContext";
import {
  getMarketplaceEconomySettingsRequest,
  updateMarketplaceEconomySettingsRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  areEconomyEnginesDisabled,
  ASSIGNMENT_STRATEGIES_UI,
  settingsToFormState,
  validateMarketplaceEconomyForm,
} from "../../admin/marketplaceEconomy/marketplaceEconomyFormUtils";
import "../../admin/marketplaceEconomy/marketplace-economy-settings.css";

function Field({ id, label, help, error, children, full }) {
  return (
    <div className={`oh-mes-field${full ? " oh-mes-field--full" : ""}`}>
      <label className="oh-mes-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {help ? <p className="oh-mes-help">{help}</p> : null}
      {error ? (
        <p className="oh-mes-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Toggle({ id, label, checked, disabled, onChange }) {
  return (
    <label className="oh-mes-toggle" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default function SuperAdminMarketplaceEconomyPage() {
  const { t } = useTranslation();
  const { push } = useToast();

  const [form, setForm] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await getMarketplaceEconomySettingsRequest();
      const settings = res?.data?.settings || null;
      const next = settingsToFormState(settings);
      setForm(next);
      setSavedSnapshot(next);
      setFieldErrors({});
    } catch (err) {
      setError(
        getSafeApiErrorMessage(err) || t("economy.page.loadError"),
      );
      setForm(null);
      setSavedSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setField = (key, value) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleReset = () => {
    if (!savedSnapshot) return;
    setForm({ ...savedSnapshot });
    setFieldErrors({});
  };

  const handleSave = async () => {
    if (!form) return;
    const { ok, errors, patch } = validateMarketplaceEconomyForm(form, { translate: t });
    if (!ok || !patch) {
      setFieldErrors(errors);
      push({
        type: "error",
        message: t("economy.page.fixFields"),
      });
      return;
    }

    setSaving(true);
    try {
      const res = await updateMarketplaceEconomySettingsRequest(patch);
      const settings = res?.data?.settings;
      if (!settings) {
        throw new Error("missing settings");
      }
      const next = settingsToFormState(settings);
      setForm(next);
      setSavedSnapshot(next);
      setFieldErrors({});
      push({
        type: "success",
        message: t("economy.page.saved"),
      });
    } catch (err) {
      // Keep current form — no partial optimistic commit on failure
      push({
        type: "error",
        message:
          getSafeApiErrorMessage(err) || t("economy.page.saveFailed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const enginesOff = areEconomyEnginesDisabled(form);

  return (
    <DashboardShell className="oh-mes-page">
      <DashboardPageHeader
        eyebrow={t("economy.page.eyebrow")}
        title={t("economy.page.title")}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.marketplaceEconomy")}
        actions={
          <Link className="btn btn-secondary" to="/dashboard/super-admin/marketplace-plans">
            {t("economy.page.plansLink")}
          </Link>
        }
      />

      <p className="oh-mes-notice" role="note">
        {t("economy.page.notice")}
      </p>

      {enginesOff ? (
        <div className="oh-mes-engine-badge" data-testid="mes-engines-off">
          {t("economy.page.enginesOff")}
        </div>
      ) : null}

      <div className="oh-mes-toolbar">
        <Link className="btn btn-secondary" to="/dashboard/super-admin/marketplace-plans">
          {t("economy.page.catalog")}
        </Link>
      </div>

      {loading ? <DashboardLoadingState /> : null}
      {!loading && error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}

      {!loading && !error && form ? (
        <>
          <div className="oh-mes-sections">
            <section className="oh-mes-section" aria-labelledby="mes-priority-boost-title">
              <h2 id="mes-priority-boost-title" className="oh-mes-section__title">
                {t("economy.sections.priorityBoost.title")}
              </h2>
              <p className="oh-mes-section__lede">
                {t("economy.sections.priorityBoost.lede")}
              </p>
              <div className="oh-mes-grid">
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-priority-boost"
                    label={t("economy.sections.priorityBoost.toggle")}
                    checked={Boolean(form.priorityApplicationBoostEnabled)}
                    disabled={saving}
                    onChange={(v) => setField("priorityApplicationBoostEnabled", v)}
                  />
                  <p className="oh-mes-help">
                    {t("economy.sections.priorityBoost.help")}
                  </p>
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-bid-purchases-title">
              <h2 id="mes-bid-purchases-title" className="oh-mes-section__title">
                {t("economy.sections.bidPurchases.title")}
              </h2>
              <p className="oh-mes-section__lede">
                {t("economy.sections.bidPurchases.lede")}
              </p>
              <div className="oh-mes-grid">
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-bid-credits"
                    label={t("economy.sections.bidPurchases.bidCredits")}
                    checked={Boolean(form.bidCreditsEnabled)}
                    disabled={saving}
                    onChange={(v) => setField("bidCreditsEnabled", v)}
                  />
                </div>
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-bid-purchases"
                    label={t("economy.sections.bidPurchases.packagePurchases")}
                    checked={Boolean(form.bidCreditPurchasesEnabled)}
                    disabled={saving}
                    onChange={(v) => setField("bidCreditPurchasesEnabled", v)}
                  />
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-article-min-bids-title">
              <h2 id="mes-article-min-bids-title" className="oh-mes-section__title">
                {t("economy.sections.articleMinBids.title")}
              </h2>
              <p className="oh-mes-section__lede">
                {t("economy.sections.articleMinBids.lede")}
              </p>
              <div className="oh-mes-grid">
                <Field
                  id="mes-art-min-bids"
                  label={t("economy.sections.articleMinBids.minRequired")}
                >
                  <input
                    id="mes-art-min-bids"
                    className="oh-mes-input"
                    value={form.articleMinRequiredBids || ""}
                    disabled={saving}
                    onChange={(e) => setField("articleMinRequiredBids", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-art-def-bids"
                  label={t("economy.sections.articleMinBids.defaultRequired")}
                >
                  <input
                    id="mes-art-def-bids"
                    className="oh-mes-input"
                    value={form.articleDefaultRequiredBidCount || ""}
                    disabled={saving}
                    onChange={(e) => setField("articleDefaultRequiredBidCount", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-art-allowed"
                  label={t("economy.sections.articleMinBids.allowedCounts")}
                >
                  <input
                    id="mes-art-allowed"
                    className="oh-mes-input"
                    value={form.articleAllowedRequiredBidCounts || ""}
                    disabled={saving}
                    onChange={(e) => setField("articleAllowedRequiredBidCounts", e.target.value)}
                  />
                </Field>
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-art-autoclose"
                    label={t("economy.sections.articleMinBids.autoClose")}
                    checked={form.articleAutoCloseWhenThresholdReached !== false}
                    disabled={saving}
                    onChange={(v) => setField("articleAutoCloseWhenThresholdReached", v)}
                  />
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-pantry-bids-title">
              <h2 id="mes-pantry-bids-title" className="oh-mes-section__title">
                {t("economy.sections.pantryMinBids.title")}
              </h2>
              <p className="oh-mes-section__lede">
                {t("economy.sections.pantryMinBids.lede")}
              </p>
              <div className="oh-mes-grid">
                <Field
                  id="mes-pantry-min-bids"
                  label={t("economy.sections.articleMinBids.minRequired")}
                >
                  <input
                    id="mes-pantry-min-bids"
                    className="oh-mes-input"
                    value={form.pantryMinRequiredBids || ""}
                    disabled={saving}
                    onChange={(e) => setField("pantryMinRequiredBids", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-pantry-def-bids"
                  label={t("economy.sections.articleMinBids.defaultRequired")}
                >
                  <input
                    id="mes-pantry-def-bids"
                    className="oh-mes-input"
                    value={form.pantryDefaultRequiredBidCount || ""}
                    disabled={saving}
                    onChange={(e) => setField("pantryDefaultRequiredBidCount", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-pantry-allowed"
                  label={t("economy.sections.articleMinBids.allowedCounts")}
                >
                  <input
                    id="mes-pantry-allowed"
                    className="oh-mes-input"
                    value={form.pantryAllowedRequiredBidCounts || ""}
                    disabled={saving}
                    onChange={(e) => setField("pantryAllowedRequiredBidCounts", e.target.value)}
                  />
                </Field>
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-pantry-autoclose"
                    label={t("economy.sections.articleMinBids.autoClose")}
                    checked={form.pantryAutoCloseWhenThresholdReached !== false}
                    disabled={saving}
                    onChange={(v) => setField("pantryAutoCloseWhenThresholdReached", v)}
                  />
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-e3-orders-title">
              <h2 id="mes-e3-orders-title" className="oh-mes-section__title">
                {t("economy.sections.normalOrders.title")}
              </h2>
              <p className="oh-mes-section__lede">
                {t("economy.sections.normalOrders.lede")}
              </p>
              <div className="oh-mes-grid">
                <Field
                  id="mes-e3-min-value"
                  label={t("economy.sections.normalOrders.minOrder")}
                  error={null}
                >
                  <input
                    id="mes-e3-min-value"
                    className="oh-mes-input"
                    value={form.normalOrderMinValueJod || ""}
                    disabled={saving}
                    onChange={(e) => setField("normalOrderMinValueJod", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-e3-max-value"
                  label={t("economy.sections.normalOrders.maxOrder")}
                >
                  <input
                    id="mes-e3-max-value"
                    className="oh-mes-input"
                    value={form.normalOrderMaxValueJod || ""}
                    disabled={saving}
                    onChange={(e) => setField("normalOrderMaxValueJod", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-e3-def-bid"
                  label={t("economy.sections.normalOrders.defaultBidCost")}
                >
                  <input
                    id="mes-e3-def-bid"
                    className="oh-mes-input"
                    value={form.normalOrderDefaultBidCost || ""}
                    disabled={saving}
                    onChange={(e) => setField("normalOrderDefaultBidCost", e.target.value)}
                  />
                </Field>
                <Field id="mes-e3-min-bid" label={t("economy.sections.normalOrders.minBidCost")}>
                  <input
                    id="mes-e3-min-bid"
                    className="oh-mes-input"
                    value={form.normalOrderMinBidCost || ""}
                    disabled={saving}
                    onChange={(e) => setField("normalOrderMinBidCost", e.target.value)}
                  />
                </Field>
                <Field id="mes-e3-max-bid" label={t("economy.sections.normalOrders.maxBidCost")}>
                  <input
                    id="mes-e3-max-bid"
                    className="oh-mes-input"
                    value={form.normalOrderMaxBidCost || ""}
                    disabled={saving}
                    onChange={(e) => setField("normalOrderMaxBidCost", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-e3-def-apps"
                  label={t("economy.sections.normalOrders.defaultApplicants")}
                >
                  <input
                    id="mes-e3-def-apps"
                    className="oh-mes-input"
                    value={form.normalOrderDefaultTargetApplicants || ""}
                    disabled={saving}
                    onChange={(e) =>
                      setField("normalOrderDefaultTargetApplicants", e.target.value)
                    }
                  />
                </Field>
                <Field
                  id="mes-e3-min-apps"
                  label={t("economy.sections.normalOrders.minApplicants")}
                >
                  <input
                    id="mes-e3-min-apps"
                    className="oh-mes-input"
                    value={form.normalOrderMinTargetApplicants || ""}
                    disabled={saving}
                    onChange={(e) => setField("normalOrderMinTargetApplicants", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-e3-max-apps"
                  label={t("economy.sections.normalOrders.maxApplicants")}
                >
                  <input
                    id="mes-e3-max-apps"
                    className="oh-mes-input"
                    value={form.normalOrderMaxTargetApplicants || ""}
                    disabled={saving}
                    onChange={(e) => setField("normalOrderMaxTargetApplicants", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-e3-deadline-policy"
                  label={t("economy.sections.normalOrders.deadlinePolicy")}
                  full
                >
                  <select
                    id="mes-e3-deadline-policy"
                    className="oh-mes-input"
                    value={form.normalOrderDeadlineIncompleteTargetPolicy || "continue_with_received"}
                    disabled={saving}
                    onChange={(e) =>
                      setField("normalOrderDeadlineIncompleteTargetPolicy", e.target.value)
                    }
                  >
                    <option value="continue_with_received">
                      {t("economy.sections.normalOrders.continueReceived")}
                    </option>
                    <option value="cancel_and_refund">
                      {t("economy.sections.normalOrders.cancelRefund")}
                    </option>
                    <option value="require_admin_review">
                      {t("economy.sections.normalOrders.adminReview")}
                    </option>
                  </select>
                </Field>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-fair-title">
              <h2 id="mes-fair-title" className="oh-mes-section__title">
                {t("economy.sections.fair.title")}
              </h2>
              <p className="oh-mes-section__lede">
                {t("economy.sections.fair.lede")}
              </p>
              <div className="oh-mes-grid">
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-fair"
                    label={t("economy.sections.fair.toggle")}
                    checked={form.fairWorkDistributionEnabled}
                    disabled={saving}
                    onChange={(v) => setField("fairWorkDistributionEnabled", v)}
                  />
                </div>
                <Field
                  id="mes-assign-strategy"
                  label={t("economy.sections.fair.strategy")}
                  error={fieldErrors.assignmentStrategy}
                >
                  <select
                    id="mes-assign-strategy"
                    className="oh-mes-input"
                    dir="ltr"
                    disabled={saving}
                    value={form.assignmentStrategy}
                    onChange={(e) => setField("assignmentStrategy", e.target.value)}
                  >
                    {ASSIGNMENT_STRATEGIES_UI.map((opt) => (
                      <option key={opt.value} value={opt.value} disabled={!opt.available}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  id="mes-fair-lookback"
                  label={t("economy.sections.fair.lookback")}
                  help={t("economy.sections.fair.lookbackHelp")}
                  error={fieldErrors.fairDistributionLookbackDays}
                >
                  <input
                    id="mes-fair-lookback"
                    className="oh-mes-input"
                    type="number"
                    min="1"
                    max="3650"
                    step="1"
                    dir="ltr"
                    disabled={saving}
                    value={form.fairDistributionLookbackDays}
                    onChange={(e) => setField("fairDistributionLookbackDays", e.target.value)}
                  />
                </Field>
                <Field id="mes-w-fair" label="fairness_weight (HYBRID future)" error={fieldErrors.fairnessWeight}>
                  <input
                    id="mes-w-fair"
                    className="oh-mes-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    dir="ltr"
                    disabled={saving}
                    value={form.fairnessWeight}
                    onChange={(e) => setField("fairnessWeight", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-w-token"
                  label={t("economy.sections.fair.tokenWeight")}
                  error={fieldErrors.tokenWeight}
                >
                  <input
                    id="mes-w-token"
                    className="oh-mes-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    dir="ltr"
                    disabled={saving}
                    value={form.tokenWeight}
                    onChange={(e) => setField("tokenWeight", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-award-reset"
                  label={t("economy.sections.fair.awardReset")}
                >
                  <select
                    id="mes-award-reset"
                    className="oh-mes-input"
                    dir="ltr"
                    disabled={saving}
                    value={form.awardResetPolicy}
                    onChange={(e) => setField("awardResetPolicy", e.target.value)}
                  >
                    <option value="RESET_TO_ZERO">RESET_TO_ZERO</option>
                    <option value="DECREMENT_ONE">DECREMENT_ONE</option>
                    <option value="NO_RESET">NO_RESET</option>
                  </select>
                </Field>
                <p className="oh-mes-help oh-mes-field--full">
                  {t("economy.sections.fair.awardResetHelp")}
                </p>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-commission-title">
              <h2 id="mes-commission-title" className="oh-mes-section__title">
                {t("economy.sections.commission.title")}
              </h2>
              <p className="oh-mes-section__lede">
                {t("economy.sections.commission.lede")}
              </p>
              <div className="oh-mes-grid">
                <Field
                  id="mes-commission"
                  label={t("economy.sections.commission.pct")}
                  help={t("economy.sections.commission.pctHelp")}
                  error={fieldErrors.platformCommissionPercentage}
                >
                  <input
                    id="mes-commission"
                    className="oh-mes-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    dir="ltr"
                    disabled={saving}
                    value={form.platformCommissionPercentage}
                    onChange={(e) => setField("platformCommissionPercentage", e.target.value)}
                  />
                </Field>
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-commission"
                    label={t("economy.sections.commission.toggle")}
                    checked={form.marketplaceCommissionEnabled}
                    disabled={saving}
                    onChange={(v) => setField("marketplaceCommissionEnabled", v)}
                  />
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-cash-title">
              <h2 id="mes-cash-title" className="oh-mes-section__title">
                {t("economy.sections.cash.title")}
              </h2>
              <p className="oh-mes-section__lede">
                {t("economy.sections.cash.lede")}
              </p>
              <div className="oh-mes-grid">
                <Field
                  id="mes-cash-fee"
                  label={t("economy.sections.cash.fee")}
                  help={t("economy.sections.cash.feeHelp")}
                  error={fieldErrors.cashProcessingFeeJod}
                >
                  <input
                    id="mes-cash-fee"
                    className="oh-mes-input"
                    type="number"
                    min="0"
                    step="0.001"
                    dir="ltr"
                    disabled={saving}
                    value={form.cashProcessingFeeJod}
                    onChange={(e) => setField("cashProcessingFeeJod", e.target.value)}
                  />
                </Field>
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-cash"
                    label={t("economy.sections.cash.toggle")}
                    checked={form.cashMembershipPaymentsEnabled}
                    disabled={saving}
                    onChange={(v) => setField("cashMembershipPaymentsEnabled", v)}
                  />
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-elite-title">
              <h2 id="mes-elite-title" className="oh-mes-section__title">
                {t("economy.sections.elite.title")}
              </h2>
              <p className="oh-mes-section__lede">
                {t("economy.sections.elite.lede")}
              </p>
              <div className="oh-mes-grid">
                <Field
                  id="mes-elite-per-cycle"
                  label={t("economy.sections.elite.perCycle")}
                  error={fieldErrors.eliteDirectOrdersPerCycle}
                >
                  <input
                    id="mes-elite-per-cycle"
                    className="oh-mes-input"
                    type="number"
                    min="0"
                    step="1"
                    dir="ltr"
                    disabled={saving}
                    value={form.eliteDirectOrdersPerCycle}
                    onChange={(e) => setField("eliteDirectOrdersPerCycle", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-elite-offer"
                  label={t("economy.sections.elite.offerMinutes")}
                  error={fieldErrors.eliteOfferDurationMinutes}
                >
                  <input
                    id="mes-elite-offer"
                    className="oh-mes-input"
                    type="number"
                    min="1"
                    step="1"
                    dir="ltr"
                    disabled={saving}
                    value={form.eliteOfferDurationMinutes}
                    onChange={(e) => setField("eliteOfferDurationMinutes", e.target.value)}
                  />
                </Field>
                <div className="oh-mes-field">
                  <Toggle
                    id="mes-elite-cf-on"
                    label={t("economy.sections.elite.carryForward")}
                    checked={form.eliteCarryForwardEnabled}
                    disabled={saving}
                    onChange={(v) => setField("eliteCarryForwardEnabled", v)}
                  />
                  <p className="oh-mes-help">
                    {t("economy.sections.elite.carryForwardHelp")}
                  </p>
                </div>
                <Field
                  id="mes-elite-cf-days"
                  label={t("economy.sections.elite.carryDays")}
                  error={fieldErrors.eliteCarryForwardDays}
                >
                  <input
                    id="mes-elite-cf-days"
                    className="oh-mes-input"
                    type="number"
                    min="0"
                    step="1"
                    dir="ltr"
                    disabled={saving}
                    value={form.eliteCarryForwardDays}
                    onChange={(e) => setField("eliteCarryForwardDays", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-elite-cf-max"
                  label={t("economy.sections.elite.carryMax")}
                  error={fieldErrors.eliteMaximumCarryForward}
                >
                  <input
                    id="mes-elite-cf-max"
                    className="oh-mes-input"
                    type="number"
                    min="0"
                    step="1"
                    dir="ltr"
                    disabled={saving}
                    value={form.eliteMaximumCarryForward}
                    onChange={(e) => setField("eliteMaximumCarryForward", e.target.value)}
                  />
                </Field>
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-elite-declines"
                    label={t("economy.sections.elite.declinesFlag")}
                    checked={form.eliteDeclinesAffectCarryForward}
                    disabled={saving}
                    onChange={(v) => setField("eliteDeclinesAffectCarryForward", v)}
                  />
                  <p className="oh-mes-help">
                    {t("economy.sections.elite.declinesHelp")}
                  </p>
                </div>
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-elite"
                    label={t("economy.sections.elite.toggle")}
                    checked={form.eliteEngineEnabled}
                    disabled={saving}
                    onChange={(v) => setField("eliteEngineEnabled", v)}
                  />
                  <p className="oh-mes-help">
                    {t("economy.sections.elite.toggleHelp")}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="oh-mes-footer">
            <Button type="button" variant="secondary" disabled={saving} onClick={handleReset}>
              {t("economy.page.reset")}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? t("economy.page.saving") : t("economy.page.save")}
            </Button>
          </div>
        </>
      ) : null}
    </DashboardShell>
  );
}
