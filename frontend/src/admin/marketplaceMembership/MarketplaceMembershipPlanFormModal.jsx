import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import {
  getInitialMarketplacePlanFormState,
  normalizeMarketplacePlanPayload,
  planToMarketplaceFormState,
  validateMarketplacePlanForm,
} from "./marketplacePlanFormUtils";

export default function MarketplaceMembershipPlanFormModal({
  open,
  mode = "create",
  initialPlan = null,
  isEn = false,
  submitting = false,
  onClose,
  onSubmit,
}) {
  const isCreate = mode === "create";
  const [form, setForm] = useState(getInitialMarketplacePlanFormState);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(isCreate ? getInitialMarketplacePlanFormState() : planToMarketplaceFormState(initialPlan));
    setErrors({});
  }, [open, isCreate, initialPlan]);

  if (!open) return null;

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const nextErrors = validateMarketplacePlanForm(form, { isCreate });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSubmit?.(normalizeMarketplacePlanPayload(form, { isCreate }));
  };

  return (
    <div className="oh-mmp-modal" role="dialog" aria-modal="true">
      <button type="button" className="oh-mmp-modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="oh-mmp-modal__panel">
        <div className="oh-mmp-modal__header">
          <h2>{isCreate ? (isEn ? "Add membership plan" : "إضافة باقة عمل") : isEn ? "Edit membership plan" : "تعديل باقة عمل"}</h2>
          <button type="button" className="oh-mmp-modal__close" onClick={onClose} disabled={submitting}>
            ×
          </button>
        </div>

        <form className="oh-mmp-form" onSubmit={handleSubmit}>
          {isCreate ? (
            <label>
              {isEn ? "Tier code" : "رمز الباقة"} *
              <input
                value={form.tierCode}
                onChange={(e) => setField("tierCode", e.target.value)}
                disabled={submitting}
                placeholder="pay_as_you_work"
                autoComplete="off"
              />
              {errors.tierCode ? <span className="oh-mmp-form__error">{errors.tierCode}</span> : null}
            </label>
          ) : (
            <p className="oh-mmp-form__hint">
              {isEn ? "Tier code" : "رمز الباقة"}: <strong>{form.tierCode}</strong> ({isEn ? "immutable" : "ثابت"})
            </p>
          )}

          <div className="oh-mmp-form__row">
            <label>
              {isEn ? "Name (AR)" : "الاسم (عربي)"} *
              <input value={form.nameAr} onChange={(e) => setField("nameAr", e.target.value)} disabled={submitting} />
              {errors.nameAr ? <span className="oh-mmp-form__error">{errors.nameAr}</span> : null}
            </label>
            <label>
              {isEn ? "Name (EN)" : "الاسم (إنجليزي)"}
              <input value={form.nameEn} onChange={(e) => setField("nameEn", e.target.value)} disabled={submitting} />
            </label>
          </div>

          <label>
            {isEn ? "Description (AR)" : "الوصف (عربي)"}
            <textarea
              value={form.descriptionAr}
              onChange={(e) => setField("descriptionAr", e.target.value)}
              disabled={submitting}
              rows={2}
            />
          </label>
          <label>
            {isEn ? "Description (EN)" : "الوصف (إنجليزي)"}
            <textarea
              value={form.descriptionEn}
              onChange={(e) => setField("descriptionEn", e.target.value)}
              disabled={submitting}
              rows={2}
            />
          </label>

          <div className="oh-mmp-form__row">
            <label>
              {isEn ? "Monthly price (JOD)" : "السعر الشهري (د.أ)"} *
              <input
                type="number"
                min="0"
                step="0.001"
                value={form.monthlyPriceJod}
                onChange={(e) => setField("monthlyPriceJod", e.target.value)}
                disabled={submitting}
              />
              {errors.monthlyPriceJod ? <span className="oh-mmp-form__error">{errors.monthlyPriceJod}</span> : null}
            </label>
            <label>
              {isEn ? "Sort order" : "ترتيب الظهور"}
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setField("sortOrder", e.target.value)}
                disabled={submitting}
              />
            </label>
          </div>

          <fieldset className="oh-mmp-form__fieldset">
            <legend>{isEn ? "Real-order access" : "وصول الطلبات الحقيقية فقط"}</legend>
            <label className="oh-mmp-form__check">
              <input
                type="checkbox"
                checked={form.unlimitedRealOrderValue}
                onChange={(e) => setField("unlimitedRealOrderValue", e.target.checked)}
                disabled={submitting}
              />
              {isEn ? "Unlimited real-order value" : "قيمة غير محدودة للطلبات الحقيقية"}
            </label>
            {!form.unlimitedRealOrderValue ? (
              <label>
                {isEn ? "Max real order value (JOD)" : "أقصى قيمة طلب حقيقي (د.أ)"} *
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.maxRealOrderValueJod}
                  onChange={(e) => setField("maxRealOrderValueJod", e.target.value)}
                  disabled={submitting}
                />
                {errors.maxRealOrderValueJod ? (
                  <span className="oh-mmp-form__error">{errors.maxRealOrderValueJod}</span>
                ) : null}
              </label>
            ) : null}
          </fieldset>

          <div className="oh-mmp-form__row">
            <label>
              {isEn ? "Bids per cycle" : "العروض / دورة"}
              <input
                type="number"
                min="0"
                step="1"
                value={form.monthlyBidAllowance}
                onChange={(e) => setField("monthlyBidAllowance", e.target.value)}
                disabled={submitting}
              />
              {errors.monthlyBidAllowance ? (
                <span className="oh-mmp-form__error">{errors.monthlyBidAllowance}</span>
              ) : null}
            </label>
            <label>
              {isEn ? "Daily Bid spend limit" : "الحد اليومي للعروض"}
              <input
                type="number"
                min="0"
                step="1"
                value={form.dailyBidSpendLimit}
                onChange={(e) => setField("dailyBidSpendLimit", e.target.value)}
                disabled={submitting}
              />
            </label>
          </div>

          <div className="oh-mmp-form__row">
            <label>
              {isEn ? "Cycle duration (days)" : "مدة الدورة (أيام)"}
              <input
                type="number"
                min="1"
                step="1"
                value={form.cycleDurationDays}
                onChange={(e) => setField("cycleDurationDays", e.target.value)}
                disabled={submitting}
              />
            </label>
            <label>
              {isEn ? "Project min value (JOD)" : "أدنى قيمة مشروع (د.أ)"}
              <input
                type="number"
                min="0"
                step="0.001"
                value={form.projectMinValueJod}
                onChange={(e) => setField("projectMinValueJod", e.target.value)}
                disabled={submitting}
              />
            </label>
          </div>

          <div className="oh-mmp-form__row">
            <label className="oh-mmp-form__check oh-mmp-form__check--block">
              <input
                type="checkbox"
                checked={form.withdrawalEnabled !== false}
                onChange={(e) => setField("withdrawalEnabled", e.target.checked)}
                disabled={submitting}
              />
              {isEn ? "Withdrawal enabled" : "السحب مفعّل"}
            </label>
            <label>
              {isEn ? "Bid distribution mode" : "نمط توزيع العروض"}
              <select
                value={form.bidDistributionMode || "full_cycle"}
                onChange={(e) => setField("bidDistributionMode", e.target.value)}
                disabled={submitting}
              >
                <option value="full_cycle">full_cycle</option>
                <option value="progressive_daily">progressive_daily</option>
              </select>
            </label>
          </div>

          <div className="oh-mmp-form__row">
            <label>
              {isEn ? "Starter earnings mode" : "وضع أرباح الستارتر"}
              <select
                value={form.starterEarningsMode || "standard"}
                onChange={(e) => setField("starterEarningsMode", e.target.value)}
                disabled={submitting}
              >
                <option value="standard">standard</option>
                <option value="pending">pending</option>
              </select>
            </label>
            <label className="oh-mmp-form__check oh-mmp-form__check--block">
              <input
                type="checkbox"
                checked={Boolean(form.isOneTimeStarter)}
                onChange={(e) => setField("isOneTimeStarter", e.target.checked)}
                disabled={submitting}
              />
              {isEn ? "One-time Starter entitlement" : "ستارتر لمرة واحدة فقط"}
            </label>
          </div>

          <div className="oh-mmp-form__row">
            <label>
              {isEn ? "Article access level (1–5)" : "مستوى الوصول للمقالات (1–5)"}
              <input
                type="number"
                min="1"
                max="5"
                step="1"
                value={form.articleAccessLevel}
                onChange={(e) => setField("articleAccessLevel", e.target.value)}
                disabled={submitting}
              />
              {errors.articleAccessLevel ? (
                <span className="oh-mmp-form__error">{errors.articleAccessLevel}</span>
              ) : null}
            </label>
          </div>

          <div className="oh-mmp-form__row">
            <label className="oh-mmp-form__check oh-mmp-form__check--block">
              <input
                type="checkbox"
                checked={form.eliteDirectOrdersEnabled}
                onChange={(e) => setField("eliteDirectOrdersEnabled", e.target.checked)}
                disabled={submitting}
              />
              {isEn ? "Elite Direct Orders capability" : "قدرة الطلب المباشر (Elite)"}
            </label>
          </div>

          <div className="oh-mmp-form__row">
            <label className="oh-mmp-form__check oh-mmp-form__check--block">
              <input
                type="checkbox"
                checked={form.priorityBidEnabled}
                onChange={(e) => setField("priorityBidEnabled", e.target.checked)}
                disabled={submitting}
              />
              {isEn ? "Priority Bid capability (Priority Uses)" : "قدرة عرض الأولوية (استخدامات الأولوية)"}
            </label>
            <label>
              {isEn
                ? "Priority Uses per cycle (separate from Bids / month)"
                : "استخدامات الأولوية / دورة (منفصلة عن العروض / شهر)"}
              <input
                type="number"
                min="0"
                max="1000"
                step="1"
                value={form.priorityBidUsesPerCycle}
                onChange={(e) => setField("priorityBidUsesPerCycle", e.target.value)}
                disabled={submitting}
              />
              {errors.priorityBidUsesPerCycle ? (
                <span className="oh-mmp-form__error">{errors.priorityBidUsesPerCycle}</span>
              ) : null}
            </label>
          </div>

          <fieldset className="oh-mmp-form__fieldset">
            <legend>{isEn ? "Cash / prepaid" : "نقدي / مسبق"}</legend>
            <label className="oh-mmp-form__check">
              <input
                type="checkbox"
                checked={form.cashAllowed}
                onChange={(e) => setField("cashAllowed", e.target.checked)}
                disabled={submitting}
              />
              {isEn ? "Cash allowed" : "الدفع النقدي مسموح"}
            </label>
            <div className="oh-mmp-form__row">
              <label>
                {isEn ? "Min cash months" : "أدنى أشهر نقدية"}
                <input
                  type="number"
                  min="1"
                  value={form.minimumCashMonths}
                  onChange={(e) => setField("minimumCashMonths", e.target.value)}
                  disabled={submitting}
                />
                {errors.minimumCashMonths ? (
                  <span className="oh-mmp-form__error">{errors.minimumCashMonths}</span>
                ) : null}
              </label>
              <label>
                {isEn ? "Max prepaid months" : "أقصى أشهر مسبقة"}
                <input
                  type="number"
                  min="1"
                  value={form.maximumPrepaidMonths}
                  onChange={(e) => setField("maximumPrepaidMonths", e.target.value)}
                  disabled={submitting}
                />
                {errors.maximumPrepaidMonths ? (
                  <span className="oh-mmp-form__error">{errors.maximumPrepaidMonths}</span>
                ) : null}
              </label>
            </div>
          </fieldset>

          <fieldset className="oh-mmp-form__fieldset">
            <legend>{isEn ? "Sale" : "تخفيض"}</legend>
            <label className="oh-mmp-form__check">
              <input
                type="checkbox"
                checked={form.saleEnabled}
                onChange={(e) => setField("saleEnabled", e.target.checked)}
                disabled={submitting}
              />
              {isEn ? "Sale enabled" : "تفعيل التخفيض"}
            </label>
            {form.saleEnabled ? (
              <>
                <div className="oh-mmp-form__row">
                  <label>
                    {isEn ? "Sale %" : "نسبة الخصم"}
                    <input
                      type="number"
                      min="0.01"
                      max="99.99"
                      step="0.01"
                      value={form.salePercentage}
                      onChange={(e) => setField("salePercentage", e.target.value)}
                      disabled={submitting}
                    />
                    {errors.salePercentage ? (
                      <span className="oh-mmp-form__error">{errors.salePercentage}</span>
                    ) : null}
                  </label>
                </div>
                <label>
                  {isEn ? "Sale reason (AR)" : "سبب الخصم (عربي)"} *
                  <input
                    value={form.saleReason}
                    onChange={(e) => setField("saleReason", e.target.value)}
                    disabled={submitting}
                  />
                  {errors.saleReason ? <span className="oh-mmp-form__error">{errors.saleReason}</span> : null}
                </label>
                <label>
                  {isEn ? "Sale reason (EN)" : "سبب الخصم (إنجليزي)"}
                  <input
                    value={form.saleReasonEn}
                    onChange={(e) => setField("saleReasonEn", e.target.value)}
                    disabled={submitting}
                  />
                </label>
              </>
            ) : null}
          </fieldset>

          <label className="oh-mmp-form__check">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField("isActive", e.target.checked)}
              disabled={submitting}
            />
            {isEn ? "Visible / active" : "ظاهرة / مفعّلة"}
          </label>

          <div className="oh-mmp-form__actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {isEn ? "Cancel" : "إلغاء"}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (isEn ? "Saving…" : "جاري الحفظ…") : isEn ? "Save" : "حفظ"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
