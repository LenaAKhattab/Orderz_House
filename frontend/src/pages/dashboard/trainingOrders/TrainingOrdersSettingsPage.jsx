import { useEffect, useMemo, useState } from "react";
import {
  adminGetTrainingOrdersSettingsRequest,
  adminPatchTrainingOrdersSettingsRequest,
  listAdminPlansRequest,
} from "../../../services/api";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardFormCard from "../../../components/dashboard/DashboardFormCard";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "./trainingOrdersAdmin.css";

function errMsg(e) {
  return e?.response?.data?.message || e?.message || "حدث خطأ غير متوقع.";
}

export default function TrainingOrdersSettingsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [visibilityError, setVisibilityError] = useState("");
  const [visibilitySuccess, setVisibilitySuccess] = useState("");
  const [plans, setPlans] = useState([]);
  const [autoMeta, setAutoMeta] = useState({
    nextAutomationRunAt: null,
    lastAutomationRunAt: null,
    lastAutomationStatus: null,
    lastAutomationError: null,
    lastAutomationGeneratedCount: null,
    lastAutomationNextAt: null,
  });

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
    setError("");
    setLoading(true);
    try {
      const [setRes, plansRes] = await Promise.all([
        adminGetTrainingOrdersSettingsRequest(),
        listAdminPlansRequest(false),
      ]);
      const d = setRes?.data;
      const dist = d?.categoryDistribution || {};
      setAutoMeta({
        nextAutomationRunAt: d?.nextAutomationRunAt ?? null,
        lastAutomationRunAt: d?.lastAutomationRunAt ?? null,
        lastAutomationStatus: d?.lastAutomationStatus ?? null,
        lastAutomationError: d?.lastAutomationError ?? null,
        lastAutomationGeneratedCount: d?.lastAutomationGeneratedCount ?? null,
        lastAutomationNextAt: d?.lastAutomationNextAt ?? null,
      });
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
      setError(errMsg(e));
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
    setVisibilityError("");
    setVisibilitySuccess("");
    setVisibilitySaving(true);
    try {
      const res = await adminPatchTrainingOrdersSettingsRequest({ trainingOrdersEnabled: next });
      const enabled = Boolean(res?.data?.trainingOrdersEnabled ?? next);
      setForm((f) => ({ ...f, trainingOrdersEnabled: enabled }));
      setVisibilitySuccess(
        enabled ? t("trainingOrders.settings.visibilityShownSuccess") : t("trainingOrders.settings.visibilityHiddenSuccess"),
      );
      await load();
    } catch (e) {
      setVisibilityError(errMsg(e));
    } finally {
      setVisibilitySaving(false);
    }
  };

  const save = async () => {
    setError("");
    setSuccess("");
    if (orderRangeInvalid) {
      setError(t("trainingOrders.settings.orderRangeSaveError"));
      return;
    }
    if (pctSum !== 100) {
      setError(t("trainingOrders.settings.distributionSaveError"));
      return;
    }
    if (!form.showToAllVisitors && !form.showToAllFreelancers && form.planIds.length === 0) {
      setError(t("trainingOrders.settings.visibilitySaveError"));
      return;
    }
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
      setSuccess(t("trainingOrders.settings.saveSuccess"));
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardSection
        className="oh-training-page-section"
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

  return (
    <DashboardSection
      className="oh-training-page-section"
      title={t("trainingOrders.settings.title")}
      description={t("trainingOrders.settings.description")}
    >
      {error ? <p className="auth-form-error">{error}</p> : null}
      {success ? (
        <p style={{ color: "#15803d", fontWeight: 700, margin: error ? "8px 0 0" : 0 }}>{success}</p>
      ) : null}

      <DashboardFormCard title={t("trainingOrders.settings.visibilityCardTitle")}>
        <div
          className={`oh-training-visibility-control ${form.trainingOrdersEnabled ? "oh-training-visibility-control--on" : "oh-training-visibility-control--off"}`.trim()}
        >
          <p className="oh-training-visibility-control__status" role="status">
            {form.trainingOrdersEnabled ? t("trainingOrders.settings.visibilityOn") : t("trainingOrders.settings.visibilityOff")}
          </p>
          <p className="oh-training-visibility-control__help">
            {form.trainingOrdersEnabled ? t("trainingOrders.settings.visibilityOnHelp") : t("trainingOrders.settings.visibilityOffHelp")}
          </p>
          {visibilityError ? <p className="auth-form-error">{visibilityError}</p> : null}
          {visibilitySuccess ? (
            <p className="oh-training-visibility-control__success">{visibilitySuccess}</p>
          ) : null}
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

      <DashboardFormCard title={t("trainingOrders.settings.basics")}>
          <div className="oh-training-settings">

        <section className="oh-training-settings-section">
          <h3 className="oh-training-settings-section__title">{t("trainingOrders.settings.ordersPerRound")}</h3>
          <p className="oh-training-settings-section__help">{t("trainingOrders.settings.ordersPerRoundHelp")}</p>
          <div className="oh-training-settings-row">
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
        </section>

        <section className="oh-training-settings-section">
          <h3 className="oh-training-settings-section__title">{t("trainingOrders.settings.categoryDistribution")}</h3>
          <p className="oh-training-settings-section__help">{t("trainingOrders.settings.categoryDistributionHelp")}</p>

          <div className="oh-training-pct-row">
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
            className="oh-training-pct-bar"
            role="img"
            aria-label={`توزيع: محتوى ${c}٪، برمجة ${p}٪، تصميم ${d}٪`}
          >
            <div
              className="oh-training-pct-bar__seg oh-training-pct-bar__seg--content"
              style={{ flex: Math.max(0, c) }}
            />
            <div
              className="oh-training-pct-bar__seg oh-training-pct-bar__seg--programming"
              style={{ flex: Math.max(0, p) }}
            />
            <div
              className="oh-training-pct-bar__seg oh-training-pct-bar__seg--design"
              style={{ flex: Math.max(0, d) }}
            />
          </div>
          <div className="oh-training-pct-legend">
            <span>
              <span className="oh-training-pct-dot oh-training-pct-dot--content" aria-hidden /> محتوى
            </span>
            <span>
              <span className="oh-training-pct-dot oh-training-pct-dot--programming" aria-hidden /> برمجة
            </span>
            <span>
              <span className="oh-training-pct-dot oh-training-pct-dot--design" aria-hidden /> تصميم
            </span>
          </div>

          <p
            className={`oh-training-inline-msg ${pctDistributionInvalid ? "oh-training-inline-msg--error" : "oh-training-inline-msg--ok"}`}
          >
            {t("trainingOrders.settings.distributionSum")} <strong dir="ltr">{pctSum}</strong>٪{" "}
            {pctDistributionInvalid ? t("trainingOrders.settings.distributionMustBe100") : t("trainingOrders.settings.distributionOk")}
          </p>
        </section>

        <section className="oh-training-settings-section">
          <h3 className="oh-training-settings-section__title">{t("trainingOrders.settings.visibility")}</h3>
          <p className="oh-training-settings-section__help">{t("trainingOrders.settings.visibilityHelp")}</p>
          <label className="oh-training-checkbox-row">
            <input
              type="checkbox"
              checked={form.showToAllFreelancers}
              onChange={(e) => setForm((f) => ({ ...f, showToAllFreelancers: e.target.checked }))}
            />
            <span>{t("trainingOrders.settings.showAllFreelancers")}</span>
          </label>
          <p className="oh-training-settings-section__help" style={{ marginBottom: 0, marginTop: 10 }}>
            {t("trainingOrders.settings.advancedHint")}
          </p>
          {visibilityInvalid ? (
            <p className="oh-training-inline-msg oh-training-inline-msg--error" role="alert">
              {t("trainingOrders.settings.visibilityRequired")}
            </p>
          ) : null}
        </section>

            <div className="oh-training-settings-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || orderRangeInvalid || pctDistributionInvalid || visibilityInvalid}
                onClick={save}
              >
                {saving ? t("trainingOrders.settings.saving") : t("trainingOrders.settings.save")}
              </button>
            </div>
          </div>
        </DashboardFormCard>

        <details className="oh-training-settings-advanced">
        <summary>إعدادات متقدمة</summary>
        <div className="oh-training-settings-advanced__body">
          <section className="oh-training-settings-section">
            <h3 className="oh-training-settings-section__title">الجدولة والمدة</h3>
            <p className="oh-training-settings-section__help">
              مدة الجولة تحدد الظهور وانتهاء الجولة وموعد الجولة التلقائية التالية.
            </p>
            <label className="oh-training-checkbox-row">
              <input
                type="checkbox"
                checked={form.automationEnabled}
                onChange={(e) => setForm((f) => ({ ...f, automationEnabled: e.target.checked }))}
              />
              <span>تشغيل الجدولة التلقائية للجولات (الخادم)</span>
            </label>
            <div className="oh-training-settings-row">
              <div className="oh-training-settings-field">
                <span>مدة الجولة</span>
                <input
                  type="number"
                  min={1}
                  value={form.durationValue}
                  onChange={(e) => setForm((f) => ({ ...f, durationValue: e.target.value }))}
                  dir="ltr"
                />
              </div>
              <div className="oh-training-settings-field">
                <span>الوحدة</span>
                <select value={form.durationUnit} onChange={(e) => setForm((f) => ({ ...f, durationUnit: e.target.value }))}>
                  <option value="minutes">دقائق</option>
                  <option value="hours">ساعات</option>
                  <option value="days">أيام</option>
                </select>
              </div>
            </div>
          </section>

          <section className="oh-training-settings-section oh-training-settings-section--muted">
            <h3 className="oh-training-settings-section__title">حالة الأتمتة (قراءة فقط)</h3>
            <p className="help" style={{ margin: "4px 0" }}>
              <strong>موعد التشغيل القادم:</strong>{" "}
              {autoMeta.nextAutomationRunAt ? new Date(autoMeta.nextAutomationRunAt).toLocaleString("ar-JO") : "—"}
            </p>
            <p className="help" style={{ margin: "4px 0" }}>
              <strong>آخر تشغيل:</strong>{" "}
              {autoMeta.lastAutomationRunAt ? new Date(autoMeta.lastAutomationRunAt).toLocaleString("ar-JO") : "—"}
            </p>
            <p className="help" style={{ margin: "4px 0" }}>
              <strong>الحالة:</strong>{" "}
              {autoMeta.lastAutomationStatus === "success"
                ? "نجاح"
                : autoMeta.lastAutomationStatus === "skipped_no_templates"
                  ? "تخطي — لا قوالب"
                  : autoMeta.lastAutomationStatus === "skipped_lock"
                    ? "تخطي — قفل"
                    : autoMeta.lastAutomationStatus === "failed"
                      ? "فشل"
                      : autoMeta.lastAutomationStatus || "—"}
            </p>
            {autoMeta.lastAutomationError ? (
              <p className="auth-form-error" style={{ marginTop: 8, marginBottom: 0 }}>
                {String(autoMeta.lastAutomationError)}
              </p>
            ) : null}
          </section>

          <section className="oh-training-settings-section">
            <h3 className="oh-training-settings-section__title">ظهور إضافي</h3>
            <label className="oh-training-checkbox-row">
              <input
                type="checkbox"
                checked={form.showToAllVisitors}
                onChange={(e) => setForm((f) => ({ ...f, showToAllVisitors: e.target.checked }))}
              />
              <span>إظهار لجميع الزوار (مشاهدة فقط)</span>
            </label>
            <div style={{ marginTop: 12 }}>
              <span className="oh-training-settings-section__title" style={{ fontSize: "0.9rem", display: "block", marginBottom: 6 }}>
                الباقات المؤهلة
              </span>
              <div className="oh-training-plans-box">
                {plans.length === 0 ? <span className="help">لا توجد باقات.</span> : null}
                {plans.map((pl) => (
                  <label key={pl.id} className="oh-training-checkbox-row" style={{ marginBottom: 8 }}>
                    <input type="checkbox" checked={form.planIds.includes(String(pl.id))} onChange={() => togglePlan(pl.id)} />
                    <span>{pl.title || pl.name || pl.id}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="oh-training-settings-field" style={{ maxWidth: "100%", marginTop: 12 }}>
              <span>اسم الجولة (اختياري)</span>
              <input
                value={form.optionalRoundName}
                onChange={(e) => setForm((f) => ({ ...f, optionalRoundName: e.target.value }))}
                placeholder="مثال: جولة تدريب صباحية"
              />
            </div>
          </section>
        </div>
        </details>
    </DashboardSection>
  );
}
