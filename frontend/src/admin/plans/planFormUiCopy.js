/** UI copy for plan create/edit modal (no API / payload keys). */

export const PLAN_FORM_SECTIONS = [
  { id: "basic" },
  { id: "pricing" },
  { id: "limits" },
  { id: "availability" },
  { id: "marketing" },
];

export function planFormSectionLabel(t, section) {
  return t(`planAdmin.form.sections.${section.id}`);
}

export function getPlanFormCopy(t) {
  return {
    stripeAmountHelper: t("planAdmin.form.helpers.stripeAmount"),
    activationHelper: t("planAdmin.form.helpers.activation"),
    warningSelfPurchase: t("planAdmin.form.helpers.warningSelfPurchase"),
    warningOrderRange: t("planAdmin.form.helpers.warningOrderRange"),
    installmentsHint: t("planAdmin.form.helpers.installmentsHint"),
  };
}
