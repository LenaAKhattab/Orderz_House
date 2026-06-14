/** Editable public website sections (Super Admin → تعديل الموقع). */
export const EDIT_WEBSITE_BASE = "/dashboard/super-admin/edit-website";

export const SUPER_ADMIN_WEBSITE_SECTIONS = [
  {
    id: "faq",
    title: "الأسئلة الشائعة",
    description: "تعديل الأسئلة والأجوبة المعروضة في الصفحة الرئيسية",
    editLabel: "تعديل القسم",
    path: `${EDIT_WEBSITE_BASE}/faq`,
  },
  {
    id: "how-it-works",
    title: "طريقة العمل",
    description: "تعديل صفحات طريقة العمل للمستقل والعميل",
    editLabel: "تعديل القسم",
    path: `${EDIT_WEBSITE_BASE}/how-it-works`,
  },
  {
    id: "site-pages",
    title: "الصفحات العامة",
    description: "تعديل صفحات الموقع العامة (الخصوصية، الشروط، مركز المساعدة، وغيرها)",
    editLabel: "تعديل القسم",
    path: `${EDIT_WEBSITE_BASE}/pages`,
  },
];
