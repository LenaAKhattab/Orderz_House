import { useTranslation } from "../../i18n/LanguageProvider";

/**
 * Shared confirmation before claiming a pool order (same copy as freelancer orders list).
 */
export default function TakePoolOrderConfirmModal({ open, busy, onClose, onConfirm }) {
  const { t } = useTranslation();
  const pc = "orders.poolConfirm";
  if (!open) return null;

  return (
    <div
      role="presentation"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(15, 23, 42, 0.45)",
      }}
    >
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="take-confirm-title"
        onMouseDown={(ev) => ev.stopPropagation()}
        style={{ maxWidth: 480, width: "100%" }}
      >
        <h3 id="take-confirm-title" style={{ marginTop: 0, marginBottom: 8 }}>
          {t(`${pc}.title`)}
        </h3>
        <p className="help" style={{ marginTop: 0 }}>
          {t(`${pc}.body`)}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              await onConfirm();
            }}
          >
            {busy ? t("dashboard.ui.executing") : t(`${pc}.confirm`)}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t(`${pc}.cancel`)}
          </button>
        </div>
      </div>
    </div>
  );
}
