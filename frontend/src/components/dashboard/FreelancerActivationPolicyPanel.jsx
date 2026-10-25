import { Link } from "react-router-dom";
import { FREELANCER_ORDER_TENDER_POLICY_SECTIONS } from "../../constants/freelancerOrderTenderPolicy";
import { useTranslation } from "../../i18n/LanguageProvider";

export default function FreelancerActivationPolicyPanel() {
  const { t } = useTranslation();
  const sections = FREELANCER_ORDER_TENDER_POLICY_SECTIONS;
  const empty = sections.length === 0;

  return (
    <div className={`oh-activate-terms-panel${empty ? " oh-activate-terms-panel--compact" : ""}`} tabIndex={empty ? undefined : 0}>
      <h4 className="oh-activate-terms__doc-title">{t("freelancerDashboard.activateAccount.kyc.policyTitle")}</h4>
      {empty ? (
        // Detailed policy items are not published yet: point to the platform terms instead of an empty box.
        <p className="oh-activate-terms__para">
          <Link to="/terms-conditions" target="_blank" rel="noopener noreferrer">
            {t("freelancerDashboard.activateAccount.kyc.policyReadTerms")}
          </Link>
        </p>
      ) : (
        sections.map((section) => (
          <details key={section.id} className="oh-activate-policy-section" open>
            <summary className="oh-activate-policy-section__summary">{section.heading}</summary>
            <ol className="oh-activate-policy-list">
              {section.items.map((item) => (
                <li key={item.n} value={item.n} className="oh-activate-policy-list__item">
                  {item.text}
                </li>
              ))}
            </ol>
          </details>
        ))
      )}
    </div>
  );
}
