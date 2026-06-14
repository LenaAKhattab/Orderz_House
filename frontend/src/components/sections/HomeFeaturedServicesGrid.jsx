import { Link } from "react-router-dom";
import {
  getHomeFeaturedServiceHref,
  getHomeFeaturedServiceIcon,
  HOME_FEATURED_ICON_STROKE_WIDTH,
  HOME_FEATURED_SERVICES,
  isHomeFeaturedServiceExternal,
} from "../../constants/homeFeaturedServices";

function FeaturedServiceCell({ item, index, iconSize = 28, iconStrokeWidth = HOME_FEATURED_ICON_STROKE_WIDTH }) {
  const Icon = getHomeFeaturedServiceIcon(item);
  const className = "home-categories-icon-item group";
  const content = (
    <>
      <span className="home-categories-icon-item__icon" aria-hidden>
        <Icon
          size={iconSize}
          strokeWidth={iconStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </span>
      <span className="home-categories-icon-item__label">{item.label}</span>
    </>
  );

  if (isHomeFeaturedServiceExternal(item)) {
    return (
      <a
        href={getHomeFeaturedServiceHref(item)}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        role="listitem"
        style={{ animationDelay: `${index * 24}ms` }}
        aria-label={item.label}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      to={getHomeFeaturedServiceHref(item)}
      className={className}
      role="listitem"
      style={{ animationDelay: `${index * 24}ms` }}
      aria-label={item.label}
    >
      {content}
    </Link>
  );
}

/**
 * Icon-only featured services grid for homepage (9 items).
 * @param {{ className?: string; iconSize?: number; iconStrokeWidth?: number; listLabel?: string }} p
 */
export default function HomeFeaturedServicesGrid({
  className = "home-categories-icon-grid home-categories-icon-grid--featured",
  iconSize = 28,
  iconStrokeWidth = HOME_FEATURED_ICON_STROKE_WIDTH,
  listLabel = "الخدمات المميزة",
}) {
  return (
    <div className={className} role="list" aria-label={listLabel} dir="rtl">
      {HOME_FEATURED_SERVICES.map((item, index) => (
        <FeaturedServiceCell
          key={item.id}
          item={item}
          index={index}
          iconSize={iconSize}
          iconStrokeWidth={iconStrokeWidth}
        />
      ))}
    </div>
  );
}
