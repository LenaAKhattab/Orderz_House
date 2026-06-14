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

/** WhatsApp — طلبات خاصة (fixed, not admin-editable for now). */
export const HOME_SPECIAL_REQUESTS_WHATSAPP_URL =
  "https://wa.me/971543266550?text=لاستلام%20طلبك%20بشكل%20مباشر%20لدى%20فريق%20الدعم%20للموقع";

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
    label: "تطوير الواجهة الأمامية",
    type: "sub_subcategory",
    subSubcategoryId: "145",
    slug: "frontend-dev",
    icon: "AppWindow",
  },
  {
    id: "backend-dev",
    label: "تطوير الواجهة الخلفية",
    type: "sub_subcategory",
    subSubcategoryId: "146",
    slug: "backend-dev",
    icon: "Server",
  },
  {
    id: "custom-mobile-apps",
    label: "تطبيقات الجوال",
    type: "sub_subcategory",
    subSubcategoryId: "149",
    slug: "custom-mobile-apps",
    icon: "TabletSmartphone",
  },
  {
    id: "ai",
    label: "الذكاء الاصطناعي",
    type: "sub_subcategory",
    subSubcategoryId: "159",
    slug: "ai",
    icon: "BrainCircuit",
  },
  {
    id: "illustration-design",
    label: "تصميم الجرافيك",
    type: "sub_subcategory",
    subSubcategoryId: "93",
    slug: "illustration-design",
    icon: "PenTool",
  },
  {
    id: "app-ui-design",
    label: "تصميم UI/UX",
    type: "sub_subcategory",
    subSubcategoryId: "79",
    slug: "app-ui-design",
    icon: "LayoutDashboard",
  },
  {
    id: "marketing-campaign",
    label: "التسويق الإلكتروني",
    type: "sub_subcategory",
    subSubcategoryId: "81",
    slug: "marketing-campaign-materials-design",
    icon: "Megaphone",
  },
  {
    id: "website-content-writing",
    label: "كتابة المحتوى",
    type: "sub_subcategory",
    subSubcategoryId: "7",
    slug: "website-content-writing",
    icon: "NotebookPen",
  },
  {
    id: "special-requests",
    label: "طلبات خاصة",
    type: "external",
    href: HOME_SPECIAL_REQUESTS_WHATSAPP_URL,
    icon: "Handshake",
  },
];

export const HOME_FEATURED_SERVICES_COUNT = HOME_FEATURED_SERVICES.length;

export const HOME_FEATURED_ICON_STROKE_WIDTH = 2.25;

export const HOME_FEATURED_ICON_STROKE_WIDTH_MOBILE = 1.85;

export function getHomeFeaturedServiceIcon(item) {
  return HOME_FEATURED_SERVICE_ICON_MAP[item?.icon] || AppWindow;
}

export function getHomeFeaturedServiceHref(item) {
  if (item?.type === "external" && item.href) return item.href;
  const id = String(item?.subSubcategoryId || "").trim();
  if (!id) return "/orders";
  return `/orders?filters=${encodeURIComponent(id)}`;
}

export function isHomeFeaturedServiceExternal(item) {
  return item?.type === "external";
}
