import { Link } from "react-router-dom";
import {
  PLAN_UPGRADE_DEFAULT_ROUTE,
  buildPlanUpgradeCopy,
  normalizeRequiredTierCode,
} from "../../constants/planUpgradeCta";

/**
 * Compact plan-lock CTA: helper text + plans link (or support-only message).
 * Never triggers claim/receive — Link navigates to plans only.
 */
export default function PlanUpgradeRequiredCta({
  requiredTierCode = null,
  currentTierCode = null,
  reason = null,
  targetRoute = PLAN_UPGRADE_DEFAULT_ROUTE,
  isEn = false,
  suggestedUpgradePlanTitle: _suggestedUpgradePlanTitle = null,
  className = "",
  compact = false,
  mode: modeProp = null,
}) {
  const copy = buildPlanUpgradeCopy({
    requiredTierCode: normalizeRequiredTierCode(requiredTierCode),
    reason,
    isEn,
  });
  const mode = modeProp || copy.mode || "upgrade";
  const isSupport = mode === "support" || !copy.button;
  const shellClass =
    className
    || (compact
      ? "oh-plan-upgrade-cta oh-plan-upgrade-cta--compact"
      : "oh-plan-upgrade-cta oh-plan-upgrade-cta--panel");

  return (
    <div
      className={shellClass}
      data-testid="plan-upgrade-required-cta"
      data-required-tier={copy.requiredTierCode || ""}
      data-reason={reason || ""}
      data-current-tier={currentTierCode || ""}
      data-mode={isSupport ? "support" : "upgrade"}
    >
      <p
        className={
          compact
            ? "oh-plan-upgrade-cta__helper"
            : "oh-plan-upgrade-cta__helper oh-plan-upgrade-cta__helper--panel"
        }
      >
        {copy.headline}
      </p>
      {!isSupport && copy.button ? (
        <Link
          to={targetRoute || PLAN_UPGRADE_DEFAULT_ROUTE}
          className={
            compact
              ? "oh-plan-upgrade-cta__btn"
              : "btn btn-primary oh-plan-upgrade-cta__btn--panel"
          }
          data-testid="plan-upgrade-required-cta-link"
          onClick={(e) => e.stopPropagation()}
        >
          {copy.button}
        </Link>
      ) : null}
    </div>
  );
}
