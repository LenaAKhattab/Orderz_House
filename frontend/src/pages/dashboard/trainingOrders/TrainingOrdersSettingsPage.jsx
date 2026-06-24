import { useEffect, useMemo, useState } from "react";
import {
  adminGetTrainingOrdersSettingsRequest,
  adminPatchTrainingOrdersSettingsRequest,
  listAdminPlansRequest,
} from "../../../services/api";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardFormCard from "../../../components/dashboard/DashboardFormCard";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import { useToast } from "../../../components/ui/toastContext";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { formatAdminNumber, trainingAdminT } from "./trainingOrdersDisplayUtils";
import "./trainingOrdersAdmin.css";

export default function TrainingOrdersSettingsPage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const errMsg = (e) => getSafeApiErrorMessage(e) || t("trainingOrders.settings.genericError");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [plans, setPlans] = useState([]);

  const [form, setForm] = useState({
    trainingOrdersEnabled: false,
    automationEnabled: false,
    minOrders: 40,
    maxOrders: 50,
    durationValue: 12,
    durationUnit: "hours",
    contentPct: 20,
    programmingPct: 20,
    designPct: 60,
    showToAllVisitors: false,
    showToAllFreelancers: false,
    optionalRoundName: "",
    planIds: [],
  });

  const pctSum = useMemo(
    () => Number(form.contentPct) + Number(form.programmingPct) + Number(form.designPct),
    [form.contentPct, form.programmingPct, form.designPct],
  );

  const orderRangeInvalid = useMemo(() => {
    const lo = Number(form.minOrders);
    const hi = Number(form.maxOrders);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
    return lo > hi;
  }, [form.minOrders, form.maxOrders]);

  const pctDistributionInvalid = pctSum !== 100;

  const visibilityInvalid = useMemo(
    () => !form.showToAllVisitors && !form.showToAllFreelancers && form.planIds.length === 0,
    [form.showToAllVisitors, form.showToAllFreelancers, form.planIds],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [setRes, plansRes] = await Promise.all([
        adminGetTrainingOrdersSettingsRequest(),
        listAdminPlansRequest(false),
      ]);
      const d = setRes?.data;
      const dist = d?.categoryDistribution || {};
      setForm((prev) => ({
        ...prev,
        trainingOrdersEnabled: Boolean(d?.trainingOrdersEnabled),
        automationEnabled: Boolean(d?.automationEnabled),
        minOrders: d?.minOrders ?? 40,
        maxOrders: d?.maxOrders ?? 50,
        durationValue: d?.durationValue ?? 12,
        durationUnit: d?.durationUnit || "hours",
        contentPct: dist.content ?? 20,
        programmingPct: dist.programming ?? 20,
        designPct: dist.design ?? 60,
        showToAllVisitors: Boolean(d?.showToAllVisitors),
        showToAllFreelancers: Boolean(d?.showToAllFreelancers),
        optionalRoundName: d?.optionalRoundName || "",
        planIds: Array.isArray(d?.planIds) ? d.planIds.map(String) : [],
      }));
      setPlans(plansRes?.data?.plans || []);
    } catch (e) {
      push({ type: "error", message: errMsg(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const togglePlan = (id) => {
    const sid = String(id);
    setForm((f) => ({
      ...f,
      planIds: f.planIds.includes(sid) ? f.planIds.filter((x) => x !== sid) : [...f.planIds, sid],
    }));
  };

  const toggleTrainingVisibility = async () => {
    const next = !form.trainingOrdersEnabled;
    setVisibilitySaving(true);
    try {
      const res = await adminPatchTrainingOrdersSettingsRequest({ trainingOrdersEnabled: next });
      const enabled = Boolean(res?.data?.trainingOrdersEnabled ?? next);
      setForm((f) => ({ ...f, trainingOrdersEnabled: enabled }));
      push({
        type: "success",
        message: enabled
          ? t("trainingOrders.settings.visibilityShownSuccess")
          : t("trainingOrders.settings.visibilityHiddenSuccess"),
      });
      await load();
    } catch (e) {
      push({ type: "error", message: errMsg(e) });
    } finally {
      setVisibilitySaving(false);
    }
  };

  const save = async () => {
    if (orderRangeInvalid || pctSum !== 100 || visibilityInvalid) return;
    setSaving(true);
    try {
      await adminPatchTrainingOrdersSettingsRequest({
        trainingOrdersEnabled: form.trainingOrdersEnabled,
        automationEnabled: form.automationEnabled,
        minOrders: Number(form.minOrders),
        maxOrders: Number(form.maxOrders),
        durationValue: Number(form.durationValue),
        durationUnit: form.durationUnit,
        categoryDistribution: {
          content: Number(form.contentPct),
          programming: Number(form.programmingPct),
          design: Number(form.designPct),
        },
        showToAllVisitors: form.showToAllVisitors,
        showToAllFreelancers: form.showToAllFreelancers,
        planIds: form.planIds.map((x) => Number(x)),
        optionalRoundName: form.optionalRoundName.trim() || null,
      });
      push({ type: "success", message: t("trainingOrders.settings.saveSuccess") });
      await load();
    } catch (e) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(e) || t("trainingOrders.settings.saveError"),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardSection
        className="oh-training-page-section oh-training-settings-page"
        title={t("trainingOrders.settings.title")}
        description={t("trainingOrders.settings.description")}
      >
        <DashboardLoadingState label={t("trainingOrders.settings.loading")} />
      </DashboardSection>
    );
  }

  const c = Number(form.contentPct) || 0;
  const p = Number(form.programmingPct) || 0;
  const d = Number(form.designPct) || 0;
  const cardClass = "oh-training-overview__card oh-training-overview__card--compact";

  return (
    <DashboardSection
      className="oh-training-page-section oh-training-settings-page"
      title={t("trainingOrders.settings.title")}
      description={t("trainingOrders.settings.description")}
    >
      <DashboardFormCard title={t("trainingOrders.settings.visibilityCardTitle")} className={cardClass}>
        <div
          className={`oh-training-visibility-control ${form.trainingOrdersEnabled ? "oh-training-visibility-control--on" : "oh-training-visibility-control--off"}`.trim()}
        >
          <p className="oh-training-visibility-control__status" role="status">
            {form.trainingOrdersEnabled ? t("trainingOrders.settings.visibilityOn") : t("trainingOrders.settings.visibilityOff")}
          </p>
          <p className="oh-training-visibility-control__help">
            {form.trainingOrdersEnabled ? t("trainingOrders.settings.visibilityOnHelp") : t("trainingOrders.settings.visibilityOffHelp")}
          </p>
          <button
            type="button"
            className={`btn ${form.trainingOrdersEnabled ? "btn-secondary" : "btn-primary"} oh-training-visibility-control__btn`}
            disabled={visibilitySaving}
            onClick={() => void toggleTrainingVisibility()}
          >
            {visibilitySaving
              ? t("trainingOrders.settings.updating")
              : form.trainingOrdersEnabled
                ? t("trainingOrders.settings.hideFromMarketplace")
                : t("trainingOrders.settings.showInMarketplace")}
          </button>
        </div>
      </DashboardFormCard>

      <div className="oh-training-settings-grid">
        <DashboardFormCard title={t("trainingOrders.settings.roundSettings")} className={cardClass}>
          <p className="oh-training-settings-card-help">{t("trainingOrders.settings.ordersPerRoundHelp")}</p>
          <div className="oh-training-settings-row oh-training-settings-row--pair">
            <div className="oh-training-settings-field">
              <span>{t("trainingOrders.settings.minOrders")}</span>
              <input
                type="number"
                min={1}
                value={form.minOrders}
                className={orderRangeInvalid ? "oh-training-input--error" : undefined}
                onChange={(e) => setForm((f) => ({ ...f, minOrders: e.target.value }))}
                dir="ltr"
              />
            </div>
            <div className="oh-training-settings-field">
              <span>{t("trainingOrders.settings.maxOrders")}</span>
              <input
                type="number"
                min={1}
                value={form.maxOrders}
                className={orderRangeInvalid ? "oh-training-input--error" : undefined}
                onChange={(e) => setForm((f) => ({ ...f, maxOrders: e.target.value }))}
                dir="ltr"
              />
            </div>
          </div>
          {orderRangeInvalid ? (
            <p className="oh-training-inline-msg oh-training-inline-msg--error" role="alert">
              {t("trainingOrders.settings.orderRangeError")}
            </p>
          ) : null}
        </DashboardFormCard>

        <DashboardFormCard title={t("trainingOrders.settings.categoryDistribution")} className={cardClass}>
          <div className="oh-training-pct-row oh-training-pct-row--compact">
            <div className="oh-training-pct-item">
              <span className="oh-training-pct-item__label">{t("trainingOrders.settings.content")}</span>
              <div className={`oh-training-pct-item__wrap ${pctDistributionInvalid ? "oh-training-input--error" : ""}`.trim()}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.contentPct}
                  onChange={(e) => setForm((f) => ({ ...f, contentPct: e.target.value }))}
                  dir="ltr"
                  aria-invalid={pctDistributionInvalid}
                />
                <span className="oh-training-pct-suffix">%</span>
              </div>
            </div>
            <div className="oh-training-pct-item">
              <span className="oh-training-pct-item__label">{t("trainingOrders.settings.programming")}</span>
              <div className={`oh-training-pct-item__wrap ${pctDistributionInvalid ? "oh-training-input--error" : ""}`.trim()}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.programmingPct}
                  onChange={(e) => setForm((f) => ({ ...f, programmingPct: e.target.value }))}
                  dir="ltr"
                  aria-invalid={pctDistributionInvalid}
                />
                <span className="oh-training-pct-suffix">%</span>
              </div>
            </div>
            <div className="oh-training-pct-item">
              <span className="oh-training-pct-item__label">{t("trainingOrders.settings.design")}</span>
              <div className={`oh-training-pct-item__wrap ${pctDistributionInvalid ? "oh-training-input--error" : ""}`.trim()}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.designPct}
                  onChange={(e) => setForm((f) => ({ ...f, designPct: e.target.value }))}
                  dir="ltr"
                  aria-invalid={pctDistributionInvalid}
                />
                <span className="oh-training-pct-suffix">%</span>
              </div>
            </div>
          </div>

          <div
            className="oh-training-pct-bar oh-training-pct-bar--compact"
            role="img"
            aria-label={trainingAdminT(t, "trainingOrders.settings.distributionLegendAria", { content: c, programming: p, design: d })}
          >
            <div className="oh-training-pct-bar__seg oh-training-pct-bar__seg--content" style={{ flex: Math.max(0, c) }} />
            <div className="oh-training-pct-bar__seg oh-training-pct-bar__seg--programming" style={{ flex: Math.max(0, p) }} />
            <div className="oh-training-pct-bar__seg oh-training-pct-bar__seg--design" style={{ flex: Math.max(0, d) }} />
          </div>

          <p
            className={`oh-training-inline-msg oh-training-settings-total ${pctDistributionInvalid ? "oh-training-inline-msg--error" : "oh-training-inline-msg--ok"}`}
          >
            {pctDistributionInvalid ? (
              <>
                {t("trainingOrders.settings.distributionSum")}{" "}
                <strong className="oh-training-num" dir="ltr">
                  {formatAdminNumber(pctSum)}%
                </strong>{" "}
                {t("trainingOrders.settings.distributionMustBe100")}
              </>
            ) : (
              t("trainingOrders.settings.distributionTotalValid")
            )}
          </p>
        </DashboardFormCard>
      </div>

      <DashboardFormCard title={t("trainingOrders.settings.audienceTitle")} className={cardClass}>
        <label className="oh-training-checkbox-row">
          <input
            type="checkbox"
            checked={form.showToAllFreelancers}
            onChange={(e) => setForm((f) => ({ ...f, showToAllFreelancers: e.target.checked }))}
          />
          <span>{t("trainingOrders.settings.showAllFreelancers")}</span>
        </label>
        {(form.showToAllVisitors || form.planIds.length > 0) && (
          <div className="oh-training-audience-chips" aria-label={t("trainingOrders.settings.audienceChipsLabel")}>
            {form.showToAllVisitors ? (
              <span className="oh-training-audience-chip">{t("trainingOrders.settings.audienceChipVisitors")}</span>
            ) : null}
            {form.planIds.length > 0 ? (
              <span className="oh-training-audience-chip">
                {trainingAdminT(t, "trainingOrders.settings.audienceChipPlans", { count: form.planIds.length })}
              </span>
            ) : null}
          </div>
        )}
        {visibilityInvalid ? (
          <p className="oh-training-inline-msg oh-training-inline-msg--error" role="alert">
            {t("trainingOrders.settings.visibilityRequired")}
          </p>
        ) : null}
      </DashboardFormCard>

      <div className="oh-training-settings-footer">
        <details className="oh-training-settings-advanced">
          <summary>{t("trainingOrders.settings.advanced.summary")}</summary>
          <div className="oh-training-settings-advanced__body">
            <div className="oh-training-settings-advanced__grid">
              <section className="oh-training-settings-advanced-card" aria-labelledby="oh-training-advanced-automation-title">
                <h3 id="oh-training-advanced-automation-title" className="oh-training-settings-advanced-card__title">
                  {t("trainingOrders.settings.advanced.automaticRoundsCard")}
                </h3>
                <label className="oh-training-checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.automationEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, automationEnabled: e.target.checked }))}
                  />
                  <span>{t("trainingOrders.settings.advanced.enableScheduling")}</span>
                </label>
                <div className="oh-training-settings-row oh-training-settings-row--pair">
                  <div className="oh-training-settings-field">
                    <span>{t("trainingOrders.settings.advanced.roundDuration")}</span>
                    <input
                      type="number"
                      min={1}
                      value={form.durationValue}
                      onChange={(e) => setForm((f) => ({ ...f, durationValue: e.target.value }))}
                      dir="ltr"
                    />
                  </div>
                  <div className="oh-training-settings-field">
                    <span>{t("trainingOrders.settings.advanced.unit")}</span>
                    <select value={form.durationUnit} onChange={(e) => setForm((f) => ({ ...f, durationUnit: e.target.value }))}>
                      <option value="minutes">{t("trainingOrders.settings.advanced.unitMinutes")}</option>
                      <option value="hours">{t("trainingOrders.settings.advanced.unitHours")}</option>
                      <option value="days">{t("trainingOrders.settings.advanced.unitDays")}</option>
                    </select>
                  </div>
                </div>
                <p className="oh-training-settings-advanced-hint">{t("trainingOrders.settings.advanced.schedulingStatusHint")}</p>
              </section>

              <section className="oh-training-settings-advanced-card" aria-labelledby="oh-training-advanced-visibility-title">
                <h3 id="oh-training-advanced-visibility-title" className="oh-training-settings-advanced-card__title">
                  {t("trainingOrders.settings.advanced.visibilityOptionsCard")}
                </h3>
                <label className="oh-training-checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.showToAllVisitors}
                    onChange={(e) => setForm((f) => ({ ...f, showToAllVisitors: e.target.checked }))}
                  />
                  <span>{t("trainingOrders.settings.advanced.showVisitors")}</span>
                </label>
                <div className="oh-training-settings-field oh-training-settings-field--full">
                  <span>{t("trainingOrders.settings.advanced.eligiblePlans")}</span>
                  <div className="oh-training-plans-box">
                    {plans.length === 0 ? (
                      <p className="oh-training-plans-box__empty">{t("trainingOrders.settings.advanced.noPlans")}</p>
                    ) : (
                      plans.map((pl) => {
                        const selected = form.planIds.includes(String(pl.id));
                        return (
                          <label
                            key={pl.id}
                            className={`oh-training-plan-option ${selected ? "oh-training-plan-option--selected" : ""}`.trim()}
                          >
                            <input type="checkbox" checked={selected} onChange={() => togglePlan(pl.id)} />
                            <span>{pl.title || pl.name || pl.id}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </details>

        <div className="oh-training-settings-save">
          <button
            type="button"
            className="btn btn-primary oh-training-settings-save__btn"
            disabled={saving || orderRangeInvalid || pctDistributionInvalid || visibilityInvalid}
            onClick={save}
          >
            {saving ? t("trainingOrders.settings.saving") : t("trainingOrders.settings.save")}
          </button>
        </div>
      </div>
    </DashboardSection>
  );
}
