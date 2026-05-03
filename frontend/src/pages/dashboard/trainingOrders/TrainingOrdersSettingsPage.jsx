import { useEffect, useMemo, useState } from "react";
import {
  adminGetTrainingOrdersSettingsRequest,
  adminPatchTrainingOrdersSettingsRequest,
  listAdminPlansRequest,
} from "../../../services/api";
import "./trainingOrdersAdmin.css";

function errMsg(e) {
  return e?.response?.data?.message || e?.message || "حدث خطأ غير متوقع.";
}

export default function TrainingOrdersSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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

  const save = async () => {
    setError("");
    setSuccess("");
    if (orderRangeInvalid) {
      setError("أقل عدد طلبات لا يمكن أن يتجاوز أقصى عدد طلبات.");
      return;
    }
    if (pctSum !== 100) {
      setError("مجموع نسب المحتوى / البرمجة / التصميم يجب أن يساوي 100٪.");
      return;
    }
    if (!form.showToAllVisitors && !form.showToAllFreelancers && form.planIds.length === 0) {
      setError("فعّل إظهار المستقلين أو الزوار، أو اختر باقة واحدة على الأقل (من الإعدادات المتقدمة).");
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
      setSuccess("تم حفظ الإعدادات بنجاح.");
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p>جاري تحميل الإعدادات…</p>
      </div>
    );
  }

  const c = Number(form.contentPct) || 0;
  const p = Number(form.programmingPct) || 0;
  const d = Number(form.designPct) || 0;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>إعدادات الطلبات التجريبية</h2>
      {error ? <p className="auth-form-error">{error}</p> : null}
      {success ? <p style={{ color: "#15803d", fontWeight: 700 }}>{success}</p> : null}

      <p className="oh-training-settings-kicker">الأساسيات</p>
      <div className="oh-training-settings">
        <section className="oh-training-settings-section">
          <h3 className="oh-training-settings-section__title">الحوض</h3>
          <p className="oh-training-settings-section__help">بدون التفعيل لن تظهر الطلبات التجريبية للمستقلين.</p>
          <div className="oh-training-toggle-field">
            <div className="oh-training-toggle-wrap">
              <button
                type="button"
                role="switch"
                aria-checked={form.trainingOrdersEnabled}
                aria-label="تفعيل ظهور الطلبات التجريبية في الحوض"
                className={`oh-training-toggle ${form.trainingOrdersEnabled ? "is-on" : ""}`.trim()}
                onClick={() => setForm((f) => ({ ...f, trainingOrdersEnabled: !f.trainingOrdersEnabled }))}
              >
                <span className="oh-training-toggle__thumb" aria-hidden />
              </button>
              <span className="oh-training-toggle__state">{form.trainingOrdersEnabled ? "مفعّل في الحوض" : "غير مفعّل"}</span>
            </div>
          </div>
        </section>

        <section className="oh-training-settings-section">
          <h3 className="oh-training-settings-section__title">عدد الطلبات في الجولة</h3>
          <p className="oh-training-settings-section__help">يتم إنشاء عدد عشوائي ضمن هذا النطاق.</p>
          <div className="oh-training-settings-row">
            <div className="oh-training-settings-field">
              <span>أقل عدد طلبات في الجولة</span>
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
              <span>أقصى عدد طلبات في الجولة</span>
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
              أقل عدد يجب أن يكون ≤ أقصى عدد.
            </p>
          ) : null}
        </section>

        <section className="oh-training-settings-section">
          <h3 className="oh-training-settings-section__title">توزيع الطلبات بين التصنيفات</h3>
          <p className="oh-training-settings-section__help">يجب أن يكون المجموع 100٪.</p>

          <div className="oh-training-pct-row">
            <div className="oh-training-pct-item">
              <span className="oh-training-pct-item__label">المحتوى</span>
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
              <span className="oh-training-pct-item__label">البرمجة</span>
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
              <span className="oh-training-pct-item__label">التصميم</span>
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
            المجموع: <strong dir="ltr">{pctSum}</strong>٪{" "}
            {pctDistributionInvalid ? "— يجب أن يساوي 100٪" : "✓ صحيح"}
          </p>
        </section>

        <section className="oh-training-settings-section">
          <h3 className="oh-training-settings-section__title">الظهور</h3>
          <p className="oh-training-settings-section__help">من يمكنه رؤية الطلبات التجريبية في الحوض.</p>
          <label className="oh-training-checkbox-row">
            <input
              type="checkbox"
              checked={form.showToAllFreelancers}
              onChange={(e) => setForm((f) => ({ ...f, showToAllFreelancers: e.target.checked }))}
            />
            <span>إظهار لجميع المستقلين المسجلين</span>
          </label>
          <p className="oh-training-settings-section__help" style={{ marginBottom: 0, marginTop: 10 }}>
            لإظهار الزوار أو ربط الباقات أو تسمية الجولة، افتح «إعدادات متقدمة» أدناه.
          </p>
          {visibilityInvalid ? (
            <p className="oh-training-inline-msg oh-training-inline-msg--error" role="alert">
              يجب تفعيل إظهار للمستقلين، أو للزوار، أو اختيار باقة — راجع الإعدادات المتقدمة.
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
            {saving ? "جاري الحفظ…" : "حفظ الإعدادات"}
          </button>
        </div>
      </div>

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
    </div>
  );
}
