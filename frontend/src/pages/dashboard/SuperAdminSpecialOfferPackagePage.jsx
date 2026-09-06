import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import {
  getAdminSpecialOfferPackageRequest,
  updateAdminSpecialOfferPackageRequest,
  updateAdminSpecialOfferVisibilityRequest,
  createAdminSpecialOfferNewVersionRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import PlanCatalogAdminShell from "../../admin/plans/PlanCatalogAdminShell";
import { SECTION_COPY } from "../../admin/plans/planMetricTerminology";
import { SPECIAL_OFFER_NAV_ID } from "../../admin/plans/planCatalogNav";
import SpecialOfferPackageCard from "../../components/plans/SpecialOfferPackageCard";
import {
  SPECIAL_OFFER_DEFAULTS,
  SPECIAL_OFFER_PURCHASE_MODE,
  SPECIAL_OFFER_ACCESS_LEVEL_OPTIONS,
  SPECIAL_OFFER_LOCKED_WARNING_AR,
  SPECIAL_OFFER_LOCKED_WARNING_EN,
  formStateFromSpecialOffer,
  payloadFromSpecialOfferForm,
} from "../../constants/specialOfferPackage";
import "../../admin/marketplaceMembership/marketplace-membership-plans.css";
import "../../admin/plans/specialOfferAdmin.css";

export default function SuperAdminSpecialOfferPackagePage() {
  const { locale, t } = useTranslation();
  const isEn = locale === "en";
  const { push } = useToast();
  const sectionCopy = SECTION_COPY.specialOffer;

  const [form, setForm] = useState(() => formStateFromSpecialOffer(SPECIAL_OFFER_DEFAULTS));
  const [planSummary, setPlanSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const benefitsLocked = Boolean(form.benefitsLocked);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await getAdminSpecialOfferPackageRequest();
      const pkg = res?.data?.specialOfferPackage;
      setForm(formStateFromSpecialOffer(pkg));
      setPlanSummary(pkg?.planSummary || null);
    } catch (err) {
      setError(
        getSafeApiErrorMessage(err) ||
          (isEn ? "Could not load special offer package." : "تعذر تحميل باقة العرض."),
      );
    } finally {
      setLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const previewOffer = useMemo(
    () => ({
      ...payloadFromSpecialOfferForm(form),
      catalogSource: "special_offer",
      checkoutSupported:
        form.purchaseMode === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT && Number(form.priceJod) > 0,
    }),
    [form],
  );

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await updateAdminSpecialOfferPackageRequest(payloadFromSpecialOfferForm(form));
      const pkg = res?.data?.specialOfferPackage;
      setForm(formStateFromSpecialOffer(pkg));
      setPlanSummary(pkg?.planSummary || null);
      push({ type: "success", message: isEn ? "Special offer saved." : "تم حفظ باقة العرض." });
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || (isEn ? "Save failed." : "فشل الحفظ."),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleVisibility = async (nextVisible) => {
    setField("isVisible", nextVisible);
    setSaving(true);
    try {
      const res = await updateAdminSpecialOfferVisibilityRequest(nextVisible);
      const pkg = res?.data?.specialOfferPackage;
      setForm(formStateFromSpecialOffer(pkg));
      setPlanSummary(pkg?.planSummary || null);
      push({
        type: "success",
        message: nextVisible
          ? isEn
            ? "Special offer is now visible."
            : "باقة العرض ظاهرة الآن للمستخدمين."
          : isEn
            ? "Special offer is hidden."
            : "تم إخفاء باقة العرض.",
      });
    } catch (err) {
      setField("isVisible", !nextVisible);
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || (isEn ? "Visibility update failed." : "فشل تحديث الظهور."),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNewVersion = async () => {
    if (saving) return;
    const ok = window.confirm(
      isEn
        ? "Create a new editable offer version? The purchased version stays locked for existing buyers."
        : "إنشاء عرض جديد قابل للتعديل؟ سيبقى العرض المشترى مجمّداً للمشتركين الحاليين.",
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await createAdminSpecialOfferNewVersionRequest({
        copyFromCurrent: true,
        makeVisible: false,
      });
      const pkg = res?.data?.specialOfferPackage;
      setForm(formStateFromSpecialOffer(pkg));
      setPlanSummary(pkg?.planSummary || null);
      setPreviewKey((k) => k + 1);
      push({
        type: "success",
        message: isEn
          ? "New special offer version created (hidden until you enable it)."
          : "تم إنشاء عرض جديد (مخفي حتى تفعّله).",
      });
    } catch (err) {
      push({
        type: "error",
        message:
          getSafeApiErrorMessage(err) ||
          (isEn ? "Could not create a new offer version." : "تعذر إنشاء عرض جديد."),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (benefitsLocked) return;
    setForm(formStateFromSpecialOffer(SPECIAL_OFFER_DEFAULTS));
    setPreviewKey((k) => k + 1);
  };

  return (
    <PlanCatalogAdminShell
      className="oh-mmp-page oh-special-offer-admin"
      activeCatalog={SPECIAL_OFFER_NAV_ID}
      isEn={isEn}
      hint={isEn ? sectionCopy.hintEn : sectionCopy.hintAr}
    >
      {error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}

      <DashboardSection
        title={isEn ? sectionCopy.en : sectionCopy.ar}
        description={
          isEn
            ? "One promotional package shown on public pricing when enabled."
            : "هذه باقة ترويجية واحدة تظهر في الصفحة الرئيسية وصفحة الباقات عند تفعيلها."
        }
      >
        {!form.isVisible ? (
          <p className="oh-special-offer-admin__hidden-note" role="status">
            {isEn
              ? "The special offer is currently hidden and will not appear to users."
              : "باقة العرض مخفية حالياً ولن تظهر للمستخدمين."}
          </p>
        ) : null}

        {benefitsLocked ? (
          <p
            className="oh-special-offer-admin__locked-warning"
            role="alert"
            data-special-offer-locked="true"
          >
            {isEn ? SPECIAL_OFFER_LOCKED_WARNING_EN : SPECIAL_OFFER_LOCKED_WARNING_AR}
          </p>
        ) : null}

        {loading ? (
          <p className="oh-special-offer-admin__loading">{isEn ? "Loading…" : "جاري التحميل…"}</p>
        ) : (
          <div className="oh-special-offer-admin__layout" data-special-offer-admin="true">
            <div className="oh-special-offer-admin__preview">
              <h3 className="oh-special-offer-admin__panel-title">
                {isEn ? "Live preview" : "معاينة الباقة"}
              </h3>
              <SpecialOfferPackageCard key={previewKey} offer={previewOffer} t={t} preview />
            </div>

            <div className="oh-special-offer-admin__editor">
              <h3 className="oh-special-offer-admin__panel-title">
                {isEn ? "Edit offer" : "تعديل باقة العرض"}
                {form.offerVersion ? (
                  <span className="oh-special-offer-admin__version" data-offer-version={form.offerVersion}>
                    {" "}
                    · v{form.offerVersion}
                  </span>
                ) : null}
              </h3>

              <label className="oh-special-offer-admin__toggle">
                <input
                  type="checkbox"
                  checked={Boolean(form.isVisible)}
                  disabled={saving}
                  onChange={(e) => void handleVisibility(e.target.checked)}
                />
                <span>{isEn ? "Package visible on public pricing" : "حالة الباقة: ظاهرة في صفحة الباقات"}</span>
              </label>

              <div className="oh-special-offer-admin__fields">
                <label className="oh-special-offer-admin__field--full">
                  <span>{isEn ? "Purchase method" : "طريقة الشراء"}</span>
                  <select
                    value={form.purchaseMode}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("purchaseMode", e.target.value)}
                    data-purchase-mode-select="true"
                    data-benefit-field="purchaseMode"
                  >
                    <option value={SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT}>
                      {isEn ? "Direct checkout (Stripe)" : "شراء مباشر"}
                    </option>
                    <option value={SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP}>
                      {isEn ? "WhatsApp / manual" : "واتساب / تواصل يدوي"}
                    </option>
                  </select>
                </label>

                {form.purchaseMode === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT ? (
                  <>
                    <p className="oh-special-offer-admin__mode-note oh-special-offer-admin__mode-note--checkout" role="note">
                      {isEn
                        ? "Direct checkout creates an independent special-offer membership. Benefits come from the values below — not from SILVER/PRO/ELITE. They activate automatically after payment (pending-start until first real order)."
                        : "عند الشراء المباشر تُنشأ عضوية مستقلة لباقة العرض. المزايا تُؤخذ من القيم أدناه وليس من SILVER/PRO/ELITE، وتُفعَّل تلقائياً بعد الدفع (بداية المدة عند أول طلب حقيقي)."}
                    </p>
                    {planSummary ? (
                      <p className="oh-special-offer-admin__linked-summary" data-independent-plan-summary="true">
                        {isEn ? "Independent plan row:" : "سجل الباقة المستقلة:"}{" "}
                        {planSummary.tierCode || form.planTierCode || "special_offer"} · id{" "}
                        {planSummary.id || form.linkedMarketplacePlanId || "—"} ·{" "}
                        {planSummary.monthlyPriceJod ?? "—"} {isEn ? "JOD" : "د.أ"} ·{" "}
                        {planSummary.monthlyBidAllowance ?? "—"} {isEn ? "bids" : "عرض"} ·{" "}
                        {planSummary.cycleDurationDays ?? "—"} {isEn ? "days" : "يوم"}
                        {benefitsLocked
                          ? isEn
                            ? ` · locked (${form.purchaseCount || 0} purchase(s))`
                            : ` · مجمّد (${form.purchaseCount || 0} شراء)`
                          : ""}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="oh-special-offer-admin__mode-note oh-special-offer-admin__mode-note--whatsapp" role="note">
                    {isEn
                      ? "WhatsApp mode does not activate the package automatically and needs manual follow-up."
                      : "هذا الوضع لا يفعّل الباقة تلقائياً، ويحتاج متابعة يدوية."}
                  </p>
                )}

                <label>
                  <span>{isEn ? "Title" : "عنوان الباقة"}</span>
                  <input
                    value={form.title}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("title", e.target.value)}
                  />
                </label>
                <label>
                  <span>{isEn ? "Short description" : "الوصف القصير"}</span>
                  <textarea
                    rows={2}
                    value={form.subtitle}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("subtitle", e.target.value)}
                  />
                </label>
                <label>
                  <span>{isEn ? "Badge" : "الشارة"}</span>
                  <input
                    value={form.badgeText}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("badgeText", e.target.value)}
                  />
                </label>
                <label>
                  <span>{isEn ? "Ribbon" : "الشريط"}</span>
                  <input
                    value={form.ribbonText}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("ribbonText", e.target.value)}
                  />
                </label>
                <label>
                  <span>{isEn ? "Price (JOD)" : "السعر (د.أ)"}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.priceJod}
                    disabled={benefitsLocked || saving}
                    data-benefit-field="priceJod"
                    onChange={(e) => setField("priceJod", e.target.value)}
                  />
                </label>
                <label>
                  <span>{isEn ? "Original price (optional)" : "السعر قبل الخصم (اختياري)"}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.originalPriceJod}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("originalPriceJod", e.target.value)}
                  />
                </label>
                <label>
                  <span>{isEn ? "Total offers / bids" : "عدد العروض"}</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.totalOffers}
                    disabled={benefitsLocked || saving}
                    data-benefit-field="totalOffers"
                    onChange={(e) => setField("totalOffers", e.target.value)}
                  />
                </label>
                <label>
                  <span>{isEn ? "Daily limit" : "الحد اليومي"}</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.dailyLimit}
                    disabled={benefitsLocked || saving}
                    data-benefit-field="dailyLimit"
                    onChange={(e) => setField("dailyLimit", e.target.value)}
                  />
                </label>
                <label>
                  <span>{isEn ? "Duration (days)" : "مدة الباقة بالأيام"}</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.durationDays}
                    disabled={benefitsLocked || saving}
                    data-benefit-field="durationDays"
                    onChange={(e) => setField("durationDays", e.target.value)}
                  />
                </label>
                <label>
                  <span>{isEn ? "Max project value (optional)" : "الحد الأقصى لقيمة المشروع (اختياري)"}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.maxProjectValueJod}
                    disabled={benefitsLocked || saving}
                    data-benefit-field="maxProjectValueJod"
                    onChange={(e) => setField("maxProjectValueJod", e.target.value)}
                  />
                </label>
                <label>
                  <span>{isEn ? "Access / article level" : "مستوى الوصول / المقالات"}</span>
                  <select
                    value={form.accessLevelKey || "silver"}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("accessLevelKey", e.target.value)}
                    data-access-level-select="true"
                    data-benefit-field="accessLevelKey"
                  >
                    {SPECIAL_OFFER_ACCESS_LEVEL_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {isEn ? opt.labelEn : opt.labelAr}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{isEn ? "CTA label" : "نص زر الشراء"}</span>
                  <input
                    value={form.ctaLabel}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("ctaLabel", e.target.value)}
                  />
                </label>
                <label className="oh-special-offer-admin__field--full">
                  <span>{isEn ? "Microcopy" : "نص توضيحي تحت الزر"}</span>
                  <input
                    value={form.microcopy}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("microcopy", e.target.value)}
                  />
                </label>
                <label className="oh-special-offer-admin__field--full">
                  <span>{isEn ? "Refund / offer explanation" : "شرح الاسترداد / تفاصيل العرض"}</span>
                  <textarea
                    rows={8}
                    value={form.refundExplanationAr}
                    disabled={benefitsLocked || saving}
                    data-refund-explanation-field="true"
                    onChange={(e) => setField("refundExplanationAr", e.target.value)}
                    placeholder={
                      isEn
                        ? "Shown in the refund details popup on the public card. Leave empty to hide the link."
                        : "يظهر في نافذة تفاصيل الاسترداد على بطاقة العرض. اتركه فارغاً لإخفاء الرابط."
                    }
                  />
                </label>
                <label className="oh-special-offer-admin__field--full">
                  <span>{isEn ? "WhatsApp message" : "رسالة واتساب"}</span>
                  <textarea
                    rows={3}
                    value={form.whatsappMessageAr}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("whatsappMessageAr", e.target.value)}
                  />
                </label>
              </div>

              <div className="oh-special-offer-admin__actions">
                {!benefitsLocked ? (
                  <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                    {isEn ? "Save changes" : "حفظ التغييرات"}
                  </Button>
                ) : null}
                {benefitsLocked || form.canCreateNewVersion ? (
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleCreateNewVersion()}
                    data-create-new-offer="true"
                  >
                    {isEn ? "Create new offer" : "إنشاء عرض جديد"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => setPreviewKey((k) => k + 1)}
                >
                  {isEn ? "Refresh preview" : "معاينة الباقة"}
                </Button>
                {!benefitsLocked ? (
                  <Button type="button" variant="secondary" disabled={saving} onClick={handleReset}>
                    {isEn ? "Reset defaults" : "إعادة تعيين"}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </DashboardSection>
    </PlanCatalogAdminShell>
  );
}
