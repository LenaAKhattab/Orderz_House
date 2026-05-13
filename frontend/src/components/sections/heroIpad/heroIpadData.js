/**
 * Hero iPad mini-app navigation (maps to real product areas).
 * @typedef {'layout' | 'layers' | 'plans' | 'orders' | 'user'} HeroIpadNavIcon
 * @typedef {{ id: string; label: string; icon: HeroIpadNavIcon; title: string; description: string }} HeroIpadNavItem
 */

/** Same asset as `Navbar.jsx` (`/logo.png` in `frontend/public/`) */
export const HERO_IPAD_LOGO_SRC = "/logo.png";

/** Matches site copy (e.g. hero badge, AuthFormCard, Footer) */
export const HERO_IPAD_BRAND_AR = "أوردرز هاوس";

/** @type {HeroIpadNavItem[]} */
export const HERO_IPAD_NAV = [
  {
    id: "overview",
    label: "لوحة التحكم",
    icon: "layout",
    title: "لوحة التحكم",
    description: "مؤشرات سريعة وملخص يتغيّر حسب دورك في المنصة.",
  },
  {
    id: "services",
    label: "الخدمات",
    icon: "layers",
    title: "الخدمات",
    description: "تصنيفات الخدمات كما في صفحة الخدمات على الموقع.",
  },
  {
    id: "plans",
    label: "الباقات",
    icon: "plans",
    title: "الباقات",
    description: "باقات اشتراك المستقلين كما في صفحة الباقات.",
  },
  {
    id: "orders",
    label: "الطلبات",
    icon: "orders",
    title: "الطلبات والسوق",
    description: "قائمة طلبات مفتوحة وحالات التنفيذ للمستقلين.",
  },
  {
    id: "auth",
    label: "الدخول",
    icon: "user",
    title: "تسجيل الدخول",
    description: "مسار الدخول وإنشاء الحساب في المنصة.",
  },
];

export const HERO_IPAD_DEFAULT_ID = "overview";
