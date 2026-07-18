import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FilePlus2, X } from "lucide-react";
import AdminInternalOrderWizard from "../../../components/orders/AdminInternalOrderWizard";
import ConfirmDialog from "../../../components/dashboard/ConfirmDialog";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../styles/createOrderModal.css";

/**
 * Institutional create-order overlay — presentation only.
 * Reuses AdminInternalOrderWizard (modal variant) and existing create-order modal styles.
 */
export default function InstitutionalCreateOrderModal({
  open,
  onClose,
  onSubmitFormData,
  onSuccess = null,
  storageName = "",
  triggerRef = null,
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef(null);
  const [wizardKey, setWizardKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWizardKey((k) => k + 1);
    setBusy(false);
    setDirty(false);
    setDiscardOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      const root = panelRef.current;
      if (!root) return;
      const focusable = root.querySelector(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable && typeof focusable.focus === "function") focusable.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, wizardKey]);

  const finishClose = useCallback(() => {
    setDiscardOpen(false);
    setDirty(false);
    setBusy(false);
    onClose?.();
    window.requestAnimationFrame(() => {
      const el = triggerRef?.current;
      if (el && typeof el.focus === "function") el.focus();
    });
  }, [onClose, triggerRef]);

  const requestClose = useCallback(() => {
    if (busy) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    finishClose();
  }, [busy, dirty, finishClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (busy) return;
      if (discardOpen) {
        setDiscardOpen(false);
        return;
      }
      e.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, discardOpen, requestClose]);

  if (!open) return null;

  const subtitle = storageName
    ? t("dashboard.institutionalOrderStorage.createOrderModalSubtitleNamed", { name: storageName })
    : t("dashboard.institutionalOrderStorage.createOrderModalSubtitle");

  return createPortal(
    <>
      <div
        className="client-order-modal-overlay oh-ios-create-order-overlay"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
      >
        <div
          ref={panelRef}
          className="client-order-modal client-order-modal--admin-wizard client-order-modal--institutional"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={subtitleId}
          dir="rtl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="client-order-modal__head co-modal-ref__head">
            <div className="co-modal-ref__head-main">
              <span className="co-modal-ref__head-icon" aria-hidden="true">
                <FilePlus2 size={22} strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <h2 id={titleId} className="client-order-modal__title co-modal-ref__title">
                  {t("dashboard.institutionalOrderStorage.createOrder")}
                </h2>
                <p id={subtitleId} className="oh-ios-create-order-subtitle">
                  {subtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="co-modal-ref__close"
              onClick={requestClose}
              disabled={busy}
              aria-label={t("dashboard.institutionalOrderStorage.cancel")}
            >
              <X size={20} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </header>
          <div className="client-order-modal__body client-order-modal__body--admin-wizard">
            <AdminInternalOrderWizard
              key={wizardKey}
              variant="modal"
              mode="institutional"
              resetToken={wizardKey}
              onSubmitFormData={onSubmitFormData}
              onCreated={() => {
                finishClose();
                if (typeof onSuccess === "function") {
                  void Promise.resolve(onSuccess()).catch(() => {});
                }
              }}
              modalOnClose={requestClose}
              modalCloseLabel={t("dashboard.institutionalOrderStorage.cancel")}
              onBusyChange={setBusy}
              onDirtyChange={setDirty}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={discardOpen}
        title={t("dashboard.institutionalOrderStorage.discardCreateTitle")}
        body={t("dashboard.institutionalOrderStorage.discardCreateBody")}
        confirmLabel={t("dashboard.institutionalOrderStorage.discardCreateConfirm")}
        cancelLabel={t("dashboard.institutionalOrderStorage.cancel")}
        confirmVariant="danger"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={finishClose}
      />
    </>,
    document.body,
  );
}
