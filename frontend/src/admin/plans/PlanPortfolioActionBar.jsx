import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/planAdminResources";
import { DECISION_FILTERS } from "./planPortfolioActions";

const DECISION_FILTER_KEYS = [
  { key: DECISION_FILTERS.all, labelKey: "planAdmin.metrics.portfolio.filters.all" },
  { key: DECISION_FILTERS.promote, labelKey: "planAdmin.metrics.portfolio.filters.promote" },
  { key: DECISION_FILTERS.review, labelKey: "planAdmin.metrics.portfolio.filters.review" },
  { key: DECISION_FILTERS.high_risk, labelKey: "planAdmin.metrics.portfolio.filters.high_risk" },
  { key: DECISION_FILTERS.no_subs, labelKey: "planAdmin.metrics.portfolio.filters.no_subs" },
  { key: DECISION_FILTERS.top_revenue, labelKey: "planAdmin.metrics.portfolio.filters.top_revenue" },
  { key: DECISION_FILTERS.top_usage, labelKey: "planAdmin.metrics.portfolio.filters.top_usage" },
];

/**
 * @param {{
 *   chips: Array<{ key: string; label: string; count: number }>;
 *   summarySentence: string | null;
 *   decisionFilter: string;
 *   onDecisionFilterChange: (key: string) => void;
 *   onChipClick: (key: string) => void;
 *   disabled?: boolean;
 * }} props
 */
export default function PlanPortfolioActionBar({
  chips,
  summarySentence,
  decisionFilter,
  onDecisionFilterChange,
  onChipClick,
  disabled = false,
}) {
  const { t } = useTranslation();

  return (
    <div className="oh-sapl-action-center">
      {summarySentence ? (
        <p className="oh-sapl-action-center__summary" role="status">
          {summarySentence}
        </p>
      ) : null}

      {chips.length > 0 ? (
        <div className="oh-sapl-action-center__strip" aria-label={t("planAdmin.metrics.portfolio.stripTitle")}>
          <span className="oh-sapl-action-center__strip-title">
            {t("planAdmin.metrics.portfolio.stripTitle")}
          </span>
          <div className="oh-sapl-action-center__chips">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`oh-sapl-action-chip${decisionFilter === chip.key ? " oh-sapl-action-chip--active" : ""}`}
                disabled={disabled}
                onClick={() => onChipClick(chip.key)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="oh-sapl-action-center__filters" role="group" aria-label={t("planAdmin.metrics.portfolio.filtersAria")}>
        {DECISION_FILTER_KEYS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`oh-sapl-decision-filter${decisionFilter === opt.key ? " oh-sapl-decision-filter--active" : ""}`}
            disabled={disabled}
            onClick={() => onDecisionFilterChange(opt.key)}
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
