/** Backend role strings (must match API JWT `role`). */
export const ROLE = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  FREELANCER: "freelancer",
  CLIENT: "client",
  FINANCIAL_USER: "financial_user",
};

/** يُطلق بعد إنشاء طلب داخلي من النافذة لتحديث صفحة «الطلبات الداخلية» حتى لو بقي نفس المسار في React Router. */
export const INTERNAL_ORDERS_LIST_REFRESH = "orderz:internal-orders-refresh";

/** One dashboard URL per role — used for redirects and navbar. */
export const DASHBOARD_PATH = {
  [ROLE.SUPER_ADMIN]: "/dashboard/super-admin",
  [ROLE.ADMIN]: "/dashboard/admin",
  [ROLE.FREELANCER]: "/dashboard/freelancer",
  [ROLE.CLIENT]: "/dashboard/client",
  [ROLE.FINANCIAL_USER]: "/dashboard/my-bonuses",
};

export const DASHBOARD_TITLE = {
  [DASHBOARD_PATH[ROLE.SUPER_ADMIN]]: "لوحة المدير الأعلى",
  [DASHBOARD_PATH[ROLE.ADMIN]]: "لوحة الإدارة",
  [DASHBOARD_PATH[ROLE.FREELANCER]]: "لوحة المستقل",
  [DASHBOARD_PATH[ROLE.CLIENT]]: "لوحة العميل",
  [DASHBOARD_PATH[ROLE.FINANCIAL_USER]]: "بونصاتي",
  "/dashboard/my-bonuses": "بونصاتي",
  "/dashboard/client/my-orders": "طلباتي",
  "/dashboard/client/my_orders": "طلباتي",
  "/dashboard/client/financial": "المالية",
  "/dashboard/client/feedback": "المشاكل والاقتراحات",
  "/dashboard/client/orders": "معرض الطلبات",
  "/dashboard/super-admin/plans": "إدارة الباقات",
  "/dashboard/super-admin/marketplace-plans": "إدارة باقات العمل",
  "/dashboard/super-admin/training-packages": "باقات التدريب",
  "/dashboard/super-admin/marketplace-economy": "إعدادات اقتصاد العمل",
  "/dashboard/super-admin/marketplace-articles": "مقالات السوق",
  "/dashboard/super-admin/bid-credits": "رصيد المناقصات",
  "/dashboard/super-admin/onboarding": "مركز البداية",
  "/dashboard/super-admin/financial-center": "المركز المالي",
  "/dashboard/super-admin/pantry": "بيت المونة",
  "/dashboard/admin/pantry": "بيت المونة",
  "/dashboard/super-admin/subscriptions": "اشتراكات المستقلين",
  "/dashboard/super-admin/subscriptions/activation": "تفعيل الاشتراكات",
  "/dashboard/super-admin/financial-claims": "المطالبات المالية",
  "/dashboard/super-admin/feedback": "المشاكل والاقتراحات",
  "/dashboard/admin/subscriptions": "تفعيل الاشتراكات",
  "/dashboard/admin/courses": "إدارة الدورات",
  "/dashboard/admin/ads": "إدارة الإعلانات",
  "/dashboard/freelancer/my-orders": "طلباتي",
  "/dashboard/freelancer/orders": "الطلبات",
  "/dashboard/freelancer/financial-claims": "المطالبات المالية",
  "/dashboard/freelancer/feedback": "المشاكل والاقتراحات",
  "/dashboard/freelancer/plans": "الباقات",
  "/dashboard/freelancer/courses": "الدورات التدريبية",
  "/dashboard/freelancer/getting-started": "مركز البداية",
  "/dashboard/freelancer/articles": "المقالات",
  "/dashboard/super-admin/notifications": "الإشعارات",
  "/dashboard/super-admin/courses": "إدارة الدورات",
  "/dashboard/super-admin/ads": "الإعلانات",
  "/dashboard/super-admin/training-orders": "الطلبات التجريبية",
  "/dashboard/super-admin/training-orders/settings": "إعدادات الطلبات التجريبية",
  "/dashboard/super-admin/training-orders/templates": "مخزون الطلبات التجريبية",
  "/dashboard/super-admin/training-orders/rounds": "جولات الطلبات التجريبية",
  "/dashboard/super-admin/training-orders/applications": "متقدمو الطلبات التجريبية",
  "/dashboard/admin/notifications": "الإشعارات",
  "/dashboard/admin/orders": "الطلبات الداخلية",
  "/dashboard/client/notifications": "الإشعارات",
  "/dashboard/freelancer/notifications": "الإشعارات",
  "/dashboard/freelancer/settings": "إعدادات الحساب",
  "/dashboard/client/profile": "الملف الشخصي",
  "/dashboard/client/settings": "إعدادات الحساب",
  "/dashboard/admin/settings": "إعدادات الحساب",
  "/dashboard/super-admin/settings": "إعدادات الحساب",
  "/dashboard/super-admin/admins": "إدارة الأدمن",
  "/dashboard/super-admin/edit-website": "تعديل الموقع",
  "/dashboard/super-admin/edit-website/faq": "الأسئلة الشائعة",
  "/dashboard/super-admin/edit-website/how-it-works": "طريقة العمل",
  "/dashboard/super-admin/edit-website/pages": "الصفحات العامة",
  "/dashboard/super-admin/edit-website/footer": "تعديل تذييل الموقع",
  "/dashboard/super-admin/edit-website/footer/contact": "تواصل معنا",
  "/dashboard/super-admin/edit-website/footer/working-hours": "ساعات العمل",
  "/dashboard/super-admin/edit-website/footer/app-downloads": "تحميل التطبيق",
  "/dashboard/super-admin/edit-website/footer/contact-center": "مركز التواصل",
  "/dashboard/super-admin/edit-website/footer-app-downloads": "تحميل التطبيق",
  "/how-it-works/freelancer": "طريقة العمل كمستقل",
  "/how-it-works/client": "طريقة الطلب للعميل",
  "/dashboard/admin/orders": "الطلبات الداخلية",
  "/dashboard/admin/orders/create": "إنشاء طلب داخلي",
};

