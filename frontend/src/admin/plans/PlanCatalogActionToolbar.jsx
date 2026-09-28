import Button from "../../components/ui/Button";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/planAdminResources";
import DefaultPlanCatalogControl from "./DefaultPlanCatalogSelector";
import PublicPlansContentAdminControl from "./PublicPlansContentAdminControl";

/**
 * Shared Super Admin catalog header actions.
 * DOM order = RTL visual order: Create (rightmost) → default → page content.
 * Does not change catalog APIs or create/save behavior.
 */
export default function PlanCatalogActionToolbar({ catalog, onCreate, createLabel, extra = null }) {
  const { t } = useTranslation();

  return (
    <div
      className="oh-sapl-section-heading-actions"
      role="toolbar"
      aria-label={t("planAdmin.catalog.actionsAria")}
    >
      <Button type="button" className="oh-sapl-action-toolbar__create oh-sapl-header-cta" onClick={onCreate}>
        {createLabel}
      </Button>
      <DefaultPlanCatalogControl catalog={catalog} />
      <PublicPlansContentAdminControl />
      {extra}
    </div>
  );
}
