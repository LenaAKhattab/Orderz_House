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
  {
    id: "footer",
    title: "تعديل تذييل الموقع",
    description: "تعديل بيانات التواصل وساعات العمل وقسم تحميل التطبيق في تذييل الموقع.",
    editLabel: "تعديل القسم",
    path: `${EDIT_WEBSITE_BASE}/footer`,
  },
];

/** Footer editor subsections under /edit-website/footer */
export const FOOTER_EDIT_BASE = `${EDIT_WEBSITE_BASE}/footer`;

export const SUPER_ADMIN_FOOTER_SECTIONS = [
  {
    id: "contact",
    title: "تواصل معنا",
    description: "تعديل رقم الهاتف والبريد الإلكتروني وواتساب والموقع.",
    editLabel: "تعديل",
    path: `${FOOTER_EDIT_BASE}/contact`,
  },
  {
    id: "working-hours",
    title: "ساعات العمل",
    description: "تعديل النص الظاهر في قسم ساعات العمل.",
    editLabel: "تعديل",
    path: `${FOOTER_EDIT_BASE}/working-hours`,
  },
  {
    id: "app-downloads",
    title: "تحميل التطبيق",
    description: "تعديل عنوان قسم تحميل التطبيق وروابط App Store وGoogle Play.",
    editLabel: "تعديل",
    path: `${FOOTER_EDIT_BASE}/app-downloads`,
  },
  {
    id: "contact-center",
    title: "مركز التواصل",
    description: "تعديل نص ورابط مركز التواصل وخيارات ظهوره في تذييل الموقع.",
    editLabel: "تعديل",
    path: `${FOOTER_EDIT_BASE}/contact-center`,
  },
];