/** i18n keys for dashboard route titles (layout chrome). */
export const DASHBOARD_TITLE_KEYS = {
  [DASHBOARD_PATH[ROLE.SUPER_ADMIN]]: "dashboard.titles.superAdminPanel",
  [DASHBOARD_PATH[ROLE.ADMIN]]: "dashboard.titles.adminPanel",
  [DASHBOARD_PATH[ROLE.FREELANCER]]: "dashboard.titles.freelancerPanel",
  [DASHBOARD_PATH[ROLE.CLIENT]]: "dashboard.titles.clientPanel",
  [DASHBOARD_PATH[ROLE.FINANCIAL_USER]]: "dashboard.titles.financialUserPanel",
  "/dashboard/my-bonuses": "dashboard.financialUser.myBonuses",
  "/dashboard/client/my-orders": "dashboard.breadcrumbs.myRequests",
  "/dashboard/client/my_orders": "dashboard.breadcrumbs.myRequests",
  "/dashboard/client/financial": "dashboard.breadcrumbs.finance",
  "/dashboard/client/feedback": "dashboard.breadcrumbs.problemsSuggestions",
  "/dashboard/client/orders": "dashboard.nav.client.requestMarketplace",
  "/dashboard/super-admin/plans": "dashboard.breadcrumbs.managePlans",
  "/dashboard/super-admin/marketplace-plans": "dashboard.breadcrumbs.marketplacePlans",
  "/dashboard/super-admin/training-packages": "dashboard.breadcrumbs.managePlans",
  "/dashboard/super-admin/marketplace-economy": "dashboard.breadcrumbs.marketplaceEconomy",
  "/dashboard/super-admin/marketplace-articles": "dashboard.breadcrumbs.marketplaceArticles",
  "/dashboard/super-admin/bid-credits": "dashboard.breadcrumbs.bidCredits",
  "/dashboard/super-admin/onboarding": "dashboard.breadcrumbs.onboarding",
  "/dashboard/super-admin/financial-center": "dashboard.breadcrumbs.financialCenter",
  "/dashboard/super-admin/pantry": "dashboard.nav.superAdmin.pantry",
  "/dashboard/admin/pantry": "dashboard.nav.superAdmin.pantry",
  "/dashboard/super-admin/subscriptions": "dashboard.breadcrumbs.freelancerSubscriptions",
  "/dashboard/super-admin/subscriptions/activation": "dashboard.breadcrumbs.subscriptionActivation",
  "/dashboard/super-admin/financial-claims": "dashboard.breadcrumbs.financialClaims",
  "/dashboard/super-admin/feedback": "dashboard.breadcrumbs.problemsSuggestions",
  "/dashboard/admin/subscriptions": "dashboard.breadcrumbs.subscriptionActivation",
  "/dashboard/admin/courses": "dashboard.breadcrumbs.manageCourses",
  "/dashboard/admin/ads": "dashboard.breadcrumbs.manageAds",
  "/dashboard/freelancer/my-orders": "dashboard.breadcrumbs.myRequests",
  "/dashboard/freelancer/orders": "dashboard.breadcrumbs.orders",
  "/dashboard/freelancer/financial-claims": "dashboard.breadcrumbs.financialClaims",
  "/dashboard/freelancer/feedback": "dashboard.breadcrumbs.problemsSuggestions",
  "/dashboard/freelancer/plans": "dashboard.breadcrumbs.plans",
  "/dashboard/freelancer/courses": "dashboard.breadcrumbs.trainingCourses",
  "/dashboard/freelancer/getting-started": "dashboard.nav.freelancer.gettingStarted",
  "/dashboard/freelancer/articles": "dashboard.nav.freelancer.articles",
  "/dashboard/super-admin/notifications": "dashboard.breadcrumbs.notifications",
  "/dashboard/super-admin/courses": "dashboard.breadcrumbs.manageCourses",
  "/dashboard/super-admin/ads": "dashboard.breadcrumbs.ads",
  "/dashboard/super-admin/training-orders": "dashboard.breadcrumbs.trainingRequests",
  "/dashboard/super-admin/training-orders/settings": "dashboard.breadcrumbs.trainingSettings",
  "/dashboard/super-admin/training-orders/templates": "dashboard.breadcrumbs.trainingPool",
  "/dashboard/super-admin/training-orders/rounds": "dashboard.breadcrumbs.trainingStatusRounds",
  "/dashboard/super-admin/training-orders/applications": "dashboard.breadcrumbs.trainingApplications",
  "/dashboard/admin/notifications": "dashboard.breadcrumbs.notifications",
  "/dashboard/admin/orders": "dashboard.breadcrumbs.internalRequests",
  "/dashboard/client/notifications": "dashboard.breadcrumbs.notifications",
  "/dashboard/freelancer/notifications": "dashboard.breadcrumbs.notifications",
  "/dashboard/freelancer/settings": "dashboard.breadcrumbs.accountSettings",
  "/dashboard/client/profile": "dashboard.breadcrumbs.profile",
  "/dashboard/client/settings": "dashboard.breadcrumbs.accountSettings",
  "/dashboard/admin/settings": "dashboard.breadcrumbs.accountSettings",
  "/dashboard/super-admin/settings": "dashboard.breadcrumbs.accountSettings",
  "/dashboard/super-admin/admins": "dashboard.breadcrumbs.admins",
  "/dashboard/super-admin/edit-website": "dashboard.breadcrumbs.editWebsite",
  "/dashboard/super-admin/edit-website/faq": "dashboard.breadcrumbs.faq",
  "/dashboard/super-admin/edit-website/how-it-works": "dashboard.breadcrumbs.howItWorks",
  "/dashboard/super-admin/edit-website/pages": "dashboard.breadcrumbs.websitePages",
  "/dashboard/super-admin/edit-website/footer": "dashboard.breadcrumbs.editFooter",
  "/dashboard/super-admin/edit-website/footer/contact": "dashboard.breadcrumbs.footerContact",
  "/dashboard/super-admin/edit-website/footer/working-hours": "dashboard.breadcrumbs.footerWorkingHours",
  "/dashboard/super-admin/edit-website/footer/app-downloads": "dashboard.breadcrumbs.footerAppDownloads",
  "/dashboard/super-admin/edit-website/footer/contact-center": "dashboard.breadcrumbs.footerContactCenter",
  "/dashboard/super-admin/edit-website/footer-app-downloads": "dashboard.breadcrumbs.footerAppDownloads",
  "/how-it-works/freelancer": "dashboard.breadcrumbs.howItWorksFreelancer",
  "/how-it-works/client": "dashboard.breadcrumbs.howItWorksClient",
  "/dashboard/admin/orders/create": "dashboard.breadcrumbs.createInternalRequest",
};

