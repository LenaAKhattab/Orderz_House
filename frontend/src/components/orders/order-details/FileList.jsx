import { useCallback, useState } from "react";
import { useToast } from "../../ui/toastContext";
import { downloadOrderFileForRole, openPdfPreviewTab, viewOrderFileForRole } from "../../../services/api";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { getFileAccessLoginToast } from "../../../utils/guestPoolLoginToast";
import { fileTypeLabel, isImageOrderFile, isPreviewableOrderFile, orderFileErrorKey } from "./orderFileUi";
import "../../../i18n/ordersAdminResources";
import "./order-details-page.css";

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

function ImageIcon() {
  return (
    <svg className="od-file-list__svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V5h14v14zm-5.04-6.71-2.75 3.54-1.96-2.36L6.5 17h11l-3.54-4.71zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
      />
    </svg>
  );
}

function displayOrderFileName(f, defaultName) {
  const raw = String(f?.originalName || "").trim() || defaultName;
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
 * Canonical order file rows for every role and surface (brief, delivery, revision attachments).
 * Images/PDF get «View» + «Download»; other types are download-only. A file whose stored source is
 * gone (`unavailable` from the server, or a FILE_NOT_FOUND answer) shows a clear disabled state.
 *
 * @param {object} props
 * @param {Array<{ id: string|number, originalName?: string, mimeType?: string, purpose?: string, unavailable?: boolean }>} props.files
 * @param {string} props.emptyText
 * @param {string|null} [props.orderId] — required for secure view/download
 * @param {OrderFileAccessScope|null} [props.fileAccess] — when null, file actions are hidden
 * @param {string} [props.noAccessText] — shown instead of actions when `fileAccess` is null
 */
export default function FileList({ files, emptyText, orderId = null, fileAccess = null, noAccessText }) {
  const { push } = useToast();
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [missingIds, setMissingIds] = useState(() => new Set());

  const defaultFileName = t("ordersAdmin.orderDetails.files.defaultFileName");

  const canUseApi = Boolean(orderId && fileAccess && String(orderId).trim() && String(fileAccess).trim());

  const toastApiError = useCallback(
    (e, f, title) => {
      const mapped = orderFileErrorKey(e);
      if (mapped.login) {
        push(getFileAccessLoginToast(t));
        return;
      }
      if (mapped.missing) {
        setMissingIds((prev) => new Set(prev).add(String(f.id)));
      }
      push({ type: "error", title, message: t(`ordersAdmin.orderDetails.files.errors.${mapped.key}`) });
    },
    [push, t],
  );

  const runView = useCallback(
    async (f) => {
      if (!canUseApi) return;
      // Open the tab synchronously (before any await) so popup blockers allow it.
      const tab = openPdfPreviewTab(t("ordersAdmin.orderDetails.files.opening"));
      setBusyId(f.id);
      setBusyAction("view");
      try {
        const name = displayOrderFileName(f, defaultFileName);
        const out = await viewOrderFileForRole(orderId, f.id, name, fileAccess, tab);
        if (out?.previewed === false) {
          push({ type: "success", title: t("ordersAdmin.orderDetails.files.downloadSuccessTitle"), message: name });
        }
      } catch (e) {
        toastApiError(e, f, t("ordersAdmin.orderDetails.files.openErrorTitle"));
      } finally {
        setBusyId(null);
        setBusyAction(null);
      }
    },
    [canUseApi, defaultFileName, fileAccess, orderId, push, t, toastApiError],
  );

  const runDownload = useCallback(
    async (f) => {
      if (!canUseApi) return;
      setBusyId(f.id);
      setBusyAction("download");
      try {
        const name = displayOrderFileName(f, defaultFileName);
        await downloadOrderFileForRole(orderId, f.id, name, fileAccess);
        push({ type: "success", title: t("ordersAdmin.orderDetails.files.downloadSuccessTitle"), message: name });
      } catch (e) {
        toastApiError(e, f, t("ordersAdmin.orderDetails.files.downloadErrorTitle"));
      } finally {
        setBusyId(null);
        setBusyAction(null);
      }
    },
    [canUseApi, defaultFileName, fileAccess, orderId, push, t, toastApiError],
  );

  if (!Array.isArray(files) || !files.length) {
    return <p className="od-muted">{emptyText}</p>;
  }

  return (
    <ul className="od-file-list">
      {files.map((f) => {
        const name = displayOrderFileName(f, defaultFileName);
        const unavailable = f.unavailable === true || missingIds.has(String(f.id));
        const previewable = isPreviewableOrderFile(f);
        const loading = busyId === f.id;
        const typeLabel = fileTypeLabel(name);
        return (
          <li
            key={f.id}
            className={`od-file-list__item${unavailable ? " od-file-list__item--unavailable" : ""}`}
            data-file-id={String(f.id)}
            data-file-state={unavailable ? "unavailable" : "available"}
          >
            <span className="od-file-list__icon">{isImageOrderFile(f) ? <ImageIcon /> : <DocIcon />}</span>
            <span className="od-file-list__name">
              <span className="od-file-list__filename" dir="auto" title={name}>
                {name}
              </span>
              {typeLabel ? <span className="od-file-list__type">{typeLabel}</span> : null}
            </span>
            {unavailable ? (
              <span className="od-file-list__actions od-file-list__missing" role="note">
                {t("ordersAdmin.orderDetails.files.unavailable")}
              </span>
            ) : canUseApi ? (
              <span className="od-file-list__actions">
                {previewable ? (
                  <button
                    type="button"
                    className="od-file-list__btn od-file-list__btn--ghost"
                    disabled={Boolean(loading)}
                    onClick={() => void runView(f)}
                  >
                    {loading && busyAction === "view"
                      ? t("ordersAdmin.orderDetails.files.opening")
                      : t("ordersAdmin.orderDetails.files.view")}
                  </button>
                ) : null}
                <button type="button" className="od-file-list__btn" disabled={Boolean(loading)} onClick={() => void runDownload(f)}>
                  {loading && busyAction === "download"
                    ? t("ordersAdmin.orderDetails.files.downloading")
                    : t("ordersAdmin.orderDetails.files.download")}
                </button>
              </span>
            ) : (
              <span className="od-file-list__actions od-muted" style={{ fontSize: 13 }}>
                {noAccessText || t("ordersAdmin.orderDetails.files.loginHint")}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
