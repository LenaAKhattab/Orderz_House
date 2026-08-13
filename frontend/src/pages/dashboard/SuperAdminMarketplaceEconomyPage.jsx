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
            <section className="oh-mes-section oh-mes-section--deprecated" aria-labelledby="mes-tokens-title">
              <h2 id="mes-tokens-title" className="oh-mes-section__title">
                {isEn
                  ? "1. Work Tokens engine — DEPRECATED (technical)"
                  : "أولاً: محرك Work Tokens — مهجور (تقني)"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "Hidden from normal product workflow. Engine is forced OFF and cannot be re-enabled from this UI. Active Freelancer economy uses Bids + Priority Uses. Schema retained for audit/rollback only."
                  : "مخفي عن سير المنتج العادي. المحرك مفروض متوقفاً ولا يمكن إعادة تفعيله من هذه الواجهة. اقتصاد المستقل النشط: العروض + مرات الأولوية. المخطط محفوظ للتدقيق/التراجع فقط."}
              </p>
              <div className="oh-mes-grid">
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-tokens"
                    label={isEn ? "Work Tokens engine (locked OFF)" : "محرك Work Tokens (مقفول متوقف)"}
                    checked={false}
                    disabled
                    onChange={() => {}}
                  />
                  <p className="oh-mes-help">
                    {isEn
                      ? "work_tokens_enabled remains false. Do not repurpose for Bids."
                      : "work_tokens_enabled يبقى false. لا يُعاد استخدامه للعروض."}
                  </p>
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-priority-boost-title">
              <h2 id="mes-priority-boost-title" className="oh-mes-section__title">
                {isEn
                  ? "2a. Priority Application Boost (active product — dormant)"
                  : "2أ. تعزيز عرض الأولوية (المنتج النشط — خامل)"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "Binary boost: 1 Bid + 1 Priority Use. No extra Bids, no Work Tokens, no automatic assignment. Keep OFF until Phase B4 migration is reviewed and cutover is approved."
                  : "تعزيز ثنائي: عرض واحد + استخدام أولوية واحد. بلا عروض إضافية، بلا Work Tokens، بلا إسناد تلقائي. أبقِه متوقفاً حتى مراجعة هجرة B4 واعتماد التشغيل."}
              </p>
              <div className="oh-mes-grid">
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-priority-boost"
                    label={
                      isEn
                        ? "Enable Priority Application Boost engine"
                        : "تفعيل محرك تعزيز عرض الأولوية"
                    }
                    checked={Boolean(form.priorityApplicationBoostEnabled)}
                    disabled={saving}
                    onChange={(v) => setField("priorityApplicationBoostEnabled", v)}
                  />
                  <p className="oh-mes-help">
                    {isEn
                      ? "Independent of legacy Token auction (priority_bidding_enabled). Default OFF / DORMANT."
                      : "مستقل عن مزاد Tokens القديم (priority_bidding_enabled). الافتراضي متوقف / خامل."}
                  </p>
                </div>
              </div>
            </section>

            <section className="oh-mes-section" aria-labelledby="mes-bid-purchases-title">
              <h2 id="mes-bid-purchases-title" className="oh-mes-section__title">
                {isEn
                  ? "2a+. Bid Credits + package purchases (dormant)"
                  : "2أ+. العروض المتاحة + شراء الباقات (خامل)"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "Commercial package Checkout requires BOTH Bid Credits and Bid purchases engines. Keep OFF until Migration 151 is reviewed and cutover is approved. Refund/chargeback Bid reversal is not implemented."
                  : "شراء الباقات يتطلب تفعيل محرك العروض ومحرك الشراء معاً. أبقِهما متوقفين حتى مراجعة الهجرة 151. استرجاع العروض عند الاسترداد/النزاع غير منفّذ."}
              </p>
              <div className="oh-mes-grid">
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-bid-credits"
                    label={isEn ? "Enable Bid Credits engine" : "تفعيل محرك العروض المتاحة"}
                    checked={Boolean(form.bidCreditsEnabled)}
                    disabled={saving}
                    onChange={(v) => setField("bidCreditsEnabled", v)}
                  />
                </div>
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-bid-purchases"
                    label={
                      isEn
                        ? "Enable Bid Credit package purchases"
                        : "تفعيل شراء باقات العروض"
                    }
                    checked={Boolean(form.bidCreditPurchasesEnabled)}
                    disabled={saving}
                    onChange={(v) => setField("bidCreditPurchasesEnabled", v)}
                  />
                </div>
              </div>
            </section>

            <section className="oh-mes-section oh-mes-section--deprecated" aria-labelledby="mes-priority-title">
              <h2 id="mes-priority-title" className="oh-mes-section__title">
                {isEn
                  ? "2b. Legacy Priority Auction — DEPRECATED (technical)"
                  : "2ب. مزاد الأولوية القديم — مهجور (تقني)"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "Not an alternative to Priority Application Boost. Token-stake auction config removed from normal Admin workflow. Engine forced OFF; schema retained for historical audit only."
                  : "ليس بديلاً عن تعزيز عرض الأولوية. إعدادات مزاد Tokens أُزيلت من سير المسؤول العادي. المحرك مفروض متوقفاً؛ المخطط محفوظ للتدقيق التاريخي فقط."}
              </p>
              <div className="oh-mes-grid">
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-priority"
                    label={
                      isEn
                        ? "Legacy Priority Bidding engine (locked OFF)"
                        : "محرك مزاد الأولوية القديم (مقفول متوقف)"
                    }
                    checked={false}
                    disabled
                    onChange={() => {}}
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
                    {ASSIGNMENT_STRATEGIES_UI.map((opt) => (
                      <option key={opt.value} value={opt.value} disabled={!opt.available}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  id="mes-fair-lookback"
                  label={isEn ? "Fair Distribution lookback (days)" : "نافذة التوزيع العادل (أيام)"}
                  help={
                    isEn
                      ? "Lexicographic queue lookback. Approved default: 30. Source of truth for Phase 7 metrics."
                      : "نافذة الطابور المعجمي. الافتراضي المعتمد: 30. مصدر الحقيقة لمقاييس المرحلة 7."
                  }
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

            <section className="oh-mes-section oh-mes-section--deprecated" aria-labelledby="mes-verify-title">
              <h2 id="mes-verify-title" className="oh-mes-section__title">
                {isEn
                  ? "6. Verification Work Token bonuses — DEPRECATED (technical)"
                  : "سادساً: مكافآت توثيق Work Tokens — مهجور (تقني)"}
              </h2>
              <p className="oh-mes-section__lede">
                {isEn
                  ? "Legacy Work Token reward amounts are hidden from normal Admin workflow. No active path grants Work Tokens for verification. DB columns retained for history."
                  : "مبالغ مكافآت Work Tokens مخفية عن سير المسؤول العادي. لا يوجد مسار نشط يمنح Work Tokens للتوثيق. أعمدة قاعدة البيانات محفوظة للتاريخ."}
              </p>
              <div className="oh-mes-grid">
                <div className="oh-mes-field oh-mes-field--full">
                  <Toggle
                    id="mes-flag-verify"
                    label={
                      isEn
                        ? "Verification Work Token rewards engine (locked OFF)"
                        : "محرك مكافآت توثيق Work Tokens (مقفول متوقف)"
                    }
                    checked={false}
                    disabled
                    onChange={() => {}}
                  />
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