/**
 * @param {string} pathname
 * @param {(key: string) => string} t
 * @returns {string}
 */
export function getDashboardTitle(pathname, t) {
  const key = DASHBOARD_TITLE_KEYS[pathname];
  if (key) return t(key);
  if (String(pathname || "").startsWith("/dashboard/super-admin/financial-center/")) {
    return t("dashboard.breadcrumbs.financialCenter");
  }
  return t("dashboard.titles.default");
}

/**
 * @param {string} role
 * @returns {string}
 */
export function getDashboardPath(role) {
  const path = DASHBOARD_PATH[role];
  return path || "/unauthorized";
}

/** Alias — same as getDashboardPath; use for redirects from "/" and logo targets. */
export function getDashboardPathByRole(role) {
  return getDashboardPath(role);
}

export function getNotificationsPath(role) {
  if (role === ROLE.SUPER_ADMIN) return "/dashboard/super-admin/notifications";
  if (role === ROLE.ADMIN) return "/dashboard/admin/notifications";
  if (role === ROLE.CLIENT) return "/dashboard/client/notifications";
  if (role === ROLE.FREELANCER) return "/dashboard/freelancer/notifications";
  if (role === ROLE.FINANCIAL_USER) return "/dashboard/my-bonuses";
  return "/dashboard";
}

