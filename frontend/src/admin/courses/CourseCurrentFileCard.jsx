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

const LEGACY_USER_MESSAGE = "هذا الملف يحتاج إلى إعادة رفع من الإدارة.";
const OPEN_FAILED_TOAST = "تعذر فتح الملف. يرجى إبلاغ الإدارة لإعادة رفعه.";

/**
 * Saved file preview — view, download, replace (replace triggers hidden input via ref).
 */
export default function CourseCurrentFileCard({
  fileUrl,
  title = "الملف الحالي",
  updatedAt = null,
  pendingFile = null,
  uploading = false,
  onReplace,
  className = "",
  courseId = null,
  fileKind = null,
  hideStorageUrl = false,
}) {
  const toast = useToast();
  const [fileAction, setFileAction] = useState(null);
  const trimmed = String(fileUrl || "").trim();
  const hasSaved = Boolean(trimmed);
  const hasPending = Boolean(pendingFile?.name);
  const useProxy = Boolean(courseId && fileKind);

  if (!hasSaved && !hasPending) return null;

  const dateLabel = formatAssetDate(updatedAt);
  const savedName = hasSaved ? fileNameFromUrl(trimmed) : null;
  const legacyBroken = hasSaved && isLegacyBrokenCloudinaryPdfUrl(trimmed);
  const downloadName = savedName ? courseFileDownloadName(savedName) : undefined;
  const pendingSize = pendingFile?.size != null ? formatFileSize(pendingFile.size) : null;

  const runFileAction = async (mode, previewWindow = null) => {
    if (legacyBroken) {
      toast.error(LEGACY_USER_MESSAGE);
      return;
    }
    if (fileAction) return;
    if (!useProxy) {
      toast.error("احفظ الدورة أولاً ثم جرّب فتح الملف من هنا.");
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
      toast.error(err?.message || OPEN_FAILED_TOAST);
    } finally {
      setFileAction(null);
    }
  };

  return (
    <div className={`oh-course-asset oh-course-asset--file ${className}`.trim()} role="region" aria-label={title}>
      <div className="oh-course-asset__head">
        <span className="oh-course-asset__title">{title}</span>
        {dateLabel && hasSaved ? <span className="oh-course-asset__meta">آخر تحديث: {dateLabel}</span> : null}
      </div>

      {hasSaved ? (
        <>
          {legacyBroken ? (
            <p className="oh-course-asset__legacy-warn" role="alert">
              <span className="oh-course-asset__legacy-badge">يحتاج إعادة رفع الملف</span>
              الرابط المحفوظ قديم ولا يمكن فتحه. استخدم «استبدال الملف» وارفع PDF من جديد.
            </p>
          ) : null}

          <div className="oh-course-asset__body">
            <span className="oh-course-asset__file-icon" aria-hidden>
              📄
            </span>
            <div className="oh-course-asset__copy">
              <span className="oh-course-asset__filename">{savedName}</span>
              {!hideStorageUrl ? (
                <details className="oh-course-asset__url-details">
                  <summary>عرض رابط التخزين</summary>
                  <span className="oh-course-asset__url" dir="ltr">
                    {trimmed}
                  </span>
                </details>
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
              عرض الملف
            </button>
            <button
              type="button"
              className="btn btn-secondary oh-course-asset__btn"
              disabled={legacyBroken || Boolean(fileAction) || !useProxy}
              onClick={() => void runFileAction("download")}
            >
              {fileAction === "download" ? <Loader2 size={16} className="fcd-btn__spinner" aria-hidden /> : null}
              تنزيل الملف
            </button>
            {onReplace ? (
              <button type="button" className="btn btn-secondary oh-course-asset__btn" onClick={onReplace} disabled={uploading}>
                استبدال الملف
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
          {uploading ? <span className="oh-course-asset__meta">جارٍ الرفع…</span> : null}
          {pendingFile.onClear && !uploading ? (
            <button type="button" className="oh-course-asset__clear-pending" onClick={pendingFile.onClear}>
              إلغاء الاختيار
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
