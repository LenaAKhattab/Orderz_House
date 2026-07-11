/** Maps public site page slugs to footer locale keys (labels are CMS-managed in Arabic). */
const FOOTER_IMPORTANT_LINK_LABEL_KEYS = {
  guarantee: "footer.importantLinks.rightsGuarantee",
  "terms-conditions": "footer.importantLinks.terms",
  "privacy-policy": "footer.importantLinks.privacy",
  "help-center": "footer.importantLinks.helpCenter",
  "find-work": "footer.importantLinks.findWork",
  community: "footer.importantLinks.community",
  blog: "footer.importantLinks.blog",
};

/**
 * @param {{ slug?: string, menuLabel?: string, title?: string }} page
 * @param {(key: string) => string} t
 */
export function getFooterImportantLinkLabel(page, t) {
  const key = page?.slug ? FOOTER_IMPORTANT_LINK_LABEL_KEYS[page.slug] : null;
  if (key) {
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return page?.menuLabel || page?.title || "";
}
