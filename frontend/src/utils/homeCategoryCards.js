import heroImage from "../assets/hero.png";

const FALLBACK_CARDS = [
  {
    key: "programming",
    title: "خدمات البرمجة",
    text: "خدمات برمجية احترافية للأعمال، والأبحاث الأكاديمية، والمشاريع المخصصة.",
  },
  {
    key: "design",
    title: "خدمات التصميم",
    text: "خدمات تصميم احترافية للأعمال، والمجال الأكاديمي، والاحتياجات الشخصية.",
  },
  {
    key: "content-writing",
    title: "خدمات كتابة المحتوى",
    text: "خدمات كتابة احترافية للأعمال، الأبحاث الأكاديمية، والاحتياجات الشخصية.",
  },
];

const THEME_BY_SLUG = {
  programming: "sky",
  design: "violet",
  "content-writing": "orange",
};

const THEME_ORDER = ["sky", "violet", "orange"];

export function resolveBackendAssetUrl(maybeUrl) {
  if (!maybeUrl) return "";
  const raw = String(maybeUrl).trim();
  if (!raw) return "";

  const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
  const apiOrigin = (() => {
    try {
      return new URL(base).origin;
    } catch {
      return "";
    }
  })();
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
    return new URL(relative, apiOrigin || base).toString();
  } catch {
    return raw;
  }
}

export function themeForCategoryCard(slug, index) {
  const s = String(slug || "").toLowerCase();
  if (THEME_BY_SLUG[s]) return THEME_BY_SLUG[s];
  return THEME_ORDER[index % THEME_ORDER.length];
}

/**
 * @param {unknown[]} items
 */
export function mapHomeCategoryCards(items = []) {
  const source = items.length > 0 ? items : FALLBACK_CARDS;
  return source.map((c, index) => {
    const slugRaw = c.slug != null ? String(c.slug) : c.key != null ? String(c.key) : "";
    const slug = slugRaw.toLowerCase();
    return {
      key: String(c.slug || c.id || c.key || index),
      slug: slugRaw || String(c.slug || c.key || index),
      theme: themeForCategoryCard(slug, index),
      title: c.name || c.title || "",
      text: c.description || c.text || "",
      imgAlt: c.name || c.title || "تصنيف",
      imgSrc: resolveBackendAssetUrl(c.image_url) || heroImage,
    };
  });
}
