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
import "../../i18n/planAdminResources";
import { SPECIAL_OFFER_NAV_ID } from "../../admin/plans/planCatalogNav";
import SpecialOfferPackageCard from "../../components/plans/SpecialOfferPackageCard";
import {
  SPECIAL_OFFER_DEFAULTS,
  SPECIAL_OFFER_PURCHASE_MODE,
  SPECIAL_OFFER_ACCESS_LEVEL_OPTIONS,
  formStateFromSpecialOffer,
  payloadFromSpecialOfferForm,
} from "../../constants/specialOfferPackage";
import "../../admin/marketplaceMembership/marketplace-membership-plans.css";
import "../../admin/plans/specialOfferAdmin.css";

export default function SuperAdminSpecialOfferPackagePage() {
  const { t } = useTranslation();
  const { push } = useToast();

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
      setError(getSafeApiErrorMessage(err) || t("planAdmin.sections.specialOffer.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      push({ type: "success", message: t("planAdmin.sections.specialOffer.saved") });
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("planAdmin.sections.specialOffer.saveFailed"),
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
          ? t("planAdmin.sections.specialOffer.visibleNow")
          : t("planAdmin.sections.specialOffer.hiddenNow"),
      });
    } catch (err) {
      setField("isVisible", !nextVisible);
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("planAdmin.sections.specialOffer.visibilityFailed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNewVersion = async () => {
    if (saving) return;
    const ok = window.confirm(t("planAdmin.sections.specialOffer.newVersionConfirm"));
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
        message: t("planAdmin.sections.specialOffer.newVersionSuccess"),
      });
    } catch (err) {
      push({
        type: "error",
        message:
          getSafeApiErrorMessage(err) ||
          t("planAdmin.sections.specialOffer.newVersionFailed"),
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
      hint={t("planAdmin.sections.specialOffer.hint")}
    >
      {error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}

      <DashboardSection
        title={t("planAdmin.sections.specialOffer.title")}
        description={t("planAdmin.sections.specialOffer.sectionDescription")}
      >
        {!form.isVisible ? (
          <p className="oh-special-offer-admin__hidden-note" role="status">
            {t("planAdmin.sections.specialOffer.hiddenNote")}
          </p>
        ) : null}

        {benefitsLocked ? (
          <p
            className="oh-special-offer-admin__locked-warning"
            role="alert"
            data-special-offer-locked="true"
          >
{t("planAdmin.sections.specialOffer.lockedWarning")}
          </p>
        ) : null}

        {loading ? (
<p className="oh-special-offer-admin__loading">{t("planAdmin.sections.specialOffer.loading")}</p>
        ) : (
          <div className="oh-special-offer-admin__layout" data-special-offer-admin="true">
            <div className="oh-special-offer-admin__preview">
              <h3 className="oh-special-offer-admin__panel-title">
{t("planAdmin.sections.specialOffer.livePreview")}
              </h3>
              <SpecialOfferPackageCard key={previewKey} offer={previewOffer} t={t} preview />
            </div>

            <div className="oh-special-offer-admin__editor">
              <h3 className="oh-special-offer-admin__panel-title">
{t("planAdmin.sections.specialOffer.editOffer")}
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
<span>{t("planAdmin.sections.specialOffer.visibleOnPublic")}</span>
              </label>

              <div className="oh-special-offer-admin__fields">
                <label className="oh-special-offer-admin__field--full">
<span>{t("planAdmin.sections.specialOffer.purchaseMethod")}</span>
                  <select
                    value={form.purchaseMode}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("purchaseMode", e.target.value)}
                    data-purchase-mode-select="true"
                    data-benefit-field="purchaseMode"
                  >
                    <option value={SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT}>
{t("planAdmin.sections.specialOffer.directCheckout")}
                    </option>
                    <option value={SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP}>
{t("planAdmin.sections.specialOffer.whatsappManual")}
                    </option>
                  </select>
                </label>

                {form.purchaseMode === SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT ? (
                  <>
                    <p className="oh-special-offer-admin__mode-note oh-special-offer-admin__mode-note--checkout" role="note">
                      {t("planAdmin.sections.specialOffer.checkoutModeNote")}
                    </p>
                    {planSummary ? (
                      <p className="oh-special-offer-admin__linked-summary" data-independent-plan-summary="true">
{t("planAdmin.sections.specialOffer.independentRow")}{" "}
                        {planSummary.tierCode || form.planTierCode || "special_offer"} · id{" "}
                        {planSummary.id || form.linkedMarketplacePlanId || "—"} ·{" "}
{planSummary.monthlyPriceJod ?? "—"} {t("planAdmin.common.currencyJod")} ·{" "}
{planSummary.monthlyBidAllowance ?? "—"} {t("planAdmin.sections.specialOffer.bids")} ·{" "}
{planSummary.cycleDurationDays ?? "—"} {t("planAdmin.common.days")}
                        {benefitsLocked
                          ? t("planAdmin.sections.specialOffer.lockedSuffix", {
                              count: form.purchaseCount || 0,
                            })
                          : ""}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="oh-special-offer-admin__mode-note oh-special-offer-admin__mode-note--whatsapp" role="note">
                    {t("planAdmin.sections.specialOffer.whatsappModeNote")}
                  </p>
                )}

                <label>
<span>{t("planAdmin.sections.specialOffer.offerTitle")}</span>
                  <input
                    value={form.title}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("title", e.target.value)}
                  />
                </label>
                <label>
<span>{t("planAdmin.sections.specialOffer.shortDesc")}</span>
                  <textarea
                    rows={2}
                    value={form.subtitle}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("subtitle", e.target.value)}
                  />
                </label>
                <label>
<span>{t("planAdmin.sections.specialOffer.badge")}</span>
                  <input
                    value={form.badgeText}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("badgeText", e.target.value)}
                  />
                </label>
                <label>
<span>{t("planAdmin.sections.specialOffer.ribbon")}</span>
                  <input
                    value={form.ribbonText}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("ribbonText", e.target.value)}
                  />
                </label>
                <label>
<span>{t("planAdmin.sections.specialOffer.price")}</span>
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
                  <span>{t("planAdmin.sections.specialOffer.originalPrice")}</span>
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
<span>{t("planAdmin.sections.specialOffer.totalBids")}</span>
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
<span>{t("planAdmin.sections.specialOffer.dailyLimit")}</span>
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
<span>{t("planAdmin.sections.specialOffer.durationDays")}</span>
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
<span>{t("planAdmin.sections.specialOffer.maxProject")}</span>
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
<span>{t("planAdmin.sections.specialOffer.accessLevel")}</span>
                  <select
                    value={form.accessLevelKey || "silver"}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("accessLevelKey", e.target.value)}
                    data-access-level-select="true"
                    data-benefit-field="accessLevelKey"
                  >
                    {SPECIAL_OFFER_ACCESS_LEVEL_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {t(`planAdmin.sections.specialOffer.accessLevels.${opt.key}`) || (opt.labelEn)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
<span>{t("planAdmin.sections.specialOffer.cta")}</span>
                  <input
                    value={form.ctaLabel}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("ctaLabel", e.target.value)}
                  />
                </label>
                <label className="oh-special-offer-admin__field--full">
<span>{t("planAdmin.sections.specialOffer.microcopy")}</span>
                  <input
                    value={form.microcopy}
                    disabled={benefitsLocked || saving}
                    onChange={(e) => setField("microcopy", e.target.value)}
                  />
                </label>
                <label className="oh-special-offer-admin__field--full">
<span>{t("planAdmin.sections.specialOffer.refundExplain")}</span>
                  <textarea
                    rows={8}
                    value={form.refundExplanationAr}
                    disabled={benefitsLocked || saving}
                    data-refund-explanation-field="true"
                    onChange={(e) => setField("refundExplanationAr", e.target.value)}
                    placeholder={t("planAdmin.sections.specialOffer.refundPlaceholder")}
                  />
                </label>
                <label className="oh-special-offer-admin__field--full">
<span>{t("planAdmin.sections.specialOffer.whatsappMessage")}</span>
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
{t("planAdmin.sections.specialOffer.saveChanges")}
                  </Button>
                ) : null}
                {benefitsLocked || form.canCreateNewVersion ? (
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleCreateNewVersion()}
                    data-create-new-offer="true"
                  >
{t("planAdmin.sections.specialOffer.createNew")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => setPreviewKey((k) => k + 1)}
                >
{t("planAdmin.sections.specialOffer.refreshPreview")}
                </Button>
                {!benefitsLocked ? (
                  <Button type="button" variant="secondary" disabled={saving} onClick={handleReset}>
{t("planAdmin.sections.specialOffer.resetDefaults")}
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
