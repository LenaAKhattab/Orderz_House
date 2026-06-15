import {
  AppWindow,
  BrainCircuit,
  Handshake,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  PenTool,
  Server,
  TabletSmartphone,
} from "lucide-react";

/** WhatsApp business number for طلبات خاصة (fixed, not admin-editable for now). */
export const HOME_SPECIAL_REQUESTS_WHATSAPP_PHONE = "971543266550";

const EDIT_WEBSITE_FEATURED_SERVICES_PATH = "/dashboard/super-admin/edit-website/featured-services";

/**
 * Homepage featured services — static config (admin API later).
 * `subSubcategoryId` maps to real DB records for order filtering via `/orders?filters=`.
 */
export const HOME_FEATURED_SERVICES_SECTION = {
  id: "featured-services",
  title: "الخدمات المميزة",
  description: "تعديل الخدمات المعروضة في قسم التصنيفات بالصفحة الرئيسية",
  editLabel: "تعديل القسم",
  path: EDIT_WEBSITE_FEATURED_SERVICES_PATH,
  source: "static",
};

export const HOME_FEATURED_SERVICE_ICON_MAP = {
  AppWindow,
  Server,
  TabletSmartphone,
  BrainCircuit,
  PenTool,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  Handshake,
};

/** Fixed homepage grid: 8 services + طلبات خاصة (last). */
export const HOME_FEATURED_SERVICES = [
  {
    id: "frontend-dev",
    translationKey: "home.featuredServices.frontendDevelopment",
    type: "sub_subcategory",
    subSubcategoryId: "145",
    slug: "frontend-dev",
    icon: "AppWindow",
  },
  {
    id: "backend-dev",
    translationKey: "home.featuredServices.backendDevelopment",
    type: "sub_subcategory",
    subSubcategoryId: "146",
    slug: "backend-dev",
    icon: "Server",
  },
  {
    id: "custom-mobile-apps",
    translationKey: "home.featuredServices.mobileApps",
    type: "sub_subcategory",
    subSubcategoryId: "149",
    slug: "custom-mobile-apps",
    icon: "TabletSmartphone",
  },
  {
    id: "ai",
    translationKey: "home.featuredServices.artificialIntelligence",
    type: "sub_subcategory",
    subSubcategoryId: "159",
    slug: "ai",
    icon: "BrainCircuit",
  },
  {
    id: "illustration-design",
    translationKey: "home.featuredServices.graphicDesign",
    type: "sub_subcategory",
    subSubcategoryId: "93",
    slug: "illustration-design",
    icon: "PenTool",
  },
  {
    id: "app-ui-design",
    translationKey: "home.featuredServices.uiUxDesign",
    type: "sub_subcategory",
    subSubcategoryId: "79",
    slug: "app-ui-design",
    icon: "LayoutDashboard",
  },
  {
    id: "marketing-campaign",
    translationKey: "home.featuredServices.digitalMarketing",
    type: "sub_subcategory",
    subSubcategoryId: "81",
    slug: "marketing-campaign-materials-design",
    icon: "Megaphone",
  },
  {
    id: "website-content-writing",
    translationKey: "home.featuredServices.contentWriting",
    type: "sub_subcategory",
    subSubcategoryId: "7",
    slug: "website-content-writing",
    icon: "NotebookPen",
  },
  {
    id: "special-requests",
    translationKey: "home.featuredServices.specialRequests",
    type: "external",
    icon: "Handshake",
  },
];

export const HOME_FEATURED_SERVICES_COUNT = HOME_FEATURED_SERVICES.length;

export const HOME_FEATURED_ICON_STROKE_WIDTH = 2.25;

export const HOME_FEATURED_ICON_STROKE_WIDTH_MOBILE = 1.85;

export function getHomeFeaturedServiceIcon(item) {
  return HOME_FEATURED_SERVICE_ICON_MAP[item?.icon] || AppWindow;
}

/**
 * @param {string} message - Prefilled WhatsApp message (localized).
 */
export function buildSpecialRequestsWhatsappUrl(message) {
  const text = String(message || "").trim();
  const base = `https://wa.me/${HOME_SPECIAL_REQUESTS_WHATSAPP_PHONE}`;
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

/**
 * @param {object} item
 * @param {{ t?: (key: string) => string }} [options]
 */
export function getHomeFeaturedServiceHref(item, { t } = {}) {
  if (item?.type === "external") {
    const message =
      typeof t === "function"
        ? t("home.featuredServices.specialRequestsWhatsappMessage")
        : "مرحباً، أريد تقديم طلب خاص عبر أوردرز هاوس.";
    return buildSpecialRequestsWhatsappUrl(message);
  }
  const id = String(item?.subSubcategoryId || "").trim();
  if (!id) return "/orders";
  return `/orders?filters=${encodeURIComponent(id)}`;
}

export function isHomeFeaturedServiceExternal(item) {
  return item?.type === "external";
}
