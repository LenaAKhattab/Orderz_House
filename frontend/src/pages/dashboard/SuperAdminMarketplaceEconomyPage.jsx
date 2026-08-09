import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import {
  getMarketplaceEconomySettingsRequest,
  updateMarketplaceEconomySettingsRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  areEconomyEnginesDisabled,
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
  const { locale } = useTranslation();
  const isEn = locale === "en";
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
        getSafeApiErrorMessage(err) ||
          (isEn ? "Failed to load economy settings." : "تعذر تحميل إعدادات اقتصاد العمل."),
      );
      setForm(null);
      setSavedSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [isEn]);

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
    const { ok, errors, patch } = validateMarketplaceEconomyForm(form, { isEn });
    if (!ok || !patch) {
      setFieldErrors(errors);
      push({
        type: "error",
        message: isEn ? "Fix invalid fields before saving." : "صحّح الحقول غير الصالحة قبل الحفظ.",
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
        message: isEn ? "Economy settings saved." : "تم حفظ إعدادات اقتصاد العمل.",
      });
    } catch (err) {
      // Keep current form — no partial optimistic commit on failure
      push({
        type: "error",
        message:
          getSafeApiErrorMessage(err) ||
          (isEn ? "Save failed. Values were not changed." : "فشل الحفظ. لم تُغيَّر القيم."),
      });
    } finally {
      setSaving(false);
    }
  };

  const enginesOff = areEconomyEnginesDisabled(form);

  return (
    <DashboardShell className="oh-mes-page">
      <DashboardPageHeader
        eyebrow={isEn ? "Super admin · باقات العمل" : "لوحة المدير الأعلى · باقات العمل"}
        title={isEn ? "Work economy settings" : "إعدادات اقتصاد العمل"}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.marketplaceEconomy")}
        actions={
          <Link className="btn btn-secondary" to="/dashboard/super-admin/marketplace-plans">
            {isEn ? "Work membership plans" : "باقات العمل"}
          </Link>
        }
      />

      <p className="oh-mes-notice" role="note">
        {isEn ? (
          <>
            These settings belong to <strong>Work memberships (باقات العمل)</strong> only. They do{" "}
            <strong>not</strong> control Main packages or Plan pages. Fake/training orders are excluded —
            economy policy applies to real customer-funded orders only. Changing values here does not
            grant, deduct, or refund tokens and does not run commission or Elite engines.
          </>
        ) : (
          <>
            هذه الإعدادات تخص <strong>باقات العمل</strong> فقط، ولا تتحكم في{" "}
            <strong>الباقات الرئيسية</strong> أو <strong>باقات الصفحات</strong>. الطلبات التجريبية
            مستثناة — السياسة الاقتصادية للطلبات الحقيقية المموّلة من العملاء فقط. تغيير القيم هنا لا
            يمنح ولا يخصم ولا يسترد Tokens ولا يشغّل العمولة أو نظام Elite.
          </>
        )}
      </p>

      {enginesOff ? (
        <div className="oh-mes-engine-badge" data-testid="mes-engines-off">
          {isEn
            ? "All economy execution engines are OFF (safe defaults)."
            : "جميع محركات التنفيذ الاقتصادي متوقفة (وضع آمن)."}
        </div>
      ) : null}

      <div className="oh-mes-toolbar">
        <Link className="btn btn-secondary" to="/dashboard/super-admin/marketplace-plans">
          {isEn ? "← Catalog" : "→ الكتالوج"}
        </Link>
      </div>

      {loading ? <DashboardLoadingState /> : null}
      {!loading && error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}

      {!loading && !error && form ? (
        <>
          <div className="oh-mes-sections">
            <section className="oh-mes-section" aria-labelledby="mes-tokens-title">
              <h2 id="mes-tokens-title" className="oh-mes-section__title">
                {isEn ? "1. Work Tokens" : "أولاً: Work Tokens"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "Accounting value, bid rate, and refund policy for real-order applications."
                  : "القيمة المحاسبية، معدل التقديم، وسياسة الاسترداد لطلبات العمل الحقيقية."}
              </p>
              <div className="oh-mes-grid">
                <Field
                  id="mes-token-value"
                  label={isEn ? "Work Token value (JOD)" : "قيمة Work Token (د.أ)"}
                  help={
                    isEn
                      ? "Accounting value of one Work Token."
                      : "القيمة المحاسبية لكل Work Token."
                  }
                  error={fieldErrors.workTokenValueJod}
                >
                  <input
                    id="mes-token-value"
                    className="oh-mes-input"
                    type="number"
                    min="0.001"
                    step="0.001"
                    dir="ltr"
                    disabled={saving}
                    value={form.workTokenValueJod}
                    onChange={(e) => setField("workTokenValueJod", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-bid-rate"
                  label={isEn ? "Tokens per 1 JOD order value" : "Tokens لكل 1 دينار من قيمة الطلب"}
                  help={
                    isEn
                      ? "Work Tokens required to apply per 1 JOD of real order value."
                      : "عدد Work Tokens المطلوبة للتقديم مقابل كل 1 دينار من قيمة الطلب الحقيقي."
                  }
                  error={fieldErrors.bidTokensPerOrderJod}
                >
                  <input
                    id="mes-bid-rate"
                    className="oh-mes-input"
                    type="number"
                    min="0.001"
                    step="0.001"
                    dir="ltr"
                    disabled={saving}
                    value={form.bidTokensPerOrderJod}
                    onChange={(e) => setField("bidTokensPerOrderJod", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-refund"
                  label={isEn ? "Refund % when no freelancer selected" : "نسبة الاسترداد عند عدم اختيار مستقل"}
                  help={
                    isEn
                      ? "Percent refunded if a real order ends without selecting any freelancer."
                      : "النسبة التي تعاد للمستقل إذا انتهى الطلب الحقيقي دون اختيار أي مستقل."
                  }
                  error={fieldErrors.applicationTokenRefundPercentage}
                >
                  <input
                    id="mes-refund"
                    className="oh-mes-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    dir="ltr"
                    disabled={saving}
                    value={form.applicationTokenRefundPercentage}
                    onChange={(e) => setField("applicationTokenRefundPercentage", e.target.value)}
                  />
                </Field>
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-tokens"
                    label={isEn ? "Enable Work Tokens engine" : "تفعيل نظام Work Tokens"}
                    checked={form.workTokensEnabled}
                    disabled={saving}
                    onChange={(v) => setField("workTokensEnabled", v)}
                  />
                  <p className="oh-mes-help">
                    {isEn
                      ? "Master switch. Keep OFF until wallet/ledger phases ship."
                      : "المفتاح الرئيسي. أبقِه متوقفاً حتى تكتمل مراحل المحفظة والسجل."}
                  </p>
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-commission-title">
              <h2 id="mes-commission-title" className="oh-mes-section__title">
                {isEn ? "2. Commission" : "ثانياً: العمولة"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "Platform share of completed real work value — configuration only."
                  : "حصة المنصة من قيمة العمل الحقيقي المنفّذ — إعداد فقط."}
              </p>
              <div className="oh-mes-grid">
                <Field
                  id="mes-commission"
                  label={isEn ? "Platform commission %" : "نسبة عمولة المنصة"}
                  help={
                    isEn
                      ? "Percent the platform earns from completed real work value."
                      : "النسبة التي تحصل عليها المنصة من قيمة العمل المنفذ فعلياً."
                  }
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
                    label={isEn ? "Enable marketplace commission engine" : "تفعيل نظام العمولة"}
                    checked={form.marketplaceCommissionEnabled}
                    disabled={saving}
                    onChange={(v) => setField("marketplaceCommissionEnabled", v)}
                  />
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-cash-title">
              <h2 id="mes-cash-title" className="oh-mes-section__title">
                {isEn ? "3. Cash membership payments" : "ثالثاً: الدفع النقدي"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "Admin fee per cash TRANSACTION — not per month, not activation fee, not membership price."
                  : "رسوم إدارية لكل عملية Cash — ليست عن كل شهر، وليست رسوم التفعيل، وليست سعر الباقة."}
              </p>
              <div className="oh-mes-grid">
                <Field
                  id="mes-cash-fee"
                  label={isEn ? "Cash processing fee (JOD)" : "الرسوم الإدارية لكل عملية Cash (د.أ)"}
                  help={
                    isEn
                      ? "Fixed admin fee per cash membership transaction (not per month)."
                      : "رسوم إدارية ثابتة لكل عملية دفع نقدي، وليست عن كل شهر."
                  }
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
                    label={isEn ? "Enable cash membership payments" : "تفعيل الدفع النقدي لباقات العمل"}
                    checked={form.cashMembershipPaymentsEnabled}
                    disabled={saving}
                    onChange={(v) => setField("cashMembershipPaymentsEnabled", v)}
                  />
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-verify-title">
              <h2 id="mes-verify-title" className="oh-mes-section__title">
                {isEn ? "4. Verification bonuses" : "رابعاً: مكافآت التوثيق"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "Policy amounts only — no tokens are granted in this phase."
                  : "مبالغ السياسة فقط — لا تُمنح أي Tokens في هذه المرحلة."}
              </p>
              <div className="oh-mes-grid">
                <Field
                  id="mes-id-bonus"
                  label={isEn ? "Identity verification bonus (tokens)" : "مكافأة توثيق الهوية (Tokens)"}
                  error={fieldErrors.identityVerificationBonusTokens}
                >
                  <input
                    id="mes-id-bonus"
                    className="oh-mes-input"
                    type="number"
                    min="0"
                    step="1"
                    dir="ltr"
                    disabled={saving}
                    value={form.identityVerificationBonusTokens}
                    onChange={(e) => setField("identityVerificationBonusTokens", e.target.value)}
                  />
                </Field>
                <div className="oh-mes-field">
                  <Toggle
                    id="mes-id-bonus-on"
                    label={isEn ? "Identity bonus policy enabled" : "تفعيل سياسة مكافأة الهوية"}
                    checked={form.identityVerificationBonusEnabled}
                    disabled={saving}
                    onChange={(v) => setField("identityVerificationBonusEnabled", v)}
                  />
                </div>
                <Field
                  id="mes-payout-bonus"
                  label={
                    isEn
                      ? "Payout method verification bonus (tokens)"
                      : "مكافأة توثيق وسيلة استلام الأرباح (Tokens)"
                  }
                  error={fieldErrors.payoutMethodVerificationBonusTokens}
                >
                  <input
                    id="mes-payout-bonus"
                    className="oh-mes-input"
                    type="number"
                    min="0"
                    step="1"
                    dir="ltr"
                    disabled={saving}
                    value={form.payoutMethodVerificationBonusTokens}
                    onChange={(e) => setField("payoutMethodVerificationBonusTokens", e.target.value)}
                  />
                </Field>
                <div className="oh-mes-field">
                  <Toggle
                    id="mes-payout-bonus-on"
                    label={isEn ? "Payout bonus policy enabled" : "تفعيل سياسة مكافأة وسيلة الاستلام"}
                    checked={form.payoutMethodVerificationBonusEnabled}
                    disabled={saving}
                    onChange={(v) => setField("payoutMethodVerificationBonusEnabled", v)}
                  />
                </div>
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-verify"
                    label={
                      isEn
                        ? "Enable verification bonuses engine"
                        : "تفعيل محرك منح مكافآت التوثيق"
                    }
                    checked={form.verificationBonusesEnabled}
                    disabled={saving}
                    onChange={(v) => setField("verificationBonusesEnabled", v)}
                  />
                  <p className="oh-mes-help">
                    {isEn
                      ? "Keep OFF until verification flows exist. Policy toggles above do not grant tokens alone."
                      : "أبقِه متوقفاً حتى تُبنى مسارات التوثيق. تفعيل السياسة أعلاه وحده لا يمنح Tokens."}
                  </p>
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-elite-title">
              <h2 id="mes-elite-title" className="oh-mes-section__title">
                {isEn ? "5. Elite Direct Orders" : "خامساً: Elite"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "Global Elite engine policy. Tier eligibility remains on each marketplace plan."
                  : "سياسة محرك Elite العامة. أهلية الباقة تبقى على كل باقة عمل."}
              </p>
              <div className="oh-mes-grid">
                <Field
                  id="mes-elite-per-cycle"
                  label={isEn ? "Direct orders per cycle" : "طلبات مباشرة لكل دورة"}
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
                  label={isEn ? "Offer duration (minutes)" : "مدة العرض (دقائق)"}
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
                    label={isEn ? "Carry forward enabled" : "تفعيل الترحيل (Carry Forward)"}
                    checked={form.eliteCarryForwardEnabled}
                    disabled={saving}
                    onChange={(v) => setField("eliteCarryForwardEnabled", v)}
                  />
                  <p className="oh-mes-help">
                    {isEn
                      ? "Carry one entitlement when no suitable real matching demand exists (future rules)."
                      : "ترحيل استحقاق واحد عند عدم توفر طلب حقيقي مناسب وفق القواعد المستقبلية."}
                  </p>
                </div>
                <Field
                  id="mes-elite-cf-days"
                  label={isEn ? "Carry-forward days" : "أيام الترحيل"}
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
                  label={isEn ? "Maximum carry-forward" : "الحد الأقصى للترحيل"}
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
                    label={
                      isEn
                        ? "Declines may affect carry-forward (future)"
                        : "الرفض المتكرر قد يمنع الترحيل (مستقبلاً)"
                    }
                    checked={form.eliteDeclinesAffectCarryForward}
                    disabled={saving}
                    onChange={(v) => setField("eliteDeclinesAffectCarryForward", v)}
                  />
                  <p className="oh-mes-help">
                    {isEn
                      ? "Extensibility flag only. Fake/training demand never counts toward matching."
                      : "علم توسعة فقط. الطلبات التجريبية لا تُحسب ضمن المطابقة الحقيقية."}
                  </p>
                </div>
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-elite"
                    label={isEn ? "Enable Elite engine (global)" : "تفعيل محرك Elite (عام)"}
                    checked={form.eliteEngineEnabled}
                    disabled={saving}
                    onChange={(v) => setField("eliteEngineEnabled", v)}
                  />
                  <p className="oh-mes-help">
                    {isEn
                      ? "Operational switch for the Elite system — distinct from plan-tier Elite capability."
                      : "مفتاح تشغيل نظام Elite — مختلف عن أهلية باقة Elite في الكتالوج."}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="oh-mes-footer">
            <Button type="button" variant="secondary" disabled={saving} onClick={handleReset}>
              {isEn ? "Reset" : "إعادة القيم المحفوظة"}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving
                ? isEn
                  ? "Saving…"
                  : "جارٍ الحفظ…"
                : isEn
                  ? "Save settings"
                  : "حفظ الإعدادات"}
            </Button>
          </div>
        </>
      ) : null}
    </DashboardShell>
  );
}
