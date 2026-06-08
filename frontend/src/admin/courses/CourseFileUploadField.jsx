import { useEffect, useId, useRef, useState } from "react";
import CourseCurrentFileCard from "./CourseCurrentFileCard";
import { validateCourseUploadFile } from "./courseAssetDisplayUtils";

const DEFAULT_ACCEPT = ".pdf,application/pdf";

/**
 * File upload with visible current file + replace flow.
 */
export default function CourseFileUploadField({
  label,
  fileUrl,
  updatedAt = null,
  accept = DEFAULT_ACCEPT,
  disabled = false,
  uploading = false,
  pendingFile = null,
  onFileSelected,
  onValidationError,
  helpWhenCreate = null,
  isEdit = true,
  allowPickBeforeSave = false,
  pickButtonLabel = "اختيار ملف",
  courseId = null,
  fileKind = null,
  onRemove = null,
  showUploadedStatus = false,
}) {
  const inputId = useId();
  const inputRef = useRef(null);
  const [localPick, setLocalPick] = useState(null);
  const wasUploadingRef = useRef(false);

  useEffect(() => {
    if (wasUploadingRef.current && !uploading) {
      setLocalPick(null);
    }
    wasUploadingRef.current = uploading;
  }, [uploading]);

  const displayPending = pendingFile || localPick;
  const canPick = isEdit || allowPickBeforeSave;
  const showPickButton = canPick && (!fileUrl || allowPickBeforeSave) && !displayPending?.name;

  const triggerPick = () => {
    if (!disabled && !uploading) inputRef.current?.click();
  };

  return (
    <div className="oh-course-upload-field">
      {label ? <span className="oh-admin-courses__field-label">{label}</span> : null}

      <CourseCurrentFileCard
        fileUrl={fileUrl}
        updatedAt={updatedAt}
        pendingFile={displayPending}
        uploading={uploading}
        onReplace={canPick ? triggerPick : null}
        onRemove={onRemove}
        courseId={courseId}
        fileKind={fileKind}
        showUploadedStatus={showUploadedStatus}
      />

      {canPick ? (
        <>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            className="oh-course-upload-field__input visually-hidden"
            disabled={disabled || uploading}
            accept={accept}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const check = validateCourseUploadFile(f);
              if (!check.ok) {
                onValidationError?.(check.message);
                e.target.value = "";
                return;
              }
              setLocalPick({ name: f.name, size: f.size, onClear: pendingFile?.onClear });
              if (onFileSelected) onFileSelected(f);
              e.target.value = "";
            }}
          />
          {showPickButton ? (
            <button type="button" className="btn btn-secondary oh-course-upload-field__pick" disabled={disabled || uploading} onClick={triggerPick}>
              {uploading ? "جارٍ الرفع…" : pickButtonLabel}
            </button>
          ) : null}
        </>
      ) : helpWhenCreate ? (
        <p className="help">{helpWhenCreate}</p>
      ) : null}
    </div>
  );
}
