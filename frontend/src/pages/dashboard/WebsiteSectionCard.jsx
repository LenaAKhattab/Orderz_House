import { Link } from "react-router-dom";
import { ChevronLeft, CircleHelp, FileText, PanelBottom, SquarePen, Workflow } from "lucide-react";

const SECTION_ICONS = {
  faq: CircleHelp,
  "how-it-works": Workflow,
  "site-pages": FileText,
  footer: PanelBottom,
};

/**
 * @param {object} p
 * @param {string} p.id
 * @param {string} p.title
 * @param {string} p.description
 * @param {string} p.editLabel
 * @param {string} p.path
 */
export default function WebsiteSectionCard({
  id,
  title,
  description,
  editLabel,
  path,
}) {
  const Icon = SECTION_ICONS[id] || CircleHelp;

  return (
    <article className="oh-website-section-card">
      <div className="oh-website-section-card__top">
        <div className="oh-website-section-card__icon-wrap" aria-hidden>
          <Icon className="oh-website-section-card__icon-svg" strokeWidth={1.75} />
        </div>
        <div className="oh-website-section-card__head">
          <h3 className="oh-website-section-card__title">{title}</h3>
        </div>
      </div>

      <p className="oh-website-section-card__desc">{description}</p>

      <div className="oh-website-section-card__actions">
        <Link to={path} className="btn btn-primary oh-website-section-card__btn">
          <span className="oh-website-section-card__btn-label">
            <SquarePen className="oh-website-section-card__btn-icon" size={16} strokeWidth={2} aria-hidden />
            <span>{editLabel}</span>
          </span>
          <ChevronLeft className="oh-website-section-card__btn-arrow" size={16} strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </article>
  );
}
