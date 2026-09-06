import { useState } from "react";
import Button from "../../components/ui/Button";
import PublicPlansContentModal from "./PublicPlansContentModal";

/**
 * Page-level Super Admin action: edit public `/plans` hero copy + initial tab.
 * Fields live in a modal, not permanently on the page.
 */
export default function PublicPlansContentAdminControl({ isEn = false }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="oh-sapl-public-content-control" data-public-plans-content-editor="true">
      <Button
        type="button"
        variant="ghost"
        className="oh-sapl-public-content-btn oh-sapl-action-toolbar__tertiary"
        title={isEn ? "Edit shared public plans page content" : "تعديل محتوى صفحة الباقات العامة المشتركة"}
        onClick={() => setOpen(true)}
      >
        {isEn ? "Edit plans page content" : "تعديل محتوى صفحة الباقات"}
      </Button>
      <PublicPlansContentModal open={open} isEn={isEn} onClose={() => setOpen(false)} />
    </div>
  );
}
