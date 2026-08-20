import { Link } from "react-router-dom";
import {
  PLAN_UPGRADE_DEFAULT_ROUTE,
  buildPlanUpgradeCopy,
  normalizeRequiredTierCode,
} from "../../constants/planUpgradeCta";

/**
 * Phase A10 — Reusable upgrade CTA when plan/tier/value eligibility blocks an opportunity.
 */
export default function PlanUpgradeRequiredCta({
  requiredTierCode = null,
  currentTierCode = null,
  reason = null,
  targetRoute = PLAN_UPGRADE_DEFAULT_ROUTE,
  isEn = false,
  suggestedUpgradePlanTitle = null,
  className = "",
  compact = false,
}) {
  const copy = buildPlanUpgradeCopy({
    requiredTierCode: normalizeRequiredTierCode(requiredTierCode),
    reason,
    isEn,
  });
  const availableFrom = copy.requiredTierCode
    ? isEn
      ? `Available from the ${formatTier(copy.requiredTierCode)} plan.`
      : `متاح ابتداءً من خطة ${formatTier(copy.requiredTierCode)}.`
    : suggestedUpgradePlanTitle
      ? isEn
        ? `Suggested plan: ${suggestedUpgradePlanTitle}.`
        : `الباقة المقترحة: ${suggestedUpgradePlanTitle}.`
      : null;

  return (
    <div
      className={
        className
        || "mt-2 rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#d7dce8)] bg-[color:var(--dash-card,#fcfcfd)] p-3"
      }
      data-testid="plan-upgrade-required-cta"
      data-required-tier={copy.requiredTierCode || ""}
      data-reason={reason || ""}
      data-current-tier={currentTierCode || ""}
    >
      <p className="mb-1 text-[0.9rem] font-extrabold text-[color:var(--dash-text,#172033)]">
        {copy.headline}
      </p>
      {!compact ? (
        <p className="mb-2 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
          {copy.action}
        </p>
      ) : null}
      {availableFrom ? (
        <p className="mb-2 text-[0.78rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
          {availableFrom}
        </p>
      ) : null}
      <Link
        to={targetRoute || PLAN_UPGRADE_DEFAULT_ROUTE}
        className="btn btn-primary"
        data-testid="plan-upgrade-required-cta-link"
      >
        {copy.button}
      </Link>
    </div>
  );
}

function formatTier(code) {
  if (code === "silver") return "Silver";
  if (code === "pro") return "Pro";
  if (code === "elite") return "Elite";
  return code;
}
