import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import {
  FAIR_OVERRIDE_REASON_HELPER_AR,
  FAIR_OVERRIDE_REASON_LABEL_AR,
  FAIR_OVERRIDE_REASON_MAX,
  isValidFairOverrideReason,
} from "./fairOverrideReason";

export default function FairSelectionOverrideDialog({
  open,
  isEn = false,
  submitting = false,
  onCancel,
  onConfirm,
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!open) return null;
  const valid = isValidFairOverrideReason(reason);

  return (
    <div
      data-testid="fair-selection-override-dialog"
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/45 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-[480px] overflow-y-auto rounded-lg bg-white p-4"
      >
        <h3 className="mb-2 mt-0">{FAIR_OVERRIDE_REASON_LABEL_AR}</h3>
        <p className="mb-3 mt-0 text-[0.92rem]">
          {isEn
            ? "This applicant is not rank #1 in fair ranking. Please explain why before continuing."
            : FAIR_OVERRIDE_REASON_HELPER_AR}
        </p>
        <textarea
          data-testid="fair-override-reason"
          className="mb-3 w-full"
          value={reason}
          maxLength={FAIR_OVERRIDE_REASON_MAX}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            {isEn ? "Cancel" : "إلغاء"}
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={!valid || submitting}
          >
            {isEn ? "Confirm selection" : "تأكيد الاختيار"}
          </Button>
        </div>
      </div>
    </div>
  );
}
