/** Canonical public URL for a site page slug (legacy paths preserved). */
const SLUG_TO_PATH = {
  "privacy-policy": "/privacy-policy",
  "terms-conditions": "/terms-conditions",
};

export const PUBLIC_SITE_PAGE_SLUGS = [
  "guarantee",
  "terms-conditions",
  "privacy-policy",
  "help-center",
  "find-work",
  "community",
  "blog",
];

/** Removed public CMS pages — never show in nav/footer even if still present in an old API response. */
export const REMOVED_PUBLIC_SITE_PAGE_SLUGS = new Set(["enterprise"]);

export function isRemovedPublicSitePageSlug(slug) {
  return REMOVED_PUBLIC_SITE_PAGE_SLUGS.has(String(slug || "").trim());
}

export function getPublicSitePagePath(slug) {
  if (!slug) return "/";
  return SLUG_TO_PATH[slug] || `/${slug}`;
}
