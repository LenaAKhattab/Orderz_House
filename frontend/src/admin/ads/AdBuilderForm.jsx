import { useMemo, useState } from "react";
import AdVisualImagePicker from "./AdVisualImagePicker";
import AdUrlThumb from "./AdUrlThumb";
import AdBuilderStepNav from "./AdBuilderStepNav";
import AdBuilderQuickPresets from "./AdBuilderQuickPresets";
import { getPriorityOptionsForSelect } from "../../components/ads/bannerAdMeta";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

function FormPanel({ children, flat }) {
  return <div className={`oh-admin-ads__step-panel${flat ? " oh-admin-ads__step-panel--flat" : ""}`}>{children}</div>;
}

function Field({ className = "", children }) {
  return <div className={`oh-admin-ads__field ${className}`.trim()}>{children}</div>;
}

function AdvancedPanel({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="oh-admin-ads__advanced">
      <button type="button" className="oh-admin-ads__advanced-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        <span className="oh-admin-ads__advanced-chevron" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open ? <div className="oh-admin-ads__advanced-body">{children}</div> : null}
    </div>
  );
}

/**
 * @param {object} p
 * @param {object} p.data
 * @param {(next: object) => void} p.onChange
 * @param {number} p.activeStep
 * @param {(n: number) => void} p.onStepChange
 * @param {React.ReactNode} [p.orderStepSlot]
 * @param {object} [p.editingAd]
 */
