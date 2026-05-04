import { useCallback, useState } from "react";
import { useToast } from "../../ui/toastContext";
import { downloadOrderFileForRole, viewOrderFileForRole } from "../../../services/api";

/** @typedef {"client"|"freelancer"|"admin"} OrderFileAccessScope */

function DocIcon() {
  return (
    <svg className="od-file-list__svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 12h8v2H8v-2zm0 4h8v2H8v-2z"
      />
    </svg>
  );
}

function displayOrderFileName(f) {
  const raw = String(f?.originalName || "").trim() || "ملف";
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
 * @param {object} props
 * @param {Array<{ id: string|number, fileUrl?: string, originalName?: string, purpose?: string }>} props.files
 * @param {string} props.emptyText
 * @param {string|null} [props.orderId] — required for secure view/download
 * @param {OrderFileAccessScope|null} [props.fileAccess] — when null, file actions are hidden
 */
export default function FileList({ files, emptyText, orderId = null, fileAccess = null }) {
  const { push } = useToast();
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);

  const canUseApi = Boolean(orderId && fileAccess && String(orderId).trim() && String(fileAccess).trim());

  const toastApiError = useCallback(
    (e, title) => {
      const status = e?.response?.status;
      let msg = e?.message || e?.response?.data?.message;
      if (e?.response?.data instanceof Blob) {
        msg =
          msg ||
          (status === 403 ? "غير مصرح بعرض هذا الملف." : status === 404 ? "الملف غير موجود." : null);
      }
      if (status === 401) msg = "يرجى تسجيل الدخول.";
      if (status === 403) msg = msg || "غير مصرح بعرض هذا الملف.";
      if (status === 404) msg = msg || "الملف غير موجود.";
      push({ type: "error", title, message: msg || "تعذّرت العملية." });
    },
    [push],
  );

  const runView = useCallback(
    async (f) => {
      if (!canUseApi) return;
      setBusyId(f.id);
      setBusyAction("view");
      try {
        await viewOrderFileForRole(orderId, f.id, displayOrderFileName(f), fileAccess);
        push({ type: "success", title: "تم الفتح", message: "تم فتح الملف في تبويب جديد." });
      } catch (e) {
        toastApiError(e, "تعذّر عرض الملف");
      } finally {
        setBusyId(null);
        setBusyAction(null);
      }
    },
    [canUseApi, fileAccess, orderId, push, toastApiError],
  );

  const runDownload = useCallback(
    async (f) => {
      if (!canUseApi) return;
      setBusyId(f.id);
      setBusyAction("download");
      try {
        await downloadOrderFileForRole(orderId, f.id, displayOrderFileName(f), fileAccess);
        push({ type: "success", title: "بدأ التنزيل", message: displayOrderFileName(f) });
      } catch (e) {
        toastApiError(e, "تعذّر التنزيل");
      } finally {
        setBusyId(null);
        setBusyAction(null);
      }
    },
    [canUseApi, fileAccess, orderId, push, toastApiError],
  );

  if (!Array.isArray(files) || !files.length) {
    return <p className="od-muted">{emptyText}</p>;
  }

  return (
    <ul className="od-file-list">
      {files.map((f) => {
        const name = displayOrderFileName(f);
        const loading = busyId === f.id;
        const viewLabel = loading && busyAction === "view" ? "جارٍ الفتح…" : "عرض";
        const dlLabel = loading && busyAction === "download" ? "جارٍ التنزيل…" : "تحميل";
        return (
          <li key={f.id} className="od-file-list__item">
            <span className="od-file-list__icon">
              <DocIcon />
            </span>
            <span className="od-file-list__name">
              <span className="od-file-list__filename">{name}</span>
            </span>
            {canUseApi ? (
              <span className="od-file-list__actions">
                <button
                  type="button"
                  className="od-file-list__btn od-file-list__btn--ghost"
                  disabled={Boolean(loading)}
                  onClick={() => void runView(f)}
                >
                  {viewLabel}
                </button>
                <button type="button" className="od-file-list__btn" disabled={Boolean(loading)} onClick={() => void runDownload(f)}>
                  {dlLabel}
                </button>
              </span>
            ) : (
              <span className="od-file-list__actions od-muted" style={{ fontSize: 13 }}>
                سجّل الدخول بصلاحية مناسبة لعرض الملفات بأمان
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
