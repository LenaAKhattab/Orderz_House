import { COLOR_PRESET_DB_PATCH } from "../../components/ads/homeOffersTheme";
import { PREMIUM_THEME_EXTRAS } from "../../components/ads/bannerDesignSystem";
import CompactSwatchRow from "./CompactSwatchRow";
import { MAIN_SIMPLE_SWATCHES, pickContrastButtonText } from "./adColorPalette";

const QUICK_PRESETS = [
  { key: "blue_white", label: "أزرق أفقي" },
  { key: "cream_navy", label: "كريمي / كحلي" },
  { key: "red_sale", label: "عرض أحمر" },
  { key: "navy_gold", label: "فاخر ذهبي" },
  { key: "green_nature", label: "طبيعي أخضر" },
];

function norm(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

/**
 * @param {{ data: object, onChange: (next: object) => void }} props
 */
export default function AdBannerColorFields({ data, onChange }) {
  const patch = (p) => onChange({ ...data, ...p });

  const applyQuickPreset = (key) => {
    const p = COLOR_PRESET_DB_PATCH[key] || COLOR_PRESET_DB_PATCH.blue_white;
    const extras = PREMIUM_THEME_EXTRAS[key] || {};
    patch({
      colorPreset: key,
      gradientFrom: p.gradientFrom || "",
      gradientTo: p.gradientTo || "",
      titleColor: p.titleColor || "",
      textColor: p.textColor || "",
      buttonColor: p.buttonColor || "",
      buttonTextColor: p.buttonTextColor || "",
      badgeColor: p.badgeColor || "",
      badgeTextColor: p.badgeTextColor || "",
      borderColor: p.borderColor || "",
      backgroundColor: p.backgroundColor || "",
      saleStickerBg: extras.saleStickerBg || "",
      saleStickerFg: extras.saleStickerFg || "",
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

  return (
    <section className="oh-admin-ads__form-card">
      <header className="oh-admin-ads__form-card-head">
        <h3 className="oh-admin-ads__form-card-title">الألوان</h3>
        <p className="oh-admin-ads__form-card-hint">اضبط ألوان البانر الأفقي — التخطيط ثابت، الألوان فقط تتغير.</p>
      </header>

      <div className="oh-admin-ads__builder-grid">
        <div className="oh-admin-ads__field oh-admin-ads__field--full">
          <span className="oh-admin-ads__field-label-spaced">اختيار سريع للألوان (اختياري)</span>
          <div className="oh-admin-gradient-quick" role="group" aria-label="اختيار سريع للألوان">
            {QUICK_PRESETS.map((q) => {
              const selected = norm(data.colorPreset) === norm(q.key);
              const p = COLOR_PRESET_DB_PATCH[q.key];
              return (
                <button
                  key={q.key}
                  type="button"
                  className={`oh-admin-gradient-chip${selected ? " oh-admin-gradient-chip--selected" : ""}`}
                  onClick={() => applyQuickPreset(q.key)}
                >
                  <span className="oh-admin-gradient-chip__dots" aria-hidden>
                    <span style={{ background: p?.gradientFrom || "#1e3a8a" }} />
                    <span style={{ background: p?.gradientTo || "#2563eb" }} />
                  </span>
                  <span>{q.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <CompactSwatchRow
          label="لون الخلفية الأول"
          value={data.gradientFrom}
          onChange={(hex) => patch({ gradientFrom: hex })}
          options={MAIN_SIMPLE_SWATCHES}
          allowEmpty
          emptyLabel="بدون"
        />
        <CompactSwatchRow
          label="لون الخلفية الثاني"
          value={data.gradientTo}
          onChange={(hex) => patch({ gradientTo: hex })}
          options={MAIN_SIMPLE_SWATCHES}
          allowEmpty
          emptyLabel="بدون"
        />
        <CompactSwatchRow
          label="لون النص الرئيسي"
          value={data.titleColor}
          onChange={(hex) => patch({ titleColor: hex })}
          options={MAIN_SIMPLE_SWATCHES}
          allowEmpty
          emptyLabel="افتراضي"
        />
        <CompactSwatchRow
          label="لون النص الفرعي"
          value={data.textColor}
          onChange={(hex) => patch({ textColor: hex })}
          options={MAIN_SIMPLE_SWATCHES}
          allowEmpty
          emptyLabel="افتراضي"
        />
        <CompactSwatchRow
          label="لون زر CTA"
          value={data.buttonColor}
          onChange={setButtonColor}
          options={MAIN_SIMPLE_SWATCHES}
          allowEmpty
          emptyLabel="بدون"
        />
        <CompactSwatchRow
          label="لون نص الزر"
          value={data.buttonTextColor}
          onChange={(hex) => patch({ buttonTextColor: hex })}
          options={MAIN_SIMPLE_SWATCHES}
          allowEmpty
          emptyLabel="تلقائي"
        />
        <CompactSwatchRow
          label="لون الشارة"
          value={data.badgeColor}
          onChange={(hex) => patch({ badgeColor: hex })}
          options={MAIN_SIMPLE_SWATCHES}
          allowEmpty
          emptyLabel="افتراضي"
        />
        <CompactSwatchRow
          label="لون نص الشارة"
          value={data.badgeTextColor}
          onChange={(hex) => patch({ badgeTextColor: hex })}
          options={MAIN_SIMPLE_SWATCHES}
          allowEmpty
          emptyLabel="افتراضي"
        />
        <CompactSwatchRow
          label="لون دائرة الخصم"
          value={data.saleStickerBg}
          onChange={(hex) => patch({ saleStickerBg: hex })}
          options={MAIN_SIMPLE_SWATCHES}
          allowEmpty
          emptyLabel="افتراضي"
        />
        <CompactSwatchRow
          label="لون نص دائرة الخصم"
          value={data.saleStickerFg}
          onChange={(hex) => patch({ saleStickerFg: hex })}
          options={MAIN_SIMPLE_SWATCHES}
          allowEmpty
          emptyLabel="افتراضي"
        />
      </div>
    </section>
  );
}
