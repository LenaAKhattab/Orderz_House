import { NavLink } from "react-router-dom";
import { resolveNavLabel } from "../../lib/i18n/resolveNavLabel";

function navLinkClassName(pathname, item) {
  return ({ isActive }) => {
    const prefix = item.matchPrefix && pathname.startsWith(item.matchPrefix);
    const active = isActive || prefix;
    return `oh-sa-navlink${active ? " oh-sa-navlink--active" : ""}`.trim();
  };
}

/**
 * Grouped admin/super-admin sidebar sections (visual labels only — not clickable).
 */
export default function AdminGroupedNavList({
  sections,
  pathname,
  t,
  onNavigate,
  renderSectionExtra,
}) {
  return (
    <>
      {sections.map((section) => {
        const extra = renderSectionExtra?.(section);
        if (!section.items?.length && !extra) return null;

        return (
          <div key={section.id} className="oh-sa-nav__group">
            <p className="oh-sa-nav__section-title">{t(section.labelKey)}</p>
            <ul className="oh-sa-nav__list">
              {(section.items || []).map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={Boolean(item.end)}
                    className={navLinkClassName(pathname, item)}
                    onClick={onNavigate}
                  >
                    <span className="oh-sa-navlink__icon" aria-hidden>
                      {item.icon}
                    </span>
                    <span className="oh-sa-navlink__label">{resolveNavLabel(item, t)}</span>
                  </NavLink>
                </li>
              ))}
              {extra}
            </ul>
          </div>
        );
      })}
    </>
  );
}
