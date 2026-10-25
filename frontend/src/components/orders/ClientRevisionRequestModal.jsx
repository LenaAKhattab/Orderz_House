import { useEffect, useId, useState } from "react";
import { PencilLine } from "lucide-react";
import { requestClientOrderRevisionRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { validateOrderFilesSize } from "../../utils/orderUploadLimits";
import { useTranslation } from "../../i18n/LanguageProvider";
import OrderDialog from "./OrderDialog";
import OrderFilesPicker from "./OrderFilesPicker";
import "../../i18n/clientAreaResources";

export default function ClientRevisionRequestModal({ open, orderId, orderTitle, onClose, onSaved }) {
  const { t } = useTranslation();
  const r = "clientArea.revisionRequest";
  const noteId = useId();
  const [note, setNote] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setNote("");
      setFiles([]);
      setError("");
    }
  }, [open]);

  const noteText = note.trim();
  const filesOk = validateOrderFilesSize(files).ok;

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!noteText) {
      setError(t("clientArea.deliveryReview.revisionNoteRequired"));
      return;
    }
    if (!filesOk) return;
    setBusy(true);
    setError("");
    try {
      await requestClientOrderRevisionRequest(orderId, noteText, files);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(getSafeApiErrorMessage(err, t(`${r}.sendError`)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OrderDialog
      open={open}
      onClose={onClose}
      busy={busy}
      size="md"
      icon={<PencilLine />}
      title={t(`${r}.title`)}
      subtitle={orderTitle ? <span dir="auto">{orderTitle}</span> : null}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t("clientArea.common.cancel")}
          </button>
          <button type="submit" form={`${noteId}-form`} className="btn btn-primary" disabled={busy || !noteText || !filesOk}>
            {busy ? t("clientArea.common.busy.sending") : t(`${r}.submit`)}
          </button>
        </>
      }
    >
      <form id={`${noteId}-form`} onSubmit={submit} className="oh-dialog-section" noValidate>
        <p className="oh-dialog-note">{t(`${r}.description`)}</p>
        {error ? (
          <p className="oh-dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="oh-dialog-field">
          <label className="oh-dialog-field__label" htmlFor={noteId}>
            {t(`${r}.notesLabel`)}
          </label>
          <textarea
            id={noteId}
            className="input"
            rows={5}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (error) setError("");
            }}
            disabled={busy}
            placeholder={t(`${r}.notesPlaceholder`)}
            aria-required="true"
            data-autofocus
          />
        </div>
        <OrderFilesPicker label={t("clientArea.deliveryReview.revisionFilesLabel")} files={files} onChange={setFiles} disabled={busy} />
      </form>
    </OrderDialog>
  );
}
