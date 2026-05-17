import { BUILDER_STEPS } from "./adBuilderSteps";

/**
 * @param {{ activeStep: number, onStepChange: (n: number) => void }} p
 */
export default function AdBuilderStepNav({ activeStep, onStepChange }) {
  return (
    <nav className="oh-admin-ads__step-nav" aria-label="خطوات بناء الإعلان">
      <div className="oh-admin-ads__step-nav-scroll">
        {BUILDER_STEPS.map((s) => {
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
