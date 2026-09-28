import { applyBannerColorPreset, QUICK_PRESETS } from "./adBannerColorPresets";
import { COLOR_PRESET_DB_PATCH } from "../../components/ads/homeOffersTheme";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

function norm(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

/** @param {{ data: object, onPatch: (p: object) => void, compact?: boolean }} p */
export default function AdBuilderQuickPresets({ data, onPatch, compact = false }) {
  const { t } = useTranslation();

  return (
    <div
      className={`oh-admin-ads__preset-bar${compact ? " oh-admin-ads__preset-bar--compact" : ""}`}
      role="group"
      aria-label={t("ads.form.quickThemeAria")}
    >
      {!compact ? <span className="oh-admin-ads__preset-bar-label">{t("ads.form.quickTheme")}</span> : null}
      <div className="oh-admin-gradient-quick">
        {QUICK_PRESETS.map((q) => {
          const selected = norm(data.colorPreset) === norm(q.key);
          const p = COLOR_PRESET_DB_PATCH[q.key];
          const label = t(`ads.bannerColorPresets.${q.key}`);
          return (
            <button
              key={q.key}
              type="button"
              className={`oh-admin-gradient-chip${selected ? " oh-admin-gradient-chip--selected" : ""}`}
              title={label}
              onClick={() => onPatch(applyBannerColorPreset(data, q.key))}
            >
              <span className="oh-admin-gradient-chip__dots" aria-hidden>
                <span style={{ background: p?.gradientFrom || "#1e3a8a" }} />
                <span style={{ background: p?.gradientTo || "#2563eb" }} />
              </span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
