import { useState } from "react";
import AdVisualImagePicker from "./AdVisualImagePicker";
import AdUrlThumb from "./AdUrlThumb";
import AdBuilderStepNav from "./AdBuilderStepNav";
import AdBuilderQuickPresets from "./AdBuilderQuickPresets";
import { PLACEMENT_OPTIONS } from "./adFormConstants";
import { PRIORITY_OPTIONS } from "../../components/ads/bannerAdMeta";

const OPEN_MODE_OPTIONS = [
  { value: "NEW_TAB", label: "فتح في تبويب جديد" },
  { value: "SAME_TAB", label: "فتح في نفس الصفحة" },
  { value: "INTERNAL_ROUTE", label: "رابط داخلي" },
  { value: "WHATSAPP", label: "واتساب" },
];

function FormPanel({ children, flat }) {
  return <div className={`oh-admin-ads__step-panel${flat ? " oh-admin-ads__step-panel--flat" : ""}`}>{children}</div>;
}

function Field({ className = "", children }) {
  return <div className={`oh-admin-ads__field ${className}`.trim()}>{children}</div>;
}

function AdvancedPanel({ title = "خيارات متقدمة", children }) {
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
  const patch = (p) => onChange({ ...data, ...p });
  const err = (key) => (attemptedSave && fieldErrors[key] ? fieldErrors[key] : null);
  const showVal = attemptedSave;
  const openMode = data.openMode || "NEW_TAB";
  const isWhatsApp = openMode === "WHATSAPP";

  return (
    <div dir="rtl" className="oh-admin-ads__form-studio">
      <AdBuilderStepNav activeStep={activeStep} onStepChange={onStepChange} />

      {activeStep === 1 ? (
        <FormPanel>
          <div className="oh-admin-ads__builder-grid">
            <Field>
              <label htmlFor="ad-company">اسم الشركة *</label>
              <input
                id="ad-company"
                placeholder="مثال: متجر هدايا"
                value={data.companyName || ""}
                onChange={(e) => patch({ companyName: e.target.value })}
                className={showVal && err("companyName") ? "oh-admin-ads__input--error" : undefined}
              />
              {showVal && err("companyName") ? <span className="oh-admin-ads__field-error">{err("companyName")}</span> : null}
            </Field>

            <Field>
              <label htmlFor="ad-title">عنوان الإعلان *</label>
              <input
                id="ad-title"
                placeholder="مثال: خصم خاص"
                value={data.title || ""}
                onChange={(e) => patch({ title: e.target.value })}
                className={showVal && err("title") ? "oh-admin-ads__input--error" : undefined}
              />
              {showVal && err("title") ? <span className="oh-admin-ads__field-error">{err("title")}</span> : null}
            </Field>

            <Field>
              <label htmlFor="ad-subtitle">السطر الفرعي</label>
              <input
                id="ad-subtitle"
                placeholder="مثال: عرض محدود"
                value={data.subtitle || ""}
                onChange={(e) => patch({ subtitle: e.target.value })}
              />
            </Field>

            <Field className="oh-admin-ads__field--full">
              <label htmlFor="ad-desc">وصف الإعلان</label>
              <textarea
                id="ad-desc"
                rows={3}
                placeholder="وصف قصير للعرض"
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
            اختر ثيم الألوان — يُطبَّق تلقائياً على الخلفية والنصوص والأزرار والشارات.
          </p>
          <AdBuilderQuickPresets data={data} onPatch={patch} />
        </FormPanel>
      ) : null}

      {activeStep === 3 ? (
        <FormPanel>
          <div className="oh-admin-ads__builder-grid">
            <Field>
              <label htmlFor="ad-sale">نسبة الخصم %</label>
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
              <label htmlFor="ad-badge">نص الشارة</label>
              <input id="ad-badge" placeholder="حصري" value={data.badgeText || ""} onChange={(e) => patch({ badgeText: e.target.value })} />
            </Field>

            <Field>
              <label htmlFor="ad-cta-text">نص الزر *</label>
              <input
                id="ad-cta-text"
                placeholder="احصل على العرض"
                value={data.ctaText || ""}
                onChange={(e) => patch({ ctaText: e.target.value })}
                className={showVal && err("ctaText") ? "oh-admin-ads__input--error" : undefined}
              />
              {showVal && err("ctaText") ? <span className="oh-admin-ads__field-error">{err("ctaText")}</span> : null}
            </Field>

            <Field>
              <label htmlFor="ad-open-mode">فتح الرابط</label>
              <select id="ad-open-mode" value={openMode} onChange={(e) => patch({ openMode: e.target.value })}>
                {OPEN_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            {!isWhatsApp ? (
              <Field className="oh-admin-ads__field--full">
                <label htmlFor="ad-cta-url">رابط الزر *</label>
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
                <label htmlFor="ad-wa-cta">واتساب *</label>
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
              <AdvancedPanel>
                <Field>
                  <label htmlFor="ad-phone">هاتف للعرض</label>
                  <input id="ad-phone" dir="ltr" value={data.phone || ""} onChange={(e) => patch({ phone: e.target.value })} />
                </Field>
                <Field className="oh-admin-ads__field--full">
                  <label htmlFor="ad-logo">رابط الشعار</label>
                  <input
                    id="ad-logo"
                    dir="ltr"
                    placeholder="https://…"
                    value={data.logoUrl || ""}
                    onChange={(e) => patch({ logoUrl: e.target.value })}
                    className={showVal && err("logoUrl") ? "oh-admin-ads__input--error" : undefined}
                  />
                  {showVal && err("logoUrl") ? <span className="oh-admin-ads__field-error">{err("logoUrl")}</span> : null}
                  <AdUrlThumb url={data.logoUrl} label="معاينة" className="oh-admin-ads__url-thumb--logo" />
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
              <span className="oh-admin-ads__micro-label">الحالة</span>
              <div className="oh-admin-ads__status-pills">
                <button
                  type="button"
                  className={`oh-admin-ads__status-pill${!data.isActive ? " oh-admin-ads__status-pill--active" : ""}`}
                  onClick={() => patch({ isActive: false })}
                >
                  مسودة
                </button>
                <button
                  type="button"
                  className={`oh-admin-ads__status-pill${data.isActive ? " oh-admin-ads__status-pill--active" : ""}`}
                  onClick={() => patch({ isActive: true })}
                >
                  منشور
                </button>
              </div>
            </Field>

            <Field>
              <label htmlFor="ad-placement">مكان العرض</label>
              <select id="ad-placement" value={data.placement || "home_right_panel"} onChange={(e) => patch({ placement: e.target.value })}>
                {PLACEMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <label htmlFor="ad-priority">الأولوية</label>
              <select id="ad-priority" value={String(data.priority ?? 0)} onChange={(e) => patch({ priority: Number(e.target.value) })}>
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <label htmlFor="ad-start">البداية</label>
              <input id="ad-start" type="datetime-local" dir="ltr" value={data.startDate || ""} onChange={(e) => patch({ startDate: e.target.value })} />
            </Field>

            <Field>
              <label htmlFor="ad-end">النهاية</label>
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
              <label htmlFor="ad-admin-note">سبب الإجراء *</label>
              <input
                id="ad-admin-note"
                value={data.adminNote || ""}
                onChange={(e) => patch({ adminNote: e.target.value })}
                placeholder="مطلوب عند الحفظ"
                className={showVal && err("adminNote") ? "oh-admin-ads__input--error" : undefined}
              />
              {showVal && err("adminNote") ? <span className="oh-admin-ads__field-error">{err("adminNote")}</span> : null}
            </Field>

            <Field className="oh-admin-ads__field--full">
              <AdvancedPanel title="ملاحظات داخلية">
                <label htmlFor="ad-internal-notes">ملاحظات الفريق</label>
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
                <span className="oh-admin-ads__stat-chip-label">ظهورات</span>
                <strong dir="ltr">{Number(editingAd.impressionCount) || 0}</strong>
              </div>
              <div className="oh-admin-ads__stat-chip">
                <span className="oh-admin-ads__stat-chip-label">نقرات</span>
                <strong dir="ltr">{Number(editingAd.clickCount) || 0}</strong>
              </div>
              <div className="oh-admin-ads__stat-chip">
                <span className="oh-admin-ads__stat-chip-label">مكان العرض</span>
                <strong>{PLACEMENT_OPTIONS.find((p) => p.value === editingAd.placement)?.label || editingAd.placement}</strong>
              </div>
            </div>
          ) : (
            <p className="oh-admin-ads__field-hint">احفظ الإعلان أولاً لعرض الإحصاءات التفصيلية في الجدول.</p>
          )}
          {orderStepSlot}
        </FormPanel>
      ) : null}

      <div className="oh-admin-ads__step-footer">
        {activeStep > 1 ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onStepChange(activeStep - 1)}>
            السابق
          </button>
        ) : (
          <span />
        )}
        {activeStep < 6 ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onStepChange(activeStep + 1)}>
            التالي
          </button>
        ) : null}
      </div>
    </div>
  );
}