export default function AdBuilderForm({
  data,
  onChange,
  fieldErrors = {},
  imageUrlErrors = {},
  attemptedSave = false,
  activeStep,
  onStepChange,
  orderStepSlot = null,
  editingAd = null,
}) {
  const { t, dir } = useTranslation();
  const openModeOptions = useMemo(
    () =>
      ["NEW_TAB", "SAME_TAB", "INTERNAL_ROUTE", "WHATSAPP"].map((value) => ({
        value,
        label: t(`ads.openModes.${value}`),
      })),
    [t],
  );
  const priorityOptions = useMemo(() => getPriorityOptionsForSelect(t), [t]);
  const patch = (p) => onChange({ ...data, ...p });
  const err = (key) => (attemptedSave && fieldErrors[key] ? fieldErrors[key] : null);
  const showVal = attemptedSave;
  const openMode = data.openMode || "NEW_TAB";
  const isWhatsApp = openMode === "WHATSAPP";

  return (
    <div dir={dir} className="oh-admin-ads__form-studio">
      <AdBuilderStepNav activeStep={activeStep} onStepChange={onStepChange} />

      {activeStep === 1 ? (
        <FormPanel>
          <div className="oh-admin-ads__builder-grid">
            <Field>
              <label htmlFor="ad-company">{t("ads.form.companyName")}</label>
              <input
                id="ad-company"
                placeholder={t("ads.form.companyPlaceholder")}
                value={data.companyName || ""}
                onChange={(e) => patch({ companyName: e.target.value })}
                className={showVal && err("companyName") ? "oh-admin-ads__input--error" : undefined}
              />
              {showVal && err("companyName") ? <span className="oh-admin-ads__field-error">{err("companyName")}</span> : null}
            </Field>

            <Field>
              <label htmlFor="ad-title">{t("ads.form.adTitle")}</label>
              <input
                id="ad-title"
                placeholder={t("ads.form.titlePlaceholder")}
                value={data.title || ""}
                onChange={(e) => patch({ title: e.target.value })}
                className={showVal && err("title") ? "oh-admin-ads__input--error" : undefined}
              />
              {showVal && err("title") ? <span className="oh-admin-ads__field-error">{err("title")}</span> : null}
            </Field>

            <Field>
              <label htmlFor="ad-subtitle">{t("ads.form.subtitle")}</label>
              <input
                id="ad-subtitle"
                placeholder={t("ads.form.subtitlePlaceholder")}
                value={data.subtitle || ""}
                onChange={(e) => patch({ subtitle: e.target.value })}
              />
            </Field>

            <Field className="oh-admin-ads__field--full">
              <label htmlFor="ad-desc">{t("ads.form.description")}</label>
              <textarea
                id="ad-desc"
                rows={3}
                placeholder={t("ads.form.descriptionPlaceholder")}
                value={data.description || ""}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </Field>
          </div>
        </FormPanel>
      ) : null}

      {activeStep === 2 ? (
        <FormPanel>
          <p className="oh-admin-ads__field-hint oh-admin-ads__field-hint--below-nav">
            {t("ads.form.themeHint")}
          </p>
          <AdBuilderQuickPresets data={data} onPatch={patch} />
        </FormPanel>
      ) : null}

      {activeStep === 3 ? (
        <FormPanel>
          <div className="oh-admin-ads__builder-grid">
            <Field>
              <label htmlFor="ad-sale">{t("ads.form.salePercent")}</label>
              <input
                id="ad-sale"
                dir="ltr"
                inputMode="numeric"
                placeholder="40"
                value={data.salePercent ?? ""}
                onChange={(e) => patch({ salePercent: e.target.value })}
                className={showVal && err("salePercent") ? "oh-admin-ads__input--error" : undefined}
              />
              {showVal && err("salePercent") ? <span className="oh-admin-ads__field-error">{err("salePercent")}</span> : null}
            </Field>

            <Field>
              <label htmlFor="ad-badge">{t("ads.form.badgeText")}</label>
              <input id="ad-badge" placeholder={t("ads.form.badgePlaceholder")} value={data.badgeText || ""} onChange={(e) => patch({ badgeText: e.target.value })} />
            </Field>

            <Field>
              <label htmlFor="ad-cta-text">{t("ads.form.ctaText")}</label>
              <input
                id="ad-cta-text"
                placeholder={t("ads.form.ctaPlaceholder")}
                value={data.ctaText || ""}
                onChange={(e) => patch({ ctaText: e.target.value })}
                className={showVal && err("ctaText") ? "oh-admin-ads__input--error" : undefined}
              />
              {showVal && err("ctaText") ? <span className="oh-admin-ads__field-error">{err("ctaText")}</span> : null}
            </Field>

            <Field>
              <label htmlFor="ad-open-mode">{t("ads.form.openLink")}</label>
              <select id="ad-open-mode" value={openMode} onChange={(e) => patch({ openMode: e.target.value })}>
                {openModeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            {!isWhatsApp ? (
              <Field className="oh-admin-ads__field--full">
                <label htmlFor="ad-cta-url">{t("ads.form.ctaUrl")}</label>
                <input
                  id="ad-cta-url"
                  dir="ltr"
                  placeholder={openMode === "INTERNAL_ROUTE" ? "/services" : "https://…"}
                  value={data.ctaUrl || ""}
                  onChange={(e) => patch({ ctaUrl: e.target.value })}
                  className={showVal && err("ctaUrl") ? "oh-admin-ads__input--error" : undefined}
                />
                {showVal && err("ctaUrl") ? <span className="oh-admin-ads__field-error">{err("ctaUrl")}</span> : null}
              </Field>
            ) : (
              <Field className="oh-admin-ads__field--full">
                <label htmlFor="ad-wa-cta">{t("ads.form.whatsapp")}</label>
                <input
                  id="ad-wa-cta"
                  dir="ltr"
                  placeholder="+9665…"
                  value={data.whatsapp || ""}
                  onChange={(e) => patch({ whatsapp: e.target.value })}
                  className={showVal && err("whatsapp") ? "oh-admin-ads__input--error" : undefined}
                />
                {showVal && err("whatsapp") ? <span className="oh-admin-ads__field-error">{err("whatsapp")}</span> : null}
              </Field>
            )}

            <Field className="oh-admin-ads__field--full">
              <AdvancedPanel title={t("ads.form.advancedOptions")}>
                <Field>
                  <label htmlFor="ad-phone">{t("ads.form.phoneDisplay")}</label>
                  <input id="ad-phone" dir="ltr" value={data.phone || ""} onChange={(e) => patch({ phone: e.target.value })} />
                </Field>
                <Field className="oh-admin-ads__field--full">
                  <label htmlFor="ad-logo">{t("ads.form.logoUrl")}</label>
                  <input
                    id="ad-logo"
                    dir="ltr"
                    placeholder="https://…"
                    value={data.logoUrl || ""}
                    onChange={(e) => patch({ logoUrl: e.target.value })}
                    className={showVal && err("logoUrl") ? "oh-admin-ads__input--error" : undefined}
                  />
                  {showVal && err("logoUrl") ? <span className="oh-admin-ads__field-error">{err("logoUrl")}</span> : null}
                  <AdUrlThumb url={data.logoUrl} className="oh-admin-ads__url-thumb--logo" />
                </Field>
              </AdvancedPanel>
            </Field>
          </div>
        </FormPanel>
      ) : null}

      {activeStep === 4 ? (
        <FormPanel flat>
          <AdVisualImagePicker
            data={data}
            onChange={onChange}
            fieldErrors={fieldErrors}
            imageUrlErrors={imageUrlErrors}
            attemptedSave={attemptedSave}
            bare
          />
        </FormPanel>
      ) : null}

      {activeStep === 5 ? (
        <FormPanel>
          <div className="oh-admin-ads__builder-grid">
            <Field className="oh-admin-ads__field--full">
              <span className="oh-admin-ads__micro-label">{t("ads.form.publishState")}</span>
              <div className="oh-admin-ads__status-pills">
                <button
                  type="button"
                  className={`oh-admin-ads__status-pill${!data.isActive ? " oh-admin-ads__status-pill--active" : ""}`}
                  onClick={() => patch({ isActive: false })}
                >
                  {t("ads.form.draftPill")}
                </button>
                <button
                  type="button"
                  className={`oh-admin-ads__status-pill${data.isActive ? " oh-admin-ads__status-pill--active" : ""}`}
                  onClick={() => patch({ isActive: true })}
                >
                  {t("ads.form.publishedPill")}
                </button>
              </div>
            </Field>

            <Field>
              <label htmlFor="ad-priority">{t("ads.form.priority")}</label>
              <select id="ad-priority" value={String(data.priority ?? 0)} onChange={(e) => patch({ priority: Number(e.target.value) })}>
                {priorityOptions.map((o) => (
                  <option key={o.value} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <label htmlFor="ad-start">{t("ads.form.start")}</label>
              <input id="ad-start" type="datetime-local" dir="ltr" value={data.startDate || ""} onChange={(e) => patch({ startDate: e.target.value })} />
            </Field>

            <Field>
              <label htmlFor="ad-end">{t("ads.form.end")}</label>
              <input
                id="ad-end"
                type="datetime-local"
                dir="ltr"
                value={data.endDate || ""}
                onChange={(e) => patch({ endDate: e.target.value })}
                className={showVal && err("endDate") ? "oh-admin-ads__input--error" : undefined}
              />
              {showVal && err("endDate") ? <span className="oh-admin-ads__field-error">{err("endDate")}</span> : null}
            </Field>

            <Field className="oh-admin-ads__field--full">
              <label htmlFor="ad-admin-note">{t("ads.form.adminNote")}</label>
              <input
                id="ad-admin-note"
                value={data.adminNote || ""}
                onChange={(e) => patch({ adminNote: e.target.value })}
                placeholder={t("ads.form.adminNotePlaceholder")}
                className={showVal && err("adminNote") ? "oh-admin-ads__input--error" : undefined}
              />
              {showVal && err("adminNote") ? <span className="oh-admin-ads__field-error">{err("adminNote")}</span> : null}
            </Field>

            <Field className="oh-admin-ads__field--full">
              <AdvancedPanel title={t("ads.form.internalNotesTitle")}>
                <label htmlFor="ad-internal-notes">{t("ads.form.teamNotes")}</label>
                <textarea id="ad-internal-notes" rows={2} value={data.internalNotes || ""} onChange={(e) => patch({ internalNotes: e.target.value })} />
              </AdvancedPanel>
            </Field>
          </div>
        </FormPanel>
      ) : null}

      {activeStep === 6 ? (
        <FormPanel flat>
          {editingAd ? (
            <div className="oh-admin-ads__edit-stats">
              <div className="oh-admin-ads__stat-chip">
                <span className="oh-admin-ads__stat-chip-label">{t("ads.form.impressions")}</span>
                <strong dir="ltr">{Number(editingAd.impressionCount) || 0}</strong>
              </div>
              <div className="oh-admin-ads__stat-chip">
                <span className="oh-admin-ads__stat-chip-label">{t("ads.form.clicks")}</span>
                <strong dir="ltr">{Number(editingAd.clickCount) || 0}</strong>
              </div>
            </div>
          ) : (
            <p className="oh-admin-ads__field-hint">{t("ads.form.statsHint")}</p>
          )}
          {orderStepSlot}
        </FormPanel>
      ) : null}

      <div className="oh-admin-ads__step-footer">
        {activeStep > 1 ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onStepChange(activeStep - 1)}>
            {t("ads.common.previous")}
          </button>
        ) : (
          <span />
        )}
        {activeStep < 6 ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onStepChange(activeStep + 1)}>
            {t("ads.common.next")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

