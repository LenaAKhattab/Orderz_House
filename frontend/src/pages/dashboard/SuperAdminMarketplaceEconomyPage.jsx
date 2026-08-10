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
                {isEn ? "1. Work Tokens & normal applications" : "أولاً: Work Tokens والتقديم العادي"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "Accounting value and OPTIONAL normal apply-token policy. Priority Bid amount is chosen by the Freelancer — not this rate."
                  : "القيمة المحاسبية وسياسة Tokens الاختيارية للتقديم العادي. مبلغ Priority Bid يختاره المستقل — وليس هذا المعدل."}
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
                  id="mes-normal-rate"
                  label={
                    isEn
                      ? "Normal apply tokens per 1 JOD (optional future)"
                      : "Tokens للتقديم العادي لكل 1 دينار (مستقبلي اختياري)"
                  }
                  help={
                    isEn
                      ? "NOT Priority Bid. Future optional cost for normal applications only."
                      : "ليست Priority Bid. تكلفة اختيارية مستقبلية للتقديم العادي فقط."
                  }
                  error={fieldErrors.normalApplicationTokensPerOrderJod}
                >
                  <input
                    id="mes-normal-rate"
                    className="oh-mes-input"
                    type="number"
                    min="0.001"
                    step="0.001"
                    dir="ltr"
                    disabled={saving}
                    value={form.normalApplicationTokensPerOrderJod}
                    onChange={(e) => setField("normalApplicationTokensPerOrderJod", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-normal-refund"
                  label={
                    isEn
                      ? "Normal apply refund % (no freelancer selected)"
                      : "نسبة استرداد التقديم العادي (عند عدم اختيار مستقل)"
                  }
                  help={
                    isEn
                      ? "Does NOT control Priority Bid losers — those always release 100% reserved Tokens."
                      : "لا تتحكم في خاسري Priority Bid — يُحرَّر دائماً 100% من Tokens المحجوزة."
                  }
                  error={fieldErrors.normalApplicationTokenRefundPercentage}
                >
                  <input
                    id="mes-normal-refund"
                    className="oh-mes-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    dir="ltr"
                    disabled={saving}
                    value={form.normalApplicationTokenRefundPercentage}
                    onChange={(e) =>
                      setField("normalApplicationTokenRefundPercentage", e.target.value)
                    }
                  />
                </Field>
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-tokens"
                    label={isEn ? "Enable Work Tokens engine (wallet/ledger)" : "تفعيل نظام Work Tokens (محفظة/سجل)"}
                    checked={form.workTokensEnabled}
                    disabled={saving}
                    onChange={(v) => setField("workTokensEnabled", v)}
                  />
                  <p className="oh-mes-help">
                    {isEn
                      ? "Required before Priority Bid can go live. Keep OFF until wallet AVAILABLE/RESERVED exists."
                      : "مطلوب قبل تشغيل Priority Bid. أبقِه متوقفاً حتى توجد محفظة AVAILABLE/RESERVED."}
                  </p>
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-priority-title">
              <h2 id="mes-priority-title" className="oh-mes-section__title">
                {isEn ? "2. Priority Bid (token auction)" : "ثانياً: Priority Bid (مزاد Tokens)"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "Freelancer chooses bid amount. Tokens are RESERVED during auction; losers release 100%; winner consumes 100%. Default strategy: HIGHEST_TOKEN_ONLY."
                  : "المستقل يختار مبلغ المزايدة. تُحجز Tokens أثناء المزاد؛ الخاسر يُحرَّر 100%؛ الفائز يُستهلك 100%. الاستراتيجية الافتراضية: HIGHEST_TOKEN_ONLY."}
              </p>
              <div className="oh-mes-grid">
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-priority"
                    label={isEn ? "Enable Priority Bidding engine" : "تفعيل محرك Priority Bid"}
                    checked={form.priorityBiddingEnabled}
                    disabled={saving}
                    onChange={(v) => setField("priorityBiddingEnabled", v)}
                  />
                  <p className="oh-mes-help">
                    {isEn
                      ? "Keep OFF until membership cycles + wallet reservation ledger exist."
                      : "أبقِه متوقفاً حتى توجد دورات العضوية وسجل حجز المحفظة."}
                  </p>
                </div>
                <Field
                  id="mes-pb-duration"
                  label={isEn ? "Auction duration (minutes)" : "مدة المزاد (دقائق)"}
                  help={
                    isEn
                      ? "Persistent DB start_at/end_at — not in-memory timers."
                      : "أوقات DB ثابتة start_at/end_at — وليست مؤقتات في الذاكرة."
                  }
                  error={fieldErrors.priorityBidDurationMinutes}
                >
                  <input
                    id="mes-pb-duration"
                    className="oh-mes-input"
                    type="number"
                    min="1"
                    step="1"
                    dir="ltr"
                    disabled={saving}
                    value={form.priorityBidDurationMinutes}
                    onChange={(e) => setField("priorityBidDurationMinutes", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-pb-min"
                  label={isEn ? "Minimum bid tokens" : "أدنى Tokens للمزايدة"}
                  error={fieldErrors.priorityBidMinimumTokens}
                >
                  <input
                    id="mes-pb-min"
                    className="oh-mes-input"
                    type="number"
                    min="1"
                    step="1"
                    dir="ltr"
                    disabled={saving}
                    value={form.priorityBidMinimumTokens}
                    onChange={(e) => setField("priorityBidMinimumTokens", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-pb-max"
                  label={isEn ? "Maximum bid tokens (optional)" : "أقصى Tokens للمزايدة (اختياري)"}
                  error={fieldErrors.priorityBidMaximumTokens}
                >
                  <input
                    id="mes-pb-max"
                    className="oh-mes-input"
                    type="number"
                    min="1"
                    step="1"
                    dir="ltr"
                    disabled={saving}
                    value={form.priorityBidMaximumTokens}
                    onChange={(e) => setField("priorityBidMaximumTokens", e.target.value)}
                  />
                </Field>
                <Field
                  id="mes-pb-strategy"
                  label={isEn ? "Priority Bid assignment strategy" : "استراتيجية تعيين Priority Bid"}
                  help={
                    isEn
                      ? "Default HIGHEST_TOKEN_ONLY keeps the auction promise. Fairness must not silently override a larger bid."
                      : "الافتراضي HIGHEST_TOKEN_ONLY يحفظ وعد المزاد. العدالة لا تتجاوز بصمت مزايدة أعلى."
                  }
                  error={fieldErrors.priorityBidAssignmentStrategy}
                >
                  <select
                    id="mes-pb-strategy"
                    className="oh-mes-input"
                    dir="ltr"
                    disabled={saving}
                    value={form.priorityBidAssignmentStrategy}
                    onChange={(e) => setField("priorityBidAssignmentStrategy", e.target.value)}
                  >
                    <option value="HIGHEST_TOKEN_ONLY">HIGHEST_TOKEN_ONLY</option>
                    <option value="FAIR_DISTRIBUTION_FIRST">FAIR_DISTRIBUTION_FIRST</option>
                    <option value="HYBRID">HYBRID</option>
                  </select>
                </Field>
                <div className="oh-mes-field">
                  <Toggle
                    id="mes-pb-inc"
                    label={isEn ? "Allow bid increase" : "السماح برفع المزايدة"}
                    checked={form.priorityBidAllowIncrease}
                    disabled={saving}
                    onChange={(v) => setField("priorityBidAllowIncrease", v)}
                  />
                  <p className="oh-mes-help">
                    {isEn ? "Increase reserves the difference only (+80 if 100→180)." : "الرفع يحجز الفرق فقط (+80 إذا 100→180)."}
                  </p>
                </div>
                <div className="oh-mes-field">
                  <Toggle
                    id="mes-pb-dec"
                    label={isEn ? "Allow bid decrease" : "السماح بخفض المزايدة"}
                    checked={form.priorityBidAllowDecrease}
                    disabled={saving}
                    onChange={(v) => setField("priorityBidAllowDecrease", v)}
                  />
                </div>
                <div className="oh-mes-field">
                  <Toggle
                    id="mes-pb-show-hi"
                    label={isEn ? "Show highest Priority Bid" : "إظهار أعلى Priority Bid"}
                    checked={form.priorityBidShowHighest}
                    disabled={saving}
                    onChange={(v) => setField("priorityBidShowHighest", v)}
                  />
                </div>
                <div className="oh-mes-field">
                  <Toggle
                    id="mes-pb-show-pos"
                    label={isEn ? "Show position (no identity)" : "إظهار الترتيب (بدون هوية)"}
                    checked={form.priorityBidShowPosition}
                    disabled={saving}
                    onChange={(v) => setField("priorityBidShowPosition", v)}
                  />
                </div>
                <div className="oh-mes-field">
                  <Toggle
                    id="mes-pb-cancel-use"
                    label={
                      isEn
                        ? "Return Priority Use if order cancelled before resolution"
                        : "إعادة استخدام Priority عند إلغاء الطلب قبل الحسم"
                    }
                    checked={form.priorityBidReturnUseOnOrderCancel}
                    disabled={saving}
                    onChange={(v) => setField("priorityBidReturnUseOnOrderCancel", v)}
                  />
                </div>
                <div className="oh-mes-field">
                  <Toggle
                    id="mes-pb-auto"
                    label={isEn ? "Auto-assign winner when auction ends" : "تعيين الفائز تلقائياً عند انتهاء المزاد"}
                    checked={form.priorityBidAutoAssignmentEnabled}
                    disabled={saving}
                    onChange={(v) => setField("priorityBidAutoAssignmentEnabled", v)}
                  />
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-fair-title">
              <h2 id="mes-fair-title" className="oh-mes-section__title">
                {isEn ? "3. Fair Work Distribution (internal)" : "ثالثاً: توزيع العمل العادل (داخلي)"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "INTERNAL ranking factor among already-eligible freelancers. Never exposed on Freelancer APIs. Eligibility always comes first."
                  : "عامل ترتيب داخلي بين المستقلين المؤهلين أصلاً. لا يُعرَض في واجهات المستقل. الأهلية دائماً أولاً."}
              </p>
              <div className="oh-mes-grid">
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-fair"
                    label={isEn ? "Enable Fair Work Distribution engine" : "تفعيل محرك التوزيع العادل"}
                    checked={form.fairWorkDistributionEnabled}
                    disabled={saving}
                    onChange={(v) => setField("fairWorkDistributionEnabled", v)}
                  />
                </div>
                <Field
                  id="mes-assign-strategy"
                  label={isEn ? "General assignment strategy" : "استراتيجية التعيين العامة"}
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
                    <option value="HIGHEST_TOKEN_ONLY">HIGHEST_TOKEN_ONLY</option>
                    <option value="FAIR_DISTRIBUTION_FIRST">FAIR_DISTRIBUTION_FIRST</option>
                    <option value="HYBRID">HYBRID</option>
                  </select>
                </Field>
                <Field id="mes-w-fair" label="fairness_weight" error={fieldErrors.fairnessWeight}>
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
                <Field id="mes-w-token" label="token_weight" error={fieldErrors.tokenWeight}>
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
                  label={isEn ? "Award reset policy" : "سياسة إعادة المحاولات بعد الفوز"}
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
                  {isEn
                    ? "APPLIED_AND_LOST increases fairness; decline / freelancer-cancel after award do not get the same boost."
                    : "APPLIED_AND_LOST يرفع الأولوية؛ الرفض أو إلغاء المستقل بعد التعيين لا يحصلان على نفس التعزيز."}
                </p>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-commission-title">
              <h2 id="mes-commission-title" className="oh-mes-section__title">
                {isEn ? "4. Commission" : "رابعاً: العمولة"}
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
                {isEn ? "5. Cash membership payments" : "خامساً: الدفع النقدي"}
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
                {isEn ? "6. Verification bonuses" : "سادساً: مكافآت التوثيق"}
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
                {isEn ? "7. Elite Direct Orders" : "سابعاً: Elite"}
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
