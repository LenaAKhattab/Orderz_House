import { useMemo, useState } from "react";
import {
  approveAdminInternalOrderDeliveryRequest,
  approveClientOrderDeliveryRequest,
  downloadOrderFileForRole,
  requestAdminInternalOrderRevisionRequest,
  requestClientOrderRevisionRequest,
  viewOrderFileForRole,
} from "../../services/api";
import { useToast } from "../ui/toastContext";
import SubmissionHistoryTimeline from "./submission-history/SubmissionHistoryTimeline";
import {
  ORDER_UPLOAD_TOTAL_SIZE_HELPER_AR,
  ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR,
  validateOrderFilesSize,
} from "../../utils/orderUploadLimits";

/** يحسّن عرض اسم الملف إن كان محفوظاً بترميز خاطئ سابقاً. */
function displayFileName(f) {
  const raw = String(f?.originalName || "").trim() || "مرفق";
  try {
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i) & 0xff;
    const decoded = new TextDecoder("utf-8").decode(bytes);
    if (/[\u0600-\u06FF]/.test(decoded) && !/[\u0600-\u06FF]/.test(raw)) return decoded;
  } catch {
    /* ignore */
  }
  return raw;
}

/**
 * @param {'workflow' | 'archive'} variant — workflow: مراجعة قبل الاعتماد؛ archive: طلب مكتمل، عرض وتنزيل فقط
 * @param {'client' | 'admin'} audience — مسار API: عميل أو طلب داخلي (إدارة)
 */
