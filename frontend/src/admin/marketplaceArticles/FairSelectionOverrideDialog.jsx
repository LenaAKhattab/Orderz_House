import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import {
  FAIR_OVERRIDE_REASON_MAX,
  isValidFairOverrideReason,
} from "./fairOverrideReason";
import { useArticlesT } from "./useArticlesT";

export default function FairSelectionOverrideDialog({
  open,
  submitting = false,
  activationOverride = false,
  onCancel,
  onConfirm,
}) {
  const { t } = useArticlesT();
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
        <h3 className="mb-2 mt-0">{t("fairOverride.title")}</h3>
        <p className="mb-3 mt-0 text-[0.92rem]">{t("fairOverride.helper")}</p>
        {activationOverride ? (
          <p data-testid="activation-fair-override-note" className="mb-3 mt-0 text-[0.85rem]" style={{ opacity: 0.8 }}>
            {t("fairOverride.activationNote")}
          </p>
        ) : null}
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
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={!valid || submitting}
          >
            {t("fairOverride.confirmSelection")}
          </Button>
        </div>
      </div>
    </div>
  );
}
