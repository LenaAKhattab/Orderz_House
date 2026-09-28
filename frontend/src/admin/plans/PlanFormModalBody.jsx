import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/planAdminResources";
import PlanCollapsibleSection from "./PlanCollapsibleSection";
import PlanFormSection from "./PlanFormSection";
import PlanToggle from "./PlanToggle";
import { PLAN_FORM_SECTIONS, getPlanFormCopy, planFormSectionLabel } from "./planFormUiCopy";
import {
  formatCheckoutPlanOptionLabel,
  formatPlanPageOptionLabel,
  isLinkedCheckoutRequired,
  shouldShowLinkedCheckoutField,
} from "./planFormLinkingUtils";
import { getPlanFormWarnings } from "./planFormWarnings";

function Field({ label, hint, children, style }) {
  return (
    <div className="oh-sapl-field" style={style}>
      <span className="oh-sapl-field__label">{label}</span>
      {hint ? <p className="oh-sapl-field__hint">{hint}</p> : null}
      {children}
    </div>
  );
}

function Grid({ children, className = "", style }) {
  return (
    <div className={`oh-sapl-grid ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

function useMobileAccordionLayout() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobile;
}

/**
 * Tabbed (desktop) / accordion (mobile) plan form — all fields, same payload keys.
 * @param {{
 *   form: Record<string, unknown>;
 *   setForm: import("react").Dispatch<import("react").SetStateAction<Record<string, unknown>>>;
 *   submitting?: boolean;
 *   mode: "create" | "edit";
 *   planPages?: object[];
 *   canonicalPlans?: object[];
 *   excludePlanId?: string | number | null;
 *   readOnlyInternalName?: string;
 * }} p
 */
export default function PlanFormModalBody({
  form,
  setForm,
  submitting = false,
  mode,
  planPages = [],
  canonicalPlans = [],
  excludePlanId = null,
  readOnlyInternalName = "",
}) {
  const { locale, t } = useTranslation();
  const isEn = locale === "en";
  const copy = useMemo(() => getPlanFormCopy(t), [t]);
  const warnings = useMemo(() => getPlanFormWarnings(form), [form]);
  const mobileAccordion = useMobileAccordionLayout();
  const [activeTab, setActiveTab] = useState("basic");

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const showLinkedCheckout = shouldShowLinkedCheckoutField(form, planPages);
  const linkedCheckoutRequired = isLinkedCheckoutRequired(form, planPages);
  const checkoutPlanOptions = useMemo(
    () =>
      (canonicalPlans || []).filter(
        (plan) => excludePlanId == null || String(plan.id) !== String(excludePlanId),
      ),
    [canonicalPlans, excludePlanId],
  );

  const sectionLabel = (section) => planFormSectionLabel(t, section);

  const internalNamePreview =
    mode === "edit"
      ? String(form.internalName || "").trim()
      : String(readOnlyInternalName || "").trim();

  const sections = {
    basic: (
      <PlanFormSection
        hint={t("planAdmin.form.helpers.basicIntro")}
      >
        {internalNamePreview ? (
          <Field
            label={t("planAdmin.form.helpers.internalName")}
            hint={
              t("planAdmin.form.helpers.internalNameHint")
            }
          >
            <input
              className="oh-sapl-input oh-sapl-input--readonly"
              dir="ltr"
              value={internalNamePreview}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
            />
          </Field>
        ) : null}
        <Field label={t("planAdmin.form.fields.title")}>
          <input
            className="oh-sapl-input"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder={t("planAdmin.form.fields.titlePlaceholder")}
            disabled={submitting}
          />
        </Field>
        <Field label={t("planAdmin.form.fields.shortDesc")}>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder={t("planAdmin.common.optional")}
            disabled={submitting}
          />
        </Field>
        <Field label={t("planAdmin.form.fields.durationDays")} style={{ marginTop: 12 }}>
          <input
            className="oh-sapl-input"
            type="number"
            min={1}
            max={3650}
            value={form.durationDays}
            onChange={(e) => set("durationDays", e.target.value)}
            disabled={submitting}
          />
        </Field>
        <p className="oh-sapl-form-subhint" style={{ marginTop: 16 }}>
          {t("planAdmin.form.helpers.enCopySection")}
        </p>
        <Field label={t("planAdmin.form.fields.titleEn")}>
          <input
            className="oh-sapl-input"
            dir="ltr"
            value={form.titleEn}
            onChange={(e) => set("titleEn", e.target.value)}
            placeholder="Professional freelancer plan"
            disabled={submitting}
          />
        </Field>
        <Field label={t("planAdmin.form.fields.shortDescEn")} style={{ marginTop: 12 }}>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            dir="ltr"
            rows={3}
            value={form.descriptionEn}
            onChange={(e) => set("descriptionEn", e.target.value)}
            placeholder={t("planAdmin.common.optional")}
            disabled={submitting}
          />
        </Field>
      </PlanFormSection>
    ),

    pricing: (
      <PlanFormSection
        hint={
          t("planAdmin.form.helpers.pricingIntro")
        }
      >
        <Grid className="oh-sapl-grid--2">
          <Field label={t("planAdmin.form.fields.totalPrice")}>
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.priceJod}
              onChange={(e) => set("priceJod", e.target.value)}
              placeholder={t("planAdmin.form.helpers.priceFreePlaceholder")}
              disabled={submitting}
            />
          </Field>
          <Field
            label={t("planAdmin.form.fields.stripeAmount")}
            hint={copy.stripeAmountHelper}
          >
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.stripeCheckoutAmountJod}
              onChange={(e) => set("stripeCheckoutAmountJod", e.target.value)}
              placeholder={t("planAdmin.form.helpers.stripeEmptyPlaceholder")}
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
          <Field label={t("planAdmin.form.fields.currency")}>
            <input
              className="oh-sapl-input"
              dir="ltr"
              maxLength={3}
              value={form.currency}
              onChange={(e) => set("currency", e.target.value.toUpperCase())}
              placeholder="JOD"
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Field
          label={t("planAdmin.form.fields.billingGap")}
          hint={
            t("planAdmin.form.helpers.billingGapHint")
          }
          style={{ marginTop: 12 }}
        >
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={3}
            value={form.priceIntroText}
            onChange={(e) => set("priceIntroText", e.target.value)}
            placeholder={
              t("planAdmin.form.helpers.billingGapExample")
            }
            disabled={submitting}
          />
        </Field>
        <Field
          label={t("planAdmin.form.fields.billingGapEn")}
          style={{ marginTop: 12 }}
        >
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            dir="ltr"
            rows={3}
            value={form.priceIntroTextEn}
            onChange={(e) => set("priceIntroTextEn", e.target.value)}
            placeholder="Example: Suitable for beginners or freelancers"
            disabled={submitting}
          />
        </Field>
        <Field label={t("planAdmin.form.fields.paymentNotes")} style={{ marginTop: 12 }}>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={2}
            value={form.paymentNotes}
            onChange={(e) => set("paymentNotes", e.target.value)}
            disabled={submitting}
          />
        </Field>
        <p className="oh-sapl-form-subhint">{copy.installmentsHint}</p>
        <Grid className="oh-sapl-grid--3" style={{ marginTop: 8 }}>
          <Field label={t("planAdmin.form.fields.upfrontInstallment")}>
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.installmentUpfrontJod}
              onChange={(e) => set("installmentUpfrontJod", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={t("planAdmin.form.fields.monthlyInstallment")}>
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.installmentMonthlyJod}
              onChange={(e) => set("installmentMonthlyJod", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={t("planAdmin.form.fields.installmentMonths")}>
            <input
              className="oh-sapl-input"
              type="number"
              min={1}
              max={120}
              value={form.installmentMonths}
              onChange={(e) => set("installmentMonths", e.target.value)}
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Field label={t("planAdmin.form.fields.installmentNotes")} style={{ marginTop: 12 }}>
          <input
            className="oh-sapl-input"
            value={form.installmentNotes}
            onChange={(e) => set("installmentNotes", e.target.value)}
            disabled={submitting}
          />
        </Field>

        <div className="oh-sapl-sale-block" style={{ marginTop: 20 }}>
          <h4 className="oh-sapl-sale-block__title">
            {t("planAdmin.form.fields.planDiscount")}
          </h4>
          <PlanToggle
            checked={Boolean(form.saleEnabled)}
            onChange={(v) => set("saleEnabled", v)}
            label={t("planAdmin.form.fields.enableDiscount")}
            disabled={submitting}
          />
          {form.saleEnabled ? (
            <>
              <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
                <Field label={t("planAdmin.form.fields.discountPct")}>
                  <input
                    className="oh-sapl-input"
                    type="number"
                    min={0.01}
                    max={99.99}
                    step="0.01"
                    value={form.salePercentage}
                    onChange={(e) => set("salePercentage", e.target.value)}
                    placeholder="20"
                    disabled={submitting}
                    required
                  />
                </Field>
              </Grid>
              <Field label={t("planAdmin.form.fields.saleReason")} style={{ marginTop: 12 }}>
                <input
                  className="oh-sapl-input"
                  value={form.saleReason}
                  onChange={(e) => set("saleReason", e.target.value)}
                  placeholder={t("planAdmin.form.fields.saleReasonPlaceholder")}
                  disabled={submitting}
                  required
                />
              </Field>
              <Field label={t("planAdmin.form.fields.saleReasonEn")} style={{ marginTop: 12 }}>
                <input
                  className="oh-sapl-input"
                  dir="ltr"
                  value={form.saleReasonEn}
                  onChange={(e) => set("saleReasonEn", e.target.value)}
                  placeholder="Limited-time offer"
                  disabled={submitting}
                />
              </Field>
              {(() => {
                const base =
                  form.stripeCheckoutAmountJod !== "" && Number(form.stripeCheckoutAmountJod) > 0
                    ? Number(form.stripeCheckoutAmountJod)
                    : form.priceJod === ""
                      ? null
                      : Number(form.priceJod);
                const pct = Number(form.salePercentage);
                if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(pct) || pct <= 0 || pct >= 100) {
                  return null;
                }
                const final = Math.round(base * (1000 - pct * 10)) / 1000;
                const fmt = (n) =>
                  n.toLocaleString(isEn ? "en-US" : "ar-JO-u-nu-latn", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 3,
                  });
                return (
                  <div className="oh-sapl-sale-preview" style={{ marginTop: 12 }}>
                    <p>
                      {t("planAdmin.form.fields.originalPricePreview", { amount: fmt(base) })}
                    </p>
                    <p>{t("planAdmin.form.fields.discountPreview", { pct })}</p>
                    <p>{t("planAdmin.form.fields.finalPricePreview", { amount: fmt(final) })}</p>
                    <p className="oh-sapl-field__hint">
                      {t("planAdmin.form.helpers.salePreviewNote")}
                    </p>
                  </div>
                );
              })()}
            </>
          ) : null}
        </div>
      </PlanFormSection>
    ),

    limits: (
      <PlanFormSection
        hint={
          t("planAdmin.form.helpers.limitsIntro")
        }
      >
        <Grid className="oh-sapl-grid--2">
          <Field label={t("planAdmin.form.fields.minOrder")}>
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.orderValueMinJod}
              onChange={(e) => set("orderValueMinJod", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={t("planAdmin.form.fields.maxOrder")}>
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.orderValueMaxJod}
              onChange={(e) => set("orderValueMaxJod", e.target.value)}
              placeholder={t("planAdmin.form.helpers.maxOrderEmpty")}
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Field
          label={t("planAdmin.form.fields.activationConditions")}
          hint={copy.activationHelper}
          style={{ marginTop: 12 }}
        >
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={3}
            value={form.activationRequirements}
            onChange={(e) => set("activationRequirements", e.target.value)}
            disabled={submitting}
          />
        </Field>
        <Field label={t("planAdmin.form.fields.refundPolicy")} style={{ marginTop: 12 }}>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={2}
            value={form.refundPolicy}
            onChange={(e) => set("refundPolicy", e.target.value)}
            disabled={submitting}
          />
        </Field>
      </PlanFormSection>
    ),

    availability: (
      <PlanFormSection
        hint={
          t("planAdmin.form.helpers.availabilityIntro")
        }
      >
        <div className="oh-sapl-options">
          <PlanToggle
            label={t("planAdmin.form.fields.planActive")}
            description={
              t("planAdmin.form.helpers.planInactiveHint")
            }
            checked={form.isActive}
            disabled={submitting}
            onChange={(v) => set("isActive", v)}
          />
          <PlanToggle
            label={t("planAdmin.form.fields.showPublic")}
            description={
              t("planAdmin.form.helpers.hidePublicHint")
            }
            checked={form.isVisible}
            disabled={submitting}
            onChange={(v) => set("isVisible", v)}
          />
          <PlanToggle
            label={t("planAdmin.form.fields.selfPurchase")}
            description={t("planAdmin.form.helpers.selfPurchaseHint")}
            checked={form.selfSubscribeAllowed}
            disabled={submitting}
            onChange={(v) => set("selfSubscribeAllowed", v)}
          />
          <PlanToggle
            label={t("planAdmin.form.fields.requiresVisit")}
            checked={form.requiresCompanyVisit}
            disabled={submitting}
            onChange={(v) => set("requiresCompanyVisit", v)}
          />
        </div>
        <Field
          label={t("planAdmin.form.fields.adminNotes")}
          hint={t("planAdmin.form.helpers.adminNotesHint")}
          style={{ marginTop: 12 }}
        >
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={2}
            value={form.adminNotes}
            onChange={(e) => set("adminNotes", e.target.value)}
            disabled={submitting}
          />
        </Field>
      </PlanFormSection>
    ),

    marketing: (
      <PlanFormSection hint={t("planAdmin.form.helpers.featuresHint")}>
        <Field label={t("planAdmin.form.fields.includes")}>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={5}
            value={form.featuresText}
            onChange={(e) => set("featuresText", e.target.value)}
            placeholder={t("planAdmin.form.fields.includesPlaceholder")}
            disabled={submitting}
          />
        </Field>
        <Field
          label={t("planAdmin.form.fields.includesEn")}
          style={{ marginTop: 12 }}
        >
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            dir="ltr"
            rows={5}
            value={form.featuresTextEn}
            onChange={(e) => set("featuresTextEn", e.target.value)}
            placeholder="e.g. Contract signing at company office"
            disabled={submitting}
          />
        </Field>
        <Field label={t("planAdmin.form.fields.trainings")} style={{ marginTop: 12 }}>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={4}
            value={form.trainingsText}
            onChange={(e) => set("trainingsText", e.target.value)}
            placeholder={t("planAdmin.form.fields.trainingsPlaceholder")}
            disabled={submitting}
          />
        </Field>
        <Field
          label={t("planAdmin.form.fields.trainingsEn")}
          style={{ marginTop: 12 }}
        >
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            dir="ltr"
            rows={4}
            value={form.trainingsTextEn}
            onChange={(e) => set("trainingsTextEn", e.target.value)}
            placeholder="One line per training"
            disabled={submitting}
          />
        </Field>
        <div className="oh-sapl-options" style={{ marginTop: 12 }}>
          <PlanToggle
            label={t("planAdmin.form.fields.featured")}
            checked={form.isFeatured}
            disabled={submitting}
            onChange={(v) => set("isFeatured", v)}
          />
          <PlanToggle
            label={t("planAdmin.form.fields.mostPopular")}
            checked={form.isPopular}
            disabled={submitting}
            onChange={(v) => set("isPopular", v)}
          />
        </div>
        <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
          <Field label={t("planAdmin.form.fields.badgeLabel")}>
            <input
              className="oh-sapl-input"
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={t("planAdmin.form.fields.billingText")}>
            <input
              className="oh-sapl-input"
              value={form.billingText}
              onChange={(e) => set("billingText", e.target.value)}
              placeholder={t("planAdmin.form.fields.billingTextPlaceholder")}
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
          <Field label={t("planAdmin.form.fields.badgeLabelEn")}>
            <input
              className="oh-sapl-input"
              dir="ltr"
              value={form.labelEn}
              onChange={(e) => set("labelEn", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={t("planAdmin.form.fields.billingTextEn")}>
            <input
              className="oh-sapl-input"
              dir="ltr"
              value={form.billingTextEn}
              onChange={(e) => set("billingTextEn", e.target.value)}
              placeholder="Full year"
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
          <Field label={t("planAdmin.form.fields.buttonAr")}>
            <input
              className="oh-sapl-input"
              value={form.buttonText}
              onChange={(e) => set("buttonText", e.target.value)}
              placeholder={t("planAdmin.form.fields.buttonArPlaceholder")}
              disabled={submitting}
            />
          </Field>
          <Field label={t("planAdmin.form.fields.buttonEn")}>
            <input
              className="oh-sapl-input"
              dir="ltr"
              value={form.buttonTextEn}
              onChange={(e) => set("buttonTextEn", e.target.value)}
              placeholder="Start now"
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
          <Field
            label={t("planAdmin.form.fields.planPage")}
            hint={
              t("planAdmin.form.helpers.planPageHint")
            }
          >
            <select
              className="oh-sapl-input"
              value={form.planPageId}
              onChange={(e) => set("planPageId", e.target.value)}
              disabled={submitting || planPages.length === 0}
              required={showLinkedCheckout}
            >
              {planPages.length === 0 ? (
                <option value="">{t("planAdmin.form.fields.noPages")}</option>
              ) : (
                <>
                  {!form.planPageId ? (
                    <option value="">{t("planAdmin.form.fields.selectPage")}</option>
                  ) : null}
                  {planPages.map((page) => (
                    <option key={page.id} value={String(page.id)}>
                      {formatPlanPageOptionLabel(page, isEn)}
                    </option>
                  ))}
                </>
              )}
            </select>
          </Field>
          {showLinkedCheckout ? (
            <Field
              label={t("planAdmin.form.fields.linkedCheckout")}
              hint={
                t("planAdmin.form.helpers.linkedCheckoutHint")
              }
            >
              <select
                className="oh-sapl-input"
                value={form.subscriptionPlanId}
                onChange={(e) => set("subscriptionPlanId", e.target.value)}
                disabled={submitting || checkoutPlanOptions.length === 0}
                required={linkedCheckoutRequired}
              >
                {!linkedCheckoutRequired ? (
                  <option value="">
                    {t("planAdmin.form.fields.standaloneCheckout")}
                  </option>
                ) : (
                  <option value="">
                    {t("planAdmin.form.fields.selectLinkedCheckout")}
                  </option>
                )}
                {checkoutPlanOptions.map((plan) => (
                  <option key={plan.id} value={String(plan.id)}>
                    {formatCheckoutPlanOptionLabel(plan, isEn)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </Grid>
        <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
          <Field label={t("planAdmin.form.fields.offerLabel")}>
            <input
              className="oh-sapl-input"
              value={form.offerLabel}
              onChange={(e) => set("offerLabel", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={t("planAdmin.form.fields.offerExpires")}>
            <input
              className="oh-sapl-input"
              type="date"
              value={form.offerExpiresAt}
              onChange={(e) => set("offerExpiresAt", e.target.value)}
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Field label={t("planAdmin.form.fields.offerLabelEn")} style={{ marginTop: 12 }}>
          <input
            className="oh-sapl-input"
            dir="ltr"
            value={form.offerLabelEn}
            onChange={(e) => set("offerLabelEn", e.target.value)}
            disabled={submitting}
          />
        </Field>
      </PlanFormSection>
    ),
  };

  return (
    <div className="oh-sapl-form oh-sapl-form--wide oh-sapl-form-modal">
      {warnings.length > 0 ? (
        <ul className="oh-sapl-form-warnings" role="status" aria-live="polite">
          {warnings.map((w) => (
            <li key={w.key}>{copy[w.messageKey]}</li>
          ))}
        </ul>
      ) : null}

      {mobileAccordion ? (
        <div className="oh-sapl-form-accordion">
          {PLAN_FORM_SECTIONS.map((section, index) => (
            <PlanCollapsibleSection
              key={section.id}
              id={`oh-sapl-form-section-${section.id}`}
              title={sectionLabel(section)}
              defaultOpen={index === 0}
              className="oh-sapl-form-accordion__section"
            >
              {sections[section.id]}
            </PlanCollapsibleSection>
          ))}
        </div>
      ) : (
        <div className="oh-sapl-form-tabs">
          <div
            className="oh-sapl-form-tabs__nav"
            role="tablist"
            aria-label={t("planAdmin.form.sectionsAria")}
          >
            {PLAN_FORM_SECTIONS.map((section) => {
              const selected = activeTab === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  id={`oh-sapl-tab-${section.id}`}
                  aria-selected={selected}
                  aria-controls={`oh-sapl-panel-${section.id}`}
                  tabIndex={selected ? 0 : -1}
                  className={`oh-sapl-form-tabs__tab${selected ? " oh-sapl-form-tabs__tab--active" : ""}`}
                  onClick={() => setActiveTab(section.id)}
                >
                  {sectionLabel(section)}
                </button>
              );
            })}
          </div>
          {PLAN_FORM_SECTIONS.map((section) => (
            <div
              key={section.id}
              id={`oh-sapl-panel-${section.id}`}
              role="tabpanel"
              aria-labelledby={`oh-sapl-tab-${section.id}`}
              hidden={activeTab !== section.id}
              className="oh-sapl-form-tabs__panel"
            >
              {sections[section.id]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
