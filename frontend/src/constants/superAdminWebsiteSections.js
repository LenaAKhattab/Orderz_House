/** Editable public website sections (Super Admin → edit website). */
export const EDIT_WEBSITE_BASE = "/dashboard/super-admin/edit-website";

export const SUPER_ADMIN_WEBSITE_SECTIONS = [
  {
    id: "faq",
    titleKey: "siteEditor.sections.faq.title",
    descriptionKey: "siteEditor.sections.faq.description",
    editLabelKey: "siteEditor.sections.faq.editLabel",
    path: `${EDIT_WEBSITE_BASE}/faq`,
  },
  {
    id: "how-it-works",
    titleKey: "siteEditor.sections.howItWorks.title",
    descriptionKey: "siteEditor.sections.howItWorks.description",
    editLabelKey: "siteEditor.sections.howItWorks.editLabel",
    path: `${EDIT_WEBSITE_BASE}/how-it-works`,
  },
  {
    id: "site-pages",
    titleKey: "siteEditor.sections.sitePages.title",
    descriptionKey: "siteEditor.sections.sitePages.description",
    editLabelKey: "siteEditor.sections.sitePages.editLabel",
    path: `${EDIT_WEBSITE_BASE}/pages`,
  },
  {
    id: "footer",
    titleKey: "siteEditor.sections.footerHub.title",
    descriptionKey: "siteEditor.sections.footerHub.description",
    editLabelKey: "siteEditor.sections.footerHub.editLabel",
    path: `${EDIT_WEBSITE_BASE}/footer`,
  },
];

/** Footer editor subsections under /edit-website/footer */
export const FOOTER_EDIT_BASE = `${EDIT_WEBSITE_BASE}/footer`;

export const SUPER_ADMIN_FOOTER_SECTIONS = [
  {
    id: "contact",
    titleKey: "siteEditor.footerSections.contact.title",
    descriptionKey: "siteEditor.footerSections.contact.description",
    editLabelKey: "siteEditor.footerSections.contact.editLabel",
    path: `${FOOTER_EDIT_BASE}/contact`,
  },
  {
    id: "working-hours",
    titleKey: "siteEditor.footerSections.workingHours.title",
    descriptionKey: "siteEditor.footerSections.workingHours.description",
    editLabelKey: "siteEditor.footerSections.workingHours.editLabel",
    path: `${FOOTER_EDIT_BASE}/working-hours`,
  },
  {
    id: "app-downloads",
    titleKey: "siteEditor.footerSections.appDownloads.title",
    descriptionKey: "siteEditor.footerSections.appDownloads.description",
    editLabelKey: "siteEditor.footerSections.appDownloads.editLabel",
    path: `${FOOTER_EDIT_BASE}/app-downloads`,
  },
  {
    id: "contact-center",
    titleKey: "siteEditor.footerSections.contactCenter.title",
    descriptionKey: "siteEditor.footerSections.contactCenter.description",
    editLabelKey: "siteEditor.footerSections.contactCenter.editLabel",
    path: `${FOOTER_EDIT_BASE}/contact-center`,
  },
];
