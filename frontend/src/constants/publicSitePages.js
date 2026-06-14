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
  "enterprise",
  "find-work",
  "community",
  "blog",
];

export function getPublicSitePagePath(slug) {
  if (!slug) return "/";
  return SLUG_TO_PATH[slug] || `/${slug}`;
}