/** Profile page URL — freelancers and clients only. */
export function getProfilePagePath(role) {
  if (role === ROLE.CLIENT) return "/dashboard/client/profile";
  return null;
}

/** Account settings URL per role. */
export function getAccountSettingsPath(role) {
  if (role === ROLE.SUPER_ADMIN) return "/dashboard/super-admin/settings";
  if (role === ROLE.ADMIN) return "/dashboard/admin/settings";
  if (role === ROLE.FREELANCER) return "/dashboard/freelancer/settings";
  if (role === ROLE.CLIENT) return "/dashboard/client/settings";
  return "/dashboard";
}

/**
 * @param {string} pathname
 */
export function isDashboardPath(pathname) {
  return pathname.startsWith("/dashboard");
}

const STAFF_DASHBOARD_ROLES = [ROLE.SUPER_ADMIN, ROLE.ADMIN];

/** Which role may open which dashboard URL (exact path). Permission checks apply separately in route guards. */
const DASHBOARD_PATH_TO_ROLES = {
  [DASHBOARD_PATH[ROLE.SUPER_ADMIN]]: STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/plans": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/marketplace-plans": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/training-packages": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/marketplace-economy": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/marketplace-articles": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/bid-credits": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/onboarding": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/financial-center": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/pantry": STAFF_DASHBOARD_ROLES,
  "/dashboard/admin/pantry": [ROLE.ADMIN],
  "/dashboard/super-admin/subscriptions": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/subscriptions/activation": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/financial-claims": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/feedback": [ROLE.SUPER_ADMIN],
  [DASHBOARD_PATH[ROLE.ADMIN]]: [ROLE.ADMIN],
  "/dashboard/admin/subscriptions": [ROLE.ADMIN],
  "/dashboard/admin/courses": [ROLE.ADMIN],
  "/dashboard/admin/ads": [ROLE.ADMIN],
  "/dashboard/admin/notifications": [ROLE.ADMIN],
  "/dashboard/admin/settings": [ROLE.ADMIN],
  [DASHBOARD_PATH[ROLE.FREELANCER]]: [ROLE.FREELANCER],
  [DASHBOARD_PATH[ROLE.CLIENT]]: [ROLE.CLIENT],
  "/dashboard/my-bonuses": [ROLE.FINANCIAL_USER],
  "/dashboard/financial-user": [ROLE.FINANCIAL_USER],
  "/dashboard/client/my-orders": [ROLE.CLIENT],
  "/dashboard/client/my_orders": [ROLE.CLIENT],
  "/dashboard/client/financial": [ROLE.CLIENT],
  "/dashboard/client/feedback": [ROLE.CLIENT],
  "/dashboard/client/orders/create": [ROLE.CLIENT],
  "/dashboard/client/orders": [ROLE.CLIENT],
  "/dashboard/client/notifications": [ROLE.CLIENT],
  "/dashboard/freelancer/my-orders": [ROLE.FREELANCER],
  "/dashboard/freelancer/institution-orders": [ROLE.FREELANCER],
  /** معرض الطلبات: مستقل يتقدّم ويعرض؛ عميل يتصفّح الطلبات المتاحة (نفس مسار الواجهة). */
  "/dashboard/freelancer/orders": [ROLE.FREELANCER, ROLE.CLIENT],
  "/dashboard/freelancer/financial-claims": [ROLE.FREELANCER],
  "/dashboard/freelancer/feedback": [ROLE.FREELANCER],
  "/dashboard/freelancer/plans": [ROLE.FREELANCER],
  "/dashboard/freelancer/courses": [ROLE.FREELANCER],
  "/dashboard/freelancer/getting-started": [ROLE.FREELANCER],
  "/dashboard/freelancer/articles": [ROLE.FREELANCER],
  "/dashboard/freelancer/notifications": [ROLE.FREELANCER],
  "/dashboard/super-admin/notifications": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/institutions": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/courses": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/ads": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/training-orders": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/training-orders/settings": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/training-orders/templates": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/training-orders/rounds": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/training-orders/applications": STAFF_DASHBOARD_ROLES,
  "/dashboard/freelancer/settings": [ROLE.FREELANCER],
  "/dashboard/client/profile": [ROLE.CLIENT],
  "/dashboard/client/settings": [ROLE.CLIENT],
  "/dashboard/super-admin/settings": [ROLE.SUPER_ADMIN],
  "/dashboard/super-admin/admins": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/edit-website": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/edit-website/faq": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/edit-website/how-it-works": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/edit-website/pages": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/edit-website/footer": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/edit-website/footer/contact": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/edit-website/footer/working-hours": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/edit-website/footer/app-downloads": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/edit-website/footer/contact-center": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/edit-website/footer-app-downloads": STAFF_DASHBOARD_ROLES,
  "/dashboard/admin/orders": [ROLE.ADMIN],
  "/dashboard/admin/orders/create": [ROLE.ADMIN],
  "/dashboard/super-admin/orders": STAFF_DASHBOARD_ROLES,
  "/dashboard/super-admin/orders/create": STAFF_DASHBOARD_ROLES,
};

