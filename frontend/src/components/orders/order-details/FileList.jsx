import { useCallback, useState } from "react";
import { useToast } from "../../ui/toastContext";
import { downloadOrderFileForRole, viewOrderFileForRole } from "../../../services/api";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { getFileAccessLoginToast } from "../../../utils/guestPoolLoginToast";
import "../../../i18n/ordersAdminResources";

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
 * @param {object} props
 * @param {Array<{ id: string|number, fileUrl?: string, originalName?: string, purpose?: string }>} props.files
 * @param {string} props.emptyText
 * @param {string|null} [props.orderId] — required for secure view/download
 * @param {OrderFileAccessScope|null} [props.fileAccess] — when null, file actions are hidden
 */
export default function FileList({ files, emptyText, orderId = null, fileAccess = null }) {
  const { push } = useToast();
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);

  const defaultFileName = t("ordersAdmin.orderDetails.files.defaultFileName");

  const canUseApi = Boolean(orderId && fileAccess && String(orderId).trim() && String(fileAccess).trim());

  const toastApiError = useCallback(
    (e, title) => {
      const status = e?.response?.status;
      let msg = e?.message || e?.response?.data?.message;
      if (e?.response?.data instanceof Blob) {
        msg =
          msg ||
          (status === 403
            ? t("ordersAdmin.orderDetails.files.unauthorized")
            : status === 404
              ? t("ordersAdmin.orderDetails.files.notFound")
              : null);
      }
      if (status === 401) {
        push(getFileAccessLoginToast(t));
        return;
      }
      if (status === 403) msg = msg || t("ordersAdmin.orderDetails.files.unauthorized");
      if (status === 404) msg = msg || t("ordersAdmin.orderDetails.files.notFound");
      push({
        type: "error",
        title,
        message: msg || t("ordersAdmin.orderDetails.files.genericError"),
      });
    },
    [push, t],
  );

  const runView = useCallback(
    async (f) => {
      if (!canUseApi) return;
      setBusyId(f.id);
      setBusyAction("view");
      try {
        await viewOrderFileForRole(orderId, f.id, displayOrderFileName(f, defaultFileName), fileAccess);
        push({
          type: "success",
          title: t("ordersAdmin.orderDetails.files.openSuccessTitle"),
          message: t("ordersAdmin.orderDetails.files.openSuccessMessage"),
        });
      } catch (e) {
        toastApiError(e, t("ordersAdmin.orderDetails.files.openErrorTitle"));
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
        push({
          type: "success",
          title: t("ordersAdmin.orderDetails.files.downloadSuccessTitle"),
          message: name,
        });
      } catch (e) {
        toastApiError(e, t("ordersAdmin.orderDetails.files.downloadErrorTitle"));
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
        const loading = busyId === f.id;
        const viewLabel =
          loading && busyAction === "view"
            ? t("ordersAdmin.orderDetails.files.opening")
            : t("ordersAdmin.orderDetails.files.view");
        const dlLabel =
          loading && busyAction === "download"
            ? t("ordersAdmin.orderDetails.files.downloading")
            : t("ordersAdmin.orderDetails.files.download");
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
                {t("ordersAdmin.orderDetails.files.loginHint")}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
