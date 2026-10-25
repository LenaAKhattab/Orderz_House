import { useEffect, useId, useRef, useState } from "react";
import { PackageCheck } from "lucide-react";
import {
  approveAdminInternalOrderDeliveryRequest,
  approveClientOrderDeliveryRequest,
  requestAdminInternalOrderRevisionRequest,
  requestClientOrderRevisionRequest,
} from "../../services/api";
import { useToast } from "../ui/toastContext";
import SubmissionHistoryTimeline from "./submission-history/SubmissionHistoryTimeline";
import FileList from "./order-details/FileList";
import OrderDialog from "./OrderDialog";
import OrderFilesPicker from "./OrderFilesPicker";
import ConfirmDialog from "../dashboard/ConfirmDialog";
import { validateOrderFilesSize } from "../../utils/orderUploadLimits";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { trackEvent } from "../../services/analytics";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/clientAreaResources";

/**
 * @param {'workflow' | 'archive'} variant — workflow: مراجعة قبل الاعتماد؛ archive: طلب مكتمل، عرض وتنزيل فقط
 * @param {'client' | 'admin'} audience — مسار API: عميل أو طلب داخلي (إدارة)
 */
export default function ClientDeliveryReviewModal({ open, order, onClose, onApprove, onRevised, variant = "workflow", audience = "client" }) {
  const { push } = useToast();
  const { t } = useTranslation();
  const d = "clientArea.deliveryReview";
  const noteId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("review");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionFiles, setRevisionFiles] = useState([]);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open) {
      setView("review");
      setError("");
      setConfirmOpen(false);
      setRevisionNote("");
      setRevisionFiles([]);
    }
  }, [open]);

  if (!open || !order) return null;

  const isArchive = variant === "archive";
  const isAdmin = audience === "admin";
  const fileScope = isAdmin ? "admin" : "client";
  const orderIdStr = String(order?.id ?? "").trim();
  const deliveryFiles = (Array.isArray(order.files) ? order.files : []).filter(
    (f) => f && f.purpose === "delivery" && (!f.orderId || String(f.orderId) === orderIdStr),
  );
  const submissions = Array.isArray(order?.submissionHistory?.submissions) ? order.submissionHistory.submissions : [];
  // After a resubmission, review the current delivery only; earlier ones stay in the history below.
  const currentSubmission = submissions.find((s) => s?.isCurrent);
  const reviewFiles =
    currentSubmission && Array.isArray(currentSubmission.files) && currentSubmission.files.length ? currentSubmission.files : deliveryFiles;
  const canApprove = !isArchive && order.orderStatus === "pending_client_review" && deliveryFiles.length > 0;
  const canRequestRevision =
    !isArchive && (order.orderStatus === "pending_client_review" || (order.orderStatus === "in_progress" && deliveryFiles.length > 0));
  const revisionFilesOk = validateOrderFilesSize(revisionFiles).ok;
  const noteText = String(revisionNote || "").trim();

  const approve = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (isAdmin) await approveAdminInternalOrderDeliveryRequest(order.id);
      else await approveClientOrderDeliveryRequest(order.id);
      trackEvent("order_completed", { order_id: String(order.id), audience: isAdmin ? "admin" : "client" });
      push({ type: "success", title: t(`${d}.approvedTitle`), message: t(`${d}.approvedMessage`) });
      setConfirmOpen(false);
      onApprove?.();
      onClose();
    } catch (e) {
      setConfirmOpen(false);
      setError(getSafeApiErrorMessage(e, t(`${d}.approveError`)));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const requestRevision = async (e) => {
    e?.preventDefault?.();
    if (inFlight.current) return;
    if (!noteText) {
      setError(t(`${d}.revisionNoteRequired`));
      return;
    }
    if (!revisionFilesOk) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (isAdmin) await requestAdminInternalOrderRevisionRequest(order.id, noteText, revisionFiles);
      else await requestClientOrderRevisionRequest(order.id, noteText, revisionFiles);
      push({ type: "success", title: t(`${d}.revisionSentTitle`), message: t(`${d}.revisionSentMessage`) });
      onRevised?.();
      onClose();
    } catch (err) {
      setError(getSafeApiErrorMessage(err, t(`${d}.revisionSendError`)));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const isRevisionView = view === "revision" && canRequestRevision;
  const title = isRevisionView ? t(`${d}.requestRevision`) : isArchive ? t(`${d}.titleArchive`) : t(`${d}.titleWorkflow`);

  const footer = isRevisionView ? (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => { setView("review"); setError(""); }} disabled={busy}>
        {t(`${d}.backToDelivery`)}
      </button>
      <span className="oh-dialog__foot-spacer" />
      <button type="submit" form={`${noteId}-form`} className="btn btn-primary" disabled={busy || !noteText || !revisionFilesOk}>
        {busy ? t("clientArea.common.busy.sending") : t(`${d}.sendRevision`)}
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
        {t("clientArea.common.close")}
      </button>
      {!isArchive ? <span className="oh-dialog__foot-spacer" /> : null}
      {canRequestRevision ? (
        <button type="button" className="btn btn-secondary" onClick={() => { setView("revision"); setError(""); }} disabled={busy}>
          {t(`${d}.requestRevision`)}
        </button>
      ) : null}
      {!isArchive ? (
        <button type="button" className="btn btn-primary" disabled={busy || !canApprove} onClick={() => setConfirmOpen(true)}>
          {t(`${d}.approveDelivery`)}
        </button>
      ) : null}
    </>
  );

  return (
    <>
      <OrderDialog
        open={open}
        onClose={onClose}
        busy={busy || confirmOpen}
        size="lg"
        icon={<PackageCheck />}
        title={title}
        subtitle={order.title ? <span dir="auto">{order.title}</span> : null}
        footer={footer}
      >
        {error ? (
          <p className="oh-dialog-error" role="alert">
            {error}
          </p>
        ) : null}

        {isRevisionView ? (
          <form id={`${noteId}-form`} onSubmit={requestRevision} className="oh-dialog-section" noValidate>
            <p className="oh-dialog-note">{t("clientArea.revisionRequest.description")}</p>
            <div className="oh-dialog-field">
              <label className="oh-dialog-field__label" htmlFor={noteId}>
                {t(`${d}.revisionNoteLabel`)}
              </label>
              <textarea
                id={noteId}
                className="input"
                rows={4}
                value={revisionNote}
                onChange={(e) => {
                  setRevisionNote(e.target.value);
                  if (error) setError("");
                }}
                disabled={busy}
                placeholder={t(`${d}.revisionNotePlaceholder`)}
                aria-required="true"
                data-autofocus
              />
            </div>
            <OrderFilesPicker label={t(`${d}.revisionFilesLabel`)} files={revisionFiles} onChange={setRevisionFiles} disabled={busy} />
          </form>
        ) : (
          <>
            <p className="oh-dialog-note">
              {isArchive ? t(`${d}.helpArchive`) : isAdmin ? t(`${d}.helpAdmin`) : t(`${d}.helpClient`)}
            </p>
            <section className="oh-dialog-section" aria-labelledby={`${noteId}-files`}>
              <h3 className="oh-dialog-section__title" id={`${noteId}-files`}>
                {t(`${d}.deliveryFilesTitle`, { count: reviewFiles.length })}
              </h3>
              <FileList
                files={reviewFiles}
                orderId={orderIdStr}
                fileAccess={fileScope}
                emptyText={
                  !isArchive && order.orderStatus === "in_progress"
                    ? isAdmin
                      ? t(`${d}.noDeliveryAdmin`)
                      : t(`${d}.noDeliveryClient`)
                    : isArchive
                      ? t(`${d}.noAttachmentsArchive`)
                      : t(`${d}.noAttachmentsPending`)
                }
              />
            </section>
            {submissions.length ? (
              <details className="oh-dialog-details">
                <summary>{t(`${d}.historyToggle`, { count: submissions.length })}</summary>
                <SubmissionHistoryTimeline
                  submissionHistory={order.submissionHistory}
                  orderId={orderIdStr}
                  fileAccess={isAdmin ? "admin" : "client"}
                  hideTitle
                />
              </details>
            ) : null}
          </>
        )}
      </OrderDialog>
      <ConfirmDialog
        open={confirmOpen}
        title={t(`${d}.approveConfirmTitle`)}
        body={isAdmin ? t(`${d}.helpAdmin`) : t(`${d}.approveConfirmBody`)}
        confirmLabel={busy ? t("clientArea.common.busy.approving") : t(`${d}.approveConfirm`)}
        cancelLabel={t("clientArea.common.cancel")}
        confirmBusy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void approve()}
      />
    </>
  );
}