/**
 * Prefix rules for login `state.from` redirects (UI still guarded by RequireRole).
 * Most specific prefixes first.
 */
const DASHBOARD_PREFIX_RULES = [
  { prefix: "/dashboard/super-admin", roles: STAFF_DASHBOARD_ROLES },
  { prefix: "/dashboard/admin", roles: [ROLE.ADMIN] },
  { prefix: "/dashboard/freelancer/orders", roles: [ROLE.FREELANCER, ROLE.CLIENT] },
  { prefix: "/dashboard/freelancer/institution-orders", roles: [ROLE.FREELANCER] },
  { prefix: "/dashboard/freelancer/my-orders", roles: [ROLE.FREELANCER] },
  { prefix: "/dashboard/freelancer/financial-claims", roles: [ROLE.FREELANCER] },
  { prefix: "/dashboard/freelancer/feedback", roles: [ROLE.FREELANCER] },
  { prefix: "/dashboard/freelancer/plans", roles: [ROLE.FREELANCER] },
  { prefix: "/dashboard/freelancer/courses", roles: [ROLE.FREELANCER] },
  { prefix: "/dashboard/freelancer/getting-started", roles: [ROLE.FREELANCER] },
  { prefix: "/dashboard/freelancer/articles", roles: [ROLE.FREELANCER] },
  { prefix: "/dashboard/freelancer", roles: [ROLE.FREELANCER] },
  { prefix: "/dashboard/my-bonuses", roles: [ROLE.FINANCIAL_USER] },
  { prefix: "/dashboard/financial-user", roles: [ROLE.FINANCIAL_USER] },
  { prefix: "/dashboard/client/feedback", roles: [ROLE.CLIENT] },
  { prefix: "/dashboard/client", roles: [ROLE.CLIENT] },
];

/**
 * @param {string} pathname
 * @param {string} role
 */
export function canRoleAccessPath(pathname, role) {
  if (!pathname.startsWith("/dashboard")) {
    return true;
  }
  const exact = DASHBOARD_PATH_TO_ROLES[pathname];
  if (exact) {
    return exact.includes(role);
  }
  for (const rule of DASHBOARD_PREFIX_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.roles.includes(role);
    }
  }
  return false;
}

/** Login `location.state.problemsSuggestions` — post-login continue to role feedback. */
export const LOGIN_PROBLEMS_SUGGESTIONS_INTENT = "problemsSuggestions";

/**
 * Existing Problems & Suggestions (or admin feedback) path for a role, or null if none.
 * @param {string|null|undefined} role
 * @returns {string|null}
 */
export function getProblemsSuggestionsPathForRole(role) {
  const r = String(role || "").toLowerCase();
  if (r === ROLE.FREELANCER) return "/dashboard/freelancer/feedback";
  if (r === ROLE.CLIENT) return "/dashboard/client/feedback";
  if (r === ROLE.SUPER_ADMIN) return "/dashboard/super-admin/feedback";
  return null;
}

