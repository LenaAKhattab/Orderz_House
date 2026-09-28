/**
 * Hero iPad mini-app navigation (maps to real product areas).
 * @typedef {'layout' | 'layers' | 'plans' | 'orders' | 'user'} HeroIpadNavIcon
 * @typedef {{ id: string; labelKey: string; icon: HeroIpadNavIcon; titleKey: string; descriptionKey: string }} HeroIpadNavItem
 */

/** Same asset as `Navbar.jsx` (`/logo.png` in `frontend/public/`) */
export const HERO_IPAD_LOGO_SRC = "/logo.png";

/** @type {HeroIpadNavItem[]} */
export const HERO_IPAD_NAV = [
  {
    id: "overview",
    labelKey: "home.heroIpad.nav.overview.label",
    icon: "layout",
    titleKey: "home.heroIpad.nav.overview.title",
    descriptionKey: "home.heroIpad.nav.overview.description",
  },
  {
    id: "services",
    labelKey: "home.heroIpad.nav.services.label",
    icon: "layers",
    titleKey: "home.heroIpad.nav.services.title",
    descriptionKey: "home.heroIpad.nav.services.description",
  },
  {
    id: "plans",
    labelKey: "home.heroIpad.nav.plans.label",
    icon: "plans",
    titleKey: "home.heroIpad.nav.plans.title",
    descriptionKey: "home.heroIpad.nav.plans.description",
  },
  {
    id: "orders",
    labelKey: "home.heroIpad.nav.orders.label",
    icon: "orders",
    titleKey: "home.heroIpad.nav.orders.title",
    descriptionKey: "home.heroIpad.nav.orders.description",
  },
  {
    id: "auth",
    labelKey: "home.heroIpad.nav.auth.label",
    icon: "user",
    titleKey: "home.heroIpad.nav.auth.title",
    descriptionKey: "home.heroIpad.nav.auth.description",
  },
];

export const HERO_IPAD_DEFAULT_ID = "overview";

/** @param {HeroIpadNavItem} item @param {(key: string) => string} t */
export function resolveHeroIpadNavItem(item, t) {
  return {
    id: item.id,
    icon: item.icon,
    label: t(item.labelKey),
    title: t(item.titleKey),
    description: t(item.descriptionKey),
  };
}