export default function ClientDeliveryReviewModal({ open, order, onClose, onApprove, onRevised, variant = "workflow", audience = "client" }) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionFiles, setRevisionFiles] = useState([]);

  const revisionFilesSizeError = useMemo(() => {
    if (!revisionFiles.length) return "";
    return validateOrderFilesSize(revisionFiles).ok ? "" : ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR;
  }, [revisionFiles]);

  if (!open || !order) return null;

  const isArchive = variant === "archive";
  const isAdmin = audience === "admin";
  const fileScope = isAdmin ? "admin" : "client";
  const orderIdStr = String(order?.id ?? "").trim();
  const deliveryFiles = (Array.isArray(order.files) ? order.files : []).filter(
    (f) =>
      f &&
      f.purpose === "delivery" &&
      (!f.orderId || String(f.orderId) === orderIdStr),
  );
  const canApprove = !isArchive && order.orderStatus === "pending_client_review" && deliveryFiles.length > 0;
  const canRequestRevision = !isArchive && (order.orderStatus === "pending_client_review" || order.orderStatus === "in_progress");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (isAdmin) await approveAdminInternalOrderDeliveryRequest(order.id);
      else await approveClientOrderDeliveryRequest(order.id);
      onApprove?.();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "تعذّر اعتماد التسليم.");
    } finally {
      setBusy(false);
    }
  };

  const requestRevision = async () => {
    const noteText = String(revisionNote || "").trim();
    if (!noteText) {
      setError("يرجى كتابة ملاحظة التعديل قبل الإرسال.");
      return;
    }
    if (revisionFiles.length && !validateOrderFilesSize(revisionFiles).ok) {
      setError(ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR);
      push({ type: "error", title: "حجم الملفات", message: ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR });
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (isAdmin) await requestAdminInternalOrderRevisionRequest(order.id, noteText, revisionFiles);
      else await requestClientOrderRevisionRequest(order.id, noteText, revisionFiles);
      onRevised?.();
      setRevisionFiles([]);
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "تعذّر إرسال طلب التعديل.");
    } finally {
      setBusy(false);
    }
  };

  const downloadOne = async (f) => {
    setDownloadingId(f.id);
    setError("");
    try {
      await downloadOrderFileForRole(order.id, f.id, displayFileName(f), fileScope);
      push({ type: "success", title: "بدأ التنزيل", message: displayFileName(f) });
    } catch (e) {
      const st = e?.response?.status;
      const msg =
        st === 403 ? "غير مصرح بتنزيل هذا الملف." : st === 404 ? "الملف غير موجود." : e?.message || "تعذّر تنزيل الملف.";
      setError(msg);
      push({ type: "error", title: "تعذّر التنزيل", message: msg });
    } finally {
      setDownloadingId(null);
    }
  };

  const viewOne = async (f) => {
    setViewingId(f.id);
    setError("");
    try {
      await viewOrderFileForRole(order.id, f.id, displayFileName(f), fileScope);
      push({ type: "success", title: "تم الفتح", message: "تم فتح الملف في تبويب جديد." });
    } catch (e) {
      const st = e?.response?.status;
      const msg =
        st === 403 ? "غير مصرح بعرض هذا الملف." : st === 404 ? "الملف غير موجود." : e?.message || "تعذّر عرض الملف.";
      setError(msg);
      push({ type: "error", title: "تعذّر العرض", message: msg });
    } finally {
      setViewingId(null);
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={() => {
        if (!busy && !downloadingId && !viewingId) onClose();
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
        aria-labelledby="delivery-modal-title"
        onMouseDown={(ev) => ev.stopPropagation()}
        style={{ maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}
      >
        <h2 id="delivery-modal-title" style={{ marginTop: 0 }}>
          {isArchive ? "ملفات تسليم المستقل" : "استلام الطلب ومراجعة المرفقات"}
        </h2>
        <p className="help" style={{ marginTop: 0 }}>
          {isArchive
            ? "يمكنك معاينة أو تنزيل الملفات التي أرسلها المستقل في أي وقت."
            : isAdmin
              ? "اطلع على ملفات التسليم من المستقل. عند اعتمادك للمرفقات يُعتبر الطلب مكتملاً."
              : "اطلع على ملفات التسليم من المستقل. عند موافقتك على المرفقات يُعتبر الطلب مكتملاً بينكما."}
        </p>
        {error ? (
          <p className="help" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        ) : null}
        {!isArchive && order.orderStatus === "in_progress" && deliveryFiles.length === 0 ? (
          <p className="help">
            {isAdmin
              ? "لم يُسلّم المستقل الملفات بعد."
              : "لم يُسلّم المستقل الملفات بعد. يمكنك استخدام «طلب تعديل» إن احتجت توضيحاً إضافياً."}
          </p>
        ) : null}
        {deliveryFiles.length ? (
          <ul className="order-details__attachments" style={{ marginTop: 12 }}>
            {deliveryFiles.map((f) => (
              <li
                key={f.id}
                className="order-details__attachment"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
              >
                <span style={{ wordBreak: "break-word" }}>{displayFileName(f)}</span>
                <span style={{ display: "inline-flex", gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: "6px 12px", fontSize: 14 }}
                    disabled={Boolean(downloadingId) || Boolean(viewingId) || busy}
                    onClick={() => void viewOne(f)}
                  >
                    {viewingId === f.id ? "جارٍ الفتح…" : "عرض"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: "6px 12px", fontSize: 14 }}
                    disabled={Boolean(downloadingId) || Boolean(viewingId) || busy}
                    onClick={() => void downloadOne(f)}
                  >
                    {downloadingId === f.id ? "جارٍ التنزيل…" : "تحميل"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : !isArchive && order.orderStatus === "pending_client_review" ? (
          <p className="help">لا توجد مرفقات مسجّلة للتسليم.</p>
        ) : isArchive && !deliveryFiles.length ? (
          <p className="help">لا توجد مرفقات تسليم مسجّلة لهذا الطلب.</p>
        ) : null}
        {order?.submissionHistory?.submissions?.length ? (
          <div style={{ marginTop: 16 }}>
            <SubmissionHistoryTimeline
              submissionHistory={order.submissionHistory}
              orderId={String(order.id)}
              fileAccess={isAdmin ? "admin" : "client"}
            />
          </div>
        ) : null}
        {!isArchive && canRequestRevision ? (
          <div className="field" style={{ marginTop: 12 }}>
            <label className="label" htmlFor="delivery-revision-note">
              ملاحظة التعديل للمستقل
            </label>
            <textarea
              id="delivery-revision-note"
              className="input"
              rows={3}
              value={revisionNote}
              onChange={(e) => {
                setRevisionNote(e.target.value);
                if (error) setError("");
              }}
              disabled={busy || Boolean(downloadingId) || Boolean(viewingId)}
              placeholder="اكتب ما يجب تعديله قبل الاعتماد النهائي…"
            />
            <label className="label" htmlFor="delivery-revision-files" style={{ marginTop: 8 }}>
              مرفقات طلب التعديل (اختياري)
            </label>
            <p className="help" style={{ marginTop: 0, marginBottom: 6 }}>
              {ORDER_UPLOAD_TOTAL_SIZE_HELPER_AR}
            </p>
            <input
              id="delivery-revision-files"
              type="file"
              className="input"
              multiple
              disabled={busy || Boolean(downloadingId) || Boolean(viewingId)}
              onChange={(e) => {
                const list = Array.from(e.target.files || []);
                setRevisionFiles(list.slice(0, 5));
                setError("");
              }}
            />
            {revisionFilesSizeError ? (
              <p className="help" style={{ color: "#b91c1c", marginTop: 6, marginBottom: 0 }}>
                {revisionFilesSizeError}
              </p>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 18 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            إغلاق
          </button>
          {!isArchive && canRequestRevision ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={
                busy ||
                Boolean(downloadingId) ||
                Boolean(viewingId) ||
                !String(revisionNote || "").trim() ||
                Boolean(revisionFilesSizeError)
              }
              onClick={requestRevision}
            >
              {busy ? "جارٍ الإرسال…" : "طلب تعديل"}
            </button>
          ) : null}
          {!isArchive ? (
            <button type="button" className="btn btn-primary" disabled={busy || !canApprove} onClick={submit}>
              {busy ? "جارٍ الاعتماد…" : "اعتماد التسليم وإنهاء الطلب"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
