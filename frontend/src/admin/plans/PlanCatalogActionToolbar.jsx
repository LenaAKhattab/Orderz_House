import Button from "../../components/ui/Button";
import DefaultPlanCatalogControl from "./DefaultPlanCatalogSelector";
import PublicPlansContentAdminControl from "./PublicPlansContentAdminControl";

/**
 * Shared Super Admin catalog header actions.
 * DOM order = RTL visual order: Create (rightmost) → default → page content.
 * Does not change catalog APIs or create/save behavior.
 */
export default function PlanCatalogActionToolbar({
  isEn = false,
  catalog,
  onCreate,
  createLabel,
  extra = null,
}) {
  return (
    <div
      className="oh-sapl-section-heading-actions"
      role="toolbar"
      aria-label={isEn ? "Plan catalog actions" : "إجراءات قسم الباقات"}
    >
      <Button type="button" className="oh-sapl-action-toolbar__create oh-sapl-header-cta" onClick={onCreate}>
        {createLabel}
      </Button>
      <DefaultPlanCatalogControl catalog={catalog} isEn={isEn} />
      <PublicPlansContentAdminControl isEn={isEn} />
      {extra}
    </div>
  );
}
