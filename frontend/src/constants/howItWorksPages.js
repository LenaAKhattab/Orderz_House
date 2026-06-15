/** Public routes ↔ database slugs for How it works pages. */
export const HOW_IT_WORKS_PAGES = [
  {
    slug: "how-it-works-freelancer",
    routeKey: "freelancer",
    path: "/how-it-works/freelancer",
    labelKey: "nav.howItWorksFreelancer",
    navLabel: "طريقة العمل كمستقل",
    adminLabel: "طريقة العمل كمستقل",
  },
  {
    slug: "how-it-works-client",
    routeKey: "client",
    path: "/how-it-works/client",
    labelKey: "nav.howItWorksClient",
    navLabel: "طريقة الطلب للعميل",
    adminLabel: "طريقة الطلب للعميل",
  },
];

export const HOW_IT_WORKS_ROUTE_TO_SLUG = Object.fromEntries(
  HOW_IT_WORKS_PAGES.map((p) => [p.routeKey, p.slug]),
);

export const HOW_IT_WORKS_SLUG_TO_PAGE = Object.fromEntries(
  HOW_IT_WORKS_PAGES.map((p) => [p.slug, p]),
);

export const BLOCK_TYPE_LABELS = {
  title: "عنوان",
  text: "نص",
  image: "صورة",
  text_image: "نص + صورة",
};
