import {
  FREELANCER_ORDER_TENDER_POLICY_SECTIONS,
  FREELANCER_ORDER_TENDER_POLICY_TITLE,
} from "../../constants/freelancerOrderTenderPolicy";

export default function FreelancerActivationPolicyPanel() {
  const sections = FREELANCER_ORDER_TENDER_POLICY_SECTIONS;

  return (
    <div className="oh-activate-terms-panel" tabIndex={0}>
      <h4 className="oh-activate-terms__doc-title">{FREELANCER_ORDER_TENDER_POLICY_TITLE}</h4>
      {sections.length === 0 ? (
        <p className="oh-activate-terms__para">{FREELANCER_ORDER_TENDER_POLICY_TITLE}</p>
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
