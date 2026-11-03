import heroImage from "../assets/hero.png";
import specialRequestsImage from "../assets/categories/special-requests.png";
import { getApiAssetOrigin, getApiBaseUrl } from "../config/apiBase";
import { localeFromEnFlag, pt } from "../i18n/activeLocale.js";
import { isNewLocale } from "../i18n/systemContent.js";
import { getLocalizedField } from "../lib/i18n/getLocalizedField.js";

const SPECIAL_REQUESTS_WHATSAPP_URL =
  "https://wa.me/971543266550?text=لاستلام%20طلبك%20بشكل%20مباشر%20لدى%20فريق%20الدعم%20للموقع";

const HC = "platformUtils.homeCategories";

/** Built-in cards when the API returns no categories (copy from the catalog, keyed by slug). */
function fallbackCards(locale) {
  const copy = (key) => pt(`${HC}.fallback.${key}`, undefined, locale);
  return [
    {
      key: "programming",
      title: copy("programming.title"),
      text: copy("programming.text"),
    },
    {
      key: "design",
      title: copy("design.title"),
      text: copy("design.text"),
    },
    {
      key: "content-writing",
      title: copy("contentWriting.title"),
      text: copy("contentWriting.text"),
    },
    {
      key: "special-requests",
      title: copy("specialRequests.title"),
      text: copy("specialRequests.text"),
      card_action: "external",
      external_url: SPECIAL_REQUESTS_WHATSAPP_URL,
      button_label: copy("specialRequests.button"),
    },
  ];
}

const THEME_BY_SLUG = {
  programming: "sky",
  design: "violet",
  "content-writing": "orange",
  "special-requests": "sky",
};

const THEME_ORDER = ["sky", "violet", "orange"];

export const THEME_CLASSES = {
  sky: {
    chip: "bg-sky-100 text-sky-800 ring-2 ring-sky-200/55",
    btn: "bg-sky-100 text-sky-900 hover:bg-sky-200/90 border border-sky-200/60",
  },
  violet: {
    chip: "bg-violet-100 text-violet-800 ring-2 ring-violet-200/55",
    btn: "bg-violet-100 text-violet-900 hover:bg-violet-200/90 border border-violet-200/60",
  },
  orange: {
    chip: "bg-orange-100 text-orange-900 ring-2 ring-orange-200/55",
    btn: "bg-orange-100 text-orange-950 hover:bg-orange-200/90 border border-orange-200/60",
  },
};

export function resolveBackendAssetUrl(maybeUrl) {
  if (!maybeUrl) return "";
  const raw = String(maybeUrl).trim();
  if (!raw) return "";

  if (raw.startsWith("/assets/")) {
    return raw;
  }

  const base = getApiBaseUrl();
  const apiOrigin = getApiAssetOrigin();
  const isLocalHost = (host) => ["localhost", "127.0.0.1", "::1"].includes(String(host || "").toLowerCase());

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (apiOrigin && isLocalHost(parsed.hostname)) {
        return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, apiOrigin).toString();
      }
      return parsed.toString();
    } catch {
      return raw;
    }
  }

  try {
    const relative = raw.startsWith("/") ? raw : `/${raw}`;
    if (apiOrigin) {
      return new URL(relative, apiOrigin).toString();
    }
    // Relative API base without window (SSR/tests): keep path as-is when already absolute path.
    if (relative.startsWith("/")) return relative;
    return `${base}/${relative}`.replace(/\/{2,}/g, "/");
  } catch {
    return raw;
  }
}

export function themeForCategoryCard(slug, index) {
  const s = String(slug || "").toLowerCase();
  if (THEME_BY_SLUG[s]) return THEME_BY_SLUG[s];
  return THEME_ORDER[index % THEME_ORDER.length];
}

function isExternalHomeCategory(item) {
  const action = String(item?.card_action || "").toLowerCase();
  const externalUrl = String(item?.external_url || "").trim();
  return action === "external" && externalUrl.length > 0;
}

function fallbackImageForSlug(slug) {
  if (String(slug || "").toLowerCase() === "special-requests") {
    return specialRequestsImage;
  }
  return heroImage;
}

/**
 * @param {unknown[]} items
 * @param {string} [locale] Arabic unless given; follows German / Dutch / Romanian UIs (category name /
 *   description are system content: translated through getLocalizedField for those locales).
 */
export function mapHomeCategoryCards(items = [], locale = localeFromEnFlag(false)) {
  const source = items.length > 0 ? items : fallbackCards(locale);
  const newLocale = isNewLocale(locale);
  return source.map((c, index) => {
    const slugRaw = c.slug != null ? String(c.slug) : c.key != null ? String(c.key) : "";
    const slug = slugRaw.toLowerCase();
    const external = isExternalHomeCategory(c);
    const resolvedImage = resolveBackendAssetUrl(c.image_url) || fallbackImageForSlug(slug);
    const name = (newLocale && getLocalizedField(c, "name", locale)) || c.name || c.title || "";
    const description = (newLocale && getLocalizedField(c, "description", locale)) || c.description || c.text || "";
    return {
      key: String(c.slug || c.id || c.key || index),
      slug: slugRaw || String(c.slug || c.key || index),
      theme: themeForCategoryCard(slug, index),
      title: name,
      text: description,
      imgAlt: name || pt(`${HC}.imageAlt`, undefined, locale),
      imgSrc: resolvedImage,
      isExternal: external,
      href: external ? String(c.external_url).trim() : "/services",
      buttonLabel: c.button_label || pt(`${HC}.exploreServices`, undefined, locale),
    };
  });
}

/** @param {unknown[]} items */
export function filterHomepageCategories(items = []) {
  return items.filter((item) => item?.show_on_homepage !== false);
}

/** @param {unknown[]} items */
export function filterServiceCategories(items = []) {
  return items.filter((item) => item?.is_service_category !== false && !isExternalHomeCategory(item));
}
