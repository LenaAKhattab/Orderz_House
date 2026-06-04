import { DECISION_FILTERS } from "./planPortfolioActions";

const DECISION_FILTER_OPTIONS = [
  { key: DECISION_FILTERS.all, label: "الكل" },
  { key: DECISION_FILTERS.promote, label: "مرشّحة للترويج" },
  { key: DECISION_FILTERS.review, label: "تحتاج مراجعة" },
  { key: DECISION_FILTERS.high_risk, label: "عالية المخاطر" },
  { key: DECISION_FILTERS.no_subs, label: "بلا اشتراكات" },
  { key: DECISION_FILTERS.top_revenue, label: "الأعلى قيمة مدفوعة" },
  { key: DECISION_FILTERS.top_usage, label: "الأكثر اشتراكات سارية" },
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
  return (
    <div className="oh-sapl-action-center">
      {summarySentence ? (
        <p className="oh-sapl-action-center__summary" role="status">
          {summarySentence}
        </p>
      ) : null}

      {chips.length > 0 ? (
        <div className="oh-sapl-action-center__strip" aria-label="ما يحتاج قراراً">
          <span className="oh-sapl-action-center__strip-title">ما يحتاج قراراً</span>
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

      <div className="oh-sapl-action-center__filters" role="group" aria-label="تصفية القرارات">
        {DECISION_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`oh-sapl-decision-filter${decisionFilter === opt.key ? " oh-sapl-decision-filter--active" : ""}`}
            disabled={disabled}
            onClick={() => onDecisionFilterChange(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
