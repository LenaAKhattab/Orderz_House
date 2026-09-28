import { useEffect, useState } from "react";
import { requestClientOrderRevisionRequest } from "../../services/api";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/clientAreaResources";

export default function ClientRevisionRequestModal({ open, orderId, onClose, onSaved }) {
  const { t } = useTranslation();
  const r = "clientArea.revisionRequest";
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setNote("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestClientOrderRevisionRequest(orderId, note.trim());
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || t(`${r}.sendError`));
    } finally {
      setBusy(false);
    }
  };

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
        aria-labelledby="revision-modal-title"
        onMouseDown={(ev) => ev.stopPropagation()}
        style={{ maxWidth: 480, width: "100%" }}
      >
        <h2 id="revision-modal-title" style={{ marginTop: 0 }}>
          {t(`${r}.title`)}
        </h2>
        <p className="help" style={{ marginTop: 0 }}>
          {t(`${r}.description`)}
        </p>
        {error ? (
          <p className="help" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        ) : null}
        <form onSubmit={submit}>
          <div className="field">
            <label className="label" htmlFor="revision-note">
              {t(`${r}.notesLabel`)}
            </label>
            <textarea
              id="revision-note"
              className="input"
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              placeholder={t(`${r}.notesPlaceholder`)}
            />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              {t("clientArea.common.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t("clientArea.common.busy.sending") : t(`${r}.submit`)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
