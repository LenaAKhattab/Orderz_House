import { NavLink } from "react-router-dom";
import { resolveNavLabel } from "../../lib/i18n/resolveNavLabel";
import AdminNavIcon from "./AdminNavIcon";

function navLinkClassName(pathname, item) {
  return ({ isActive }) => {
    const prefixes = [item.matchPrefix, ...(item.alsoMatchPrefixes || [])].filter(Boolean);
    const prefixHit = prefixes.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p),
    );
    const active = isActive || prefixHit;
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
  badges = null,
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
                      <AdminNavIcon name={item.icon} />
                    </span>
                    <span className="oh-sa-navlink__label">{resolveNavLabel(item, t)}</span>
                    {item.badgeKey && badges && Number(badges[item.badgeKey]) > 0 ? (
                      <span
                        className="oh-sa-navlink__badge"
                        aria-label={t("dashboard.whatsappOrders.badgeAria", { count: Number(badges[item.badgeKey]) })}
                      >
                        {Number(badges[item.badgeKey]) > 99 ? "99+" : Number(badges[item.badgeKey])}
                      </span>
                    ) : null}
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
