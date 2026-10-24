import { orderPublicPlansCategoryTabs } from "../../constants/publicPlansContent";
import { PLANS_CATEGORY } from "../../constants/trainingPlansCatalog";

/**
 * Segmented Training / Membership / Annual category toggle for `/plans`.
 * Training/Membership order follows the admin-configured default section (RTL first / rightmost);
 * Annual Plans is always the third tab. `value` only controls which tab is active — clicks do not reorder.
 */
export default function PlansCategoryToggle({
  value,
  onChange,
  t,
  trainingLabel,
  membershipLabel,
  defaultSection,
  showAnnual = true,
}) {
  const byId = {
    [PLANS_CATEGORY.TRAINING]: {
      id: PLANS_CATEGORY.TRAINING,
      label: String(trainingLabel || "").trim() || t("plans.categories.training"),
    },
    [PLANS_CATEGORY.MEMBERSHIP]: {
      id: PLANS_CATEGORY.MEMBERSHIP,
      label: String(membershipLabel || "").trim() || t("plans.categories.membership"),
    },
    [PLANS_CATEGORY.ANNUAL]: {
      id: PLANS_CATEGORY.ANNUAL,
      label: t("plans.categories.annual"),
    },
  };
  const options = [
    ...orderPublicPlansCategoryTabs(defaultSection),
    ...(showAnnual ? [PLANS_CATEGORY.ANNUAL] : []),
  ].map((id) => byId[id]);

  return (
    <div className="plans-category-toggle" role="tablist" aria-label={t("plans.categories.aria")}>
      <div
        className={[
          "plans-category-toggle__track",
          options.length > 2 ? "plans-category-toggle__track--three" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
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
