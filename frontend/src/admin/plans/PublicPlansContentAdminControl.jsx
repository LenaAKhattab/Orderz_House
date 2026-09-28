import { useState } from "react";
import Button from "../../components/ui/Button";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/planAdminResources";
import PublicPlansContentModal from "./PublicPlansContentModal";

/**
 * Page-level Super Admin action: edit public `/plans` hero copy + initial tab.
 * Fields live in a modal, not permanently on the page.
 */
export default function PublicPlansContentAdminControl() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="oh-sapl-public-content-control" data-public-plans-content-editor="true">
      <Button
        type="button"
        variant="ghost"
        className="oh-sapl-public-content-btn oh-sapl-action-toolbar__tertiary"
        title={t("planAdmin.publicContent.editButtonTitle")}
        onClick={() => setOpen(true)}
      >
        {t("planAdmin.publicContent.editButton")}
      </Button>
      <PublicPlansContentModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
