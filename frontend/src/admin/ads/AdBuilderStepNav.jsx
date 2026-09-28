import { useMemo } from "react";
import { getBuilderSteps } from "./adBuilderSteps";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

/**
 * @param {{ activeStep: number, onStepChange: (n: number) => void }} p
 */
export default function AdBuilderStepNav({ activeStep, onStepChange }) {
  const { t } = useTranslation();
  const steps = useMemo(() => getBuilderSteps(t), [t]);

  return (
    <nav className="oh-admin-ads__step-nav" aria-label={t("ads.builderSteps.navAria")}>
      <div className="oh-admin-ads__step-nav-scroll">
        {steps.map((s) => {
          const active = activeStep === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={`oh-admin-ads__step-tab${active ? " oh-admin-ads__step-tab--active" : ""}`}
              aria-current={active ? "step" : undefined}
              onClick={() => onStepChange(s.id)}
            >
              <span className="oh-admin-ads__step-tab-num" aria-hidden>
                {s.short}
              </span>
              <span className="oh-admin-ads__step-tab-label">{s.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
