import { PLANS_CATEGORY } from "../../constants/trainingPlansCatalog";

/**
 * Segmented Training / Membership category toggle for public `/plans`.
 */
export default function PlansCategoryToggle({ value, onChange, t }) {
  const options = [
    { id: PLANS_CATEGORY.TRAINING, label: t("plans.categories.training") },
    { id: PLANS_CATEGORY.MEMBERSHIP, label: t("plans.categories.membership") },
  ];

  return (
    <div className="plans-category-toggle" role="tablist" aria-label={t("plans.categories.aria")}>
      <div className="plans-category-toggle__track">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              id={`plans-tab-${opt.id}`}
              aria-selected={active}
              aria-controls={`plans-panel-${opt.id}`}
              tabIndex={active ? 0 : -1}
              className={[
                "plans-category-toggle__btn",
                active ? "plans-category-toggle__btn--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onChange?.(opt.id)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const idx = options.findIndex((o) => o.id === value);
                const dir = event.key === "ArrowRight" ? 1 : -1;
                // In RTL, left/right feel mirrored; keep physical key mapping simple and predictable.
                const next = options[(idx + dir + options.length) % options.length];
                onChange?.(next.id);
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
