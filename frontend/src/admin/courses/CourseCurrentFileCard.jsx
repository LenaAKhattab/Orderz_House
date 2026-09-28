import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  courseFileDownloadName,
  formatAssetDate,
  formatFileSize,
  fileNameFromUrl,
  isLegacyBrokenCloudinaryPdfUrl,
} from "./courseAssetDisplayUtils";
import { downloadAdminCourseFile, openPdfPreviewTab, viewAdminCourseFile } from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";

/**
 * Saved file preview — view, download, replace (replace triggers hidden input via ref).
 */
export default function CourseCurrentFileCard({
  fileUrl,
  title,
  updatedAt = null,
  pendingFile = null,
  uploading = false,
  onReplace,
  onRemove,
  className = "",
  courseId = null,
  fileKind = null,
  showUploadedStatus = false,
}) {
  const { t, locale } = useTranslation();
  const toast = useToast();
  const [fileAction, setFileAction] = useState(null);
  const trimmed = String(fileUrl || "").trim();
  const hasSaved = Boolean(trimmed);
  const hasPending = Boolean(pendingFile?.name);
  const useProxy = Boolean(courseId && fileKind);
  const resolvedTitle = title ?? t("courses.assets.currentFile");

  if (!hasSaved && !hasPending) return null;

  const dateLabel = formatAssetDate(updatedAt, locale);
  const savedName = hasSaved ? fileNameFromUrl(trimmed, t) : null;
  const legacyBroken = hasSaved && isLegacyBrokenCloudinaryPdfUrl(trimmed);
  const downloadName = savedName ? courseFileDownloadName(savedName) : undefined;
  const pendingSize = pendingFile?.size != null ? formatFileSize(pendingFile.size, t) : null;

  const runFileAction = async (mode, previewWindow = null) => {
    if (legacyBroken) {
      toast.error(t("courses.assets.legacyNeedsReupload"));
      return;
    }
    if (fileAction) return;
    if (!useProxy) {
      toast.error(t("courses.assets.saveCourseFirst"));
      return;
    }
    setFileAction(mode);
    try {
      if (mode === "view") {
        await viewAdminCourseFile(courseId, fileKind, downloadName, previewWindow);
      } else {
        await downloadAdminCourseFile(courseId, fileKind, downloadName);
      }
    } catch (err) {
      if (previewWindow && !previewWindow.closed) {
        try {
          previewWindow.close();
        } catch {
          /* ignore */
        }
      }
      toast.error(err?.message || t("courses.assets.openFileFailed"));
    } finally {
      setFileAction(null);
    }
  };

  return (
    <div className={`oh-course-asset oh-course-asset--file ${className}`.trim()} role="region" aria-label={resolvedTitle}>
      <div className="oh-course-asset__head">
        <span className="oh-course-asset__title">{resolvedTitle}</span>
        {dateLabel && hasSaved ? (
          <span className="oh-course-asset__meta">{t("courses.assets.lastUpdated", { date: dateLabel })}</span>
        ) : null}
      </div>

      {hasSaved ? (
        <>
          {legacyBroken ? (
            <p className="oh-course-asset__legacy-warn" role="alert">
              <span className="oh-course-asset__legacy-badge">{t("courses.assets.needsReuploadBadge")}</span>
              {t("courses.assets.legacyLinkWarn")}
            </p>
          ) : null}

          <div className="oh-course-asset__body">
            <span className="oh-course-asset__file-icon" aria-hidden>
              📄
            </span>
            <div className="oh-course-asset__copy">
              <span className="oh-course-asset__filename">{savedName}</span>
              {showUploadedStatus ? (
                <span className="oh-course-asset__status">{t("courses.assets.fileUploaded")}</span>
              ) : null}
            </div>
          </div>
          <div className="oh-course-asset__actions">
            <button
              type="button"
              className="btn btn-secondary oh-course-asset__btn"
              disabled={legacyBroken || Boolean(fileAction) || !useProxy}
              onClick={() => {
                const preview = openPdfPreviewTab();
                void runFileAction("view", preview);
              }}
            >
              {fileAction === "view" ? <Loader2 size={16} className="fcd-btn__spinner" aria-hidden /> : null}
              {t("courses.assets.viewFile")}
            </button>
            <button
              type="button"
              className="btn btn-secondary oh-course-asset__btn"
              disabled={legacyBroken || Boolean(fileAction) || !useProxy}
              onClick={() => void runFileAction("download")}
            >
              {fileAction === "download" ? <Loader2 size={16} className="fcd-btn__spinner" aria-hidden /> : null}
              {t("courses.assets.downloadFile")}
            </button>
            {onReplace ? (
              <button type="button" className="btn btn-secondary oh-course-asset__btn" onClick={onReplace} disabled={uploading}>
                {t("courses.assets.replaceFile")}
              </button>
            ) : null}
            {onRemove ? (
              <button type="button" className="btn btn-danger oh-course-asset__btn" onClick={onRemove} disabled={uploading}>
                {t("courses.assets.removeFile")}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {hasPending ? (
        <div className="oh-course-asset__pending" role="status">
          <ul className="oh-course-asset__pending-list">
            <li>✓ {pendingFile.name}</li>
            {pendingSize ? <li>✓ {pendingSize}</li> : null}
          </ul>
          {uploading ? <span className="oh-course-asset__meta">{t("courses.assets.uploading")}</span> : null}
          {pendingFile.onClear && !uploading ? (
            <button type="button" className="oh-course-asset__clear-pending" onClick={pendingFile.onClear}>
              {t("courses.assets.clearSelection")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
