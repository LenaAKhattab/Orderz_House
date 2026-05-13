import { STYLE_PRESETS } from "./adFormConstants";
import ColorChoiceGroup from "./ColorChoiceGroup";
import CompactSwatchRow from "./CompactSwatchRow";
import {
  COLOR_SWATCHES_BORDER,
  COLOR_SWATCHES_BUTTON_TEXT,
  COLOR_SWATCHES_SOFT_BG,
  GRADIENT_QUICK_PRESETS,
  MAIN_SIMPLE_SWATCHES,
  pickContrastButtonText,
} from "./adColorPalette";

/** شريط المعاينة على بطاقات النمط — خلفية + زر فقط (ألوان النص في القسم الأول). */
const PRESET_STRIP_KEYS = ["backgroundColor", "buttonColor"];

function norm(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

function matchesPreset(current, presetColors) {
  return Object.keys(presetColors).every((k) => norm(current[k]) === norm(presetColors[k]));
}

/**
 * ألوان البطاقة العامة: نمط جاهز، خلفية، زر، وتدرج/إطار في المتقدم.
 * ألوان العنوان والنص والشارة تُضبط في «معلومات الإعلان الأساسية».
 *
 * @param {{ value: object, onChange: (next: object) => void, disabled?: boolean }} props
 */
export default function AdColorControls({ value, onChange, disabled }) {
  const v = value || {};

  const patch = (partial) => onChange({ ...v, ...partial });

  const applyPreset = (preset) => {
    onChange({ ...v, ...preset.colors });
  };

  const resetColors = () => {
    onChange({
      ...v,
      backgroundColor: "",
      titleColor: "",
      textColor: "",
      buttonColor: "",
      buttonTextColor: "",
      borderColor: "",
      badgeColor: "",
      gradientFrom: "",
      gradientTo: "",
    });
  };

  const setButtonColor = (hex) => {
    if (!hex) {
      patch({ buttonColor: "", buttonTextColor: "" });
      return;
    }
    patch({
      buttonColor: hex,
      buttonTextColor: pickContrastButtonText(hex),
    });
  };

  const applyGradientPreset = (g) => {
    patch({ gradientFrom: g.gradientFrom, gradientTo: g.gradientTo });
  };

  return (
    <div className="oh-admin-ads__color-stack oh-admin-ads__color-stack--simple">
      <p className="oh-admin-ads__helperText oh-admin-ads__helperText--tight">
        النصوص والشارة: اضبط ألوانها في القسم الأول. هنا نمط البطاقة والخلفية والزر والتدرج الاختياري.
      </p>

      <p className="oh-admin-ads__color-section-label">اختر نمطًا جاهزًا</p>
      <div className="oh-admin-preset-grid">
        {STYLE_PRESETS.map((p) => {
          const selected = matchesPreset(v, p.colors);
          return (
            <button
              key={p.id}
              type="button"
              className={`oh-admin-preset-card ${selected ? "oh-admin-preset-card--selected" : ""}`}
              disabled={disabled}
              onClick={() => applyPreset(p)}
            >
              <span className="oh-admin-preset-card__name">{p.label}</span>
              <div className="oh-admin-preset-card__strip" aria-hidden>
                {PRESET_STRIP_KEYS.map((key) => (
                  <span key={key} className="oh-admin-preset-card__sw" style={{ background: p.colors[key] || "#e5e7eb" }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="oh-admin-ads__preset-actions">
        <button type="button" className="btn btn-secondary" disabled={disabled} onClick={resetColors}>
          إعادة تعيين الألوان
        </button>
      </div>

      <p className="oh-admin-ads__color-section-label">تخصيص البطاقة</p>
      <div className="oh-admin-color-quick">
        <CompactSwatchRow
          label="خلفية الإعلان"
          value={v.backgroundColor}
          onChange={(hex) => patch({ backgroundColor: hex })}
          options={MAIN_SIMPLE_SWATCHES}
          allowEmpty
          emptyLabel="بدون تحديد"
          disabled={disabled}
        />
        <CompactSwatchRow
          label="لون الزر"
          value={v.buttonColor}
          onChange={setButtonColor}
          options={MAIN_SIMPLE_SWATCHES}
          allowEmpty
          emptyLabel="بدون تحديد"
          disabled={disabled}
        />
      </div>

      <details className="oh-admin-colors-advanced-block">
        <summary className="oh-admin-colors-advanced-block__summary">خيارات متقدمة</summary>
        <div className="oh-admin-colors-advanced-block__body">
          <p className="oh-admin-ads__helperText oh-admin-ads__helperText--tight">
            إطار البطاقة، نص الزر يدويًا، أو التدرج اللوني للخلفية — اختياري.
          </p>

          <div className="oh-admin-color-sections">
            <ColorChoiceGroup
              label="لون إطار البطاقة"
              value={v.borderColor}
              onChange={(next) => patch({ borderColor: next })}
              options={COLOR_SWATCHES_BORDER}
              allowEmpty
              emptyLabel="بدون تحديد"
              disabled={disabled}
              showHex={false}
            />
            <ColorChoiceGroup
              label="نص الزر (تجاوز تلقائي)"
              value={v.buttonTextColor}
              onChange={(next) => patch({ buttonTextColor: next })}
              options={COLOR_SWATCHES_BUTTON_TEXT}
              allowEmpty
              emptyLabel="تلقائي من لون الزر"
              disabled={disabled}
              showHex={false}
            />
          </div>

          <div className="oh-admin-gradient-block oh-admin-gradient-block--nested">
            <h4 className="oh-admin-gradient-block__title">التدرج اللوني للخلفية</h4>
            <p className="oh-admin-ads__helperText oh-admin-gradient-block__hint">
              اختياري — إذا لم ترغب بتدرج، اتركه فارغًا أو اختر «بدون تدرج».
            </p>
            <div className="oh-admin-gradient-quick" role="group" aria-label="تدرجات جاهزة">
              {GRADIENT_QUICK_PRESETS.map((g) => {
                const sel = norm(v.gradientFrom) === norm(g.gradientFrom) && norm(v.gradientTo) === norm(g.gradientTo);
                const isClear = !g.gradientFrom && !g.gradientTo;
                return (
                  <button
                    key={g.label}
                    type="button"
                    disabled={disabled}
                    className={`oh-admin-gradient-chip ${sel ? "oh-admin-gradient-chip--selected" : ""}`}
                    onClick={() => applyGradientPreset(g)}
                  >
                    {isClear ? (
                      <span>بدون تدرج</span>
                    ) : (
                      <>
                        <span className="oh-admin-gradient-chip__dots" aria-hidden>
                          <span style={{ background: g.gradientFrom }} />
                          <span style={{ background: g.gradientTo }} />
                        </span>
                        <span>{g.label}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="oh-admin-gradient-fine">
              <ColorChoiceGroup
                label="بداية التدرج"
                value={v.gradientFrom}
                onChange={(next) => patch({ gradientFrom: next })}
                options={COLOR_SWATCHES_SOFT_BG}
                allowEmpty
                emptyLabel="بدون تحديد"
                disabled={disabled}
                showHex={false}
              />
              <ColorChoiceGroup
                label="نهاية التدرج"
                value={v.gradientTo}
                onChange={(next) => patch({ gradientTo: next })}
                options={COLOR_SWATCHES_SOFT_BG}
                allowEmpty
                emptyLabel="بدون تحديد"
                disabled={disabled}
                showHex={false}
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
