import { useMemo, useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { getPeriodPresets } from "./dashboardDateRange";
import "./registerAnalysisLocale";

export default function DashboardDateFilterBar({ period, onChange, disabled = false }) {
  const { t, dir } = useTranslation();
  const [showCustom, setShowCustom] = useState(period?.preset === "custom");
  const presets = useMemo(() => getPeriodPresets(t), [t]);
  const periodLabel = period?.labelKey ? t(period.labelKey) : "";

  const handlePreset = (id) => {
    if (id === "custom") {
      setShowCustom(true);
      onChange({ preset: "custom", customFrom: period?.customFrom, customTo: period?.customTo });
      return;
    }
    setShowCustom(false);
    onChange({ preset: id });
  };

  return (
    <div
      className="sa-date-filter sa-date-filter--control"
      dir={dir}
      role="group"
      aria-label={t("analysis.dateFilter.ariaLabel")}
    >
      <div className="sa-date-filter__row">
        <div className="sa-date-filter__head">
          <p className="sa-date-filter__module-title m-0">{t("analysis.dateFilter.title")}</p>
          <p className="sa-date-filter__module-desc m-0">{t("analysis.dateFilter.desc")}</p>
        </div>
        <p className="sa-date-filter__current m-0" role="status">
          <span className="sa-date-filter__current-label">{t("analysis.dateFilter.currentLabel")}</span>{" "}
          <strong>{periodLabel}</strong>
          {period?.posthogLimited ? (
            <span className="sa-date-filter__note">{t("analysis.dateFilter.activityLimitNote")}</span>
          ) : null}
        </p>
      </div>
      <div className="sa-date-filter__controls">
        <div className="sa-date-filter__presets">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`sa-date-filter__btn${period?.preset === p.id ? " sa-date-filter__btn--active" : ""}`}
              disabled={disabled}
              onClick={() => handlePreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {showCustom || period?.preset === "custom" ? (
          <div className="sa-date-filter__custom">
            <label className="sa-date-filter__field">
              <span>{t("analysis.dateFilter.from")}</span>
              <input
                type="date"
                dir="ltr"
                value={period?.customFrom || ""}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ preset: "custom", customFrom: e.target.value, customTo: period?.customTo })
                }
              />
            </label>
            <label className="sa-date-filter__field">
              <span>{t("analysis.dateFilter.to")}</span>
              <input
                type="date"
                dir="ltr"
                value={period?.customTo || ""}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ preset: "custom", customFrom: period?.customFrom, customTo: e.target.value })
                }
              />
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}
