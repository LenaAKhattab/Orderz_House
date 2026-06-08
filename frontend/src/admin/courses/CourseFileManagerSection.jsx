import { useState } from "react";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import CourseFileUploadField from "./CourseFileUploadField";

/**
 * Single file manager block — upload, view/download/replace/remove, optional advanced URL.
 */
export default function CourseFileManagerSection({
  label,
  description = null,
  value = "",
  onChangeUrl,
  fileKind,
  courseId = null,
  updatedAt = null,
  disabled = false,
  uploading = false,
  removing = false,
  isEdit = true,
  allowPickBeforeSave = false,
  pendingFile = null,
  onFileSelected,
  onValidationError,
  onRemove,
  allowAdvancedUrl = true,
  pickButtonLabel = "رفع ملف PDF",
  layerClassName = "z-[1300]",
}) {
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const trimmed = String(value || "").trim();
  const hasFile = Boolean(trimmed) || Boolean(pendingFile?.name);
  const busy = uploading || removing;

  const requestRemove = () => {
    if (disabled || busy || !hasFile) return;
    setRemoveConfirmOpen(true);
  };

  const cancelRemove = () => {
    if (removing) return;
    setRemoveConfirmOpen(false);
  };

  const confirmRemove = async () => {
    if (!onRemove) {
      setRemoveConfirmOpen(false);
      return;
    }
    try {
      await onRemove();
      setRemoveConfirmOpen(false);
    } catch {
      /* parent toasts errors */
    }
  };

  return (
    <div className="oh-course-file-manager">
      <div className="oh-course-file-manager__head">
        <span className="oh-course-file-manager__label">{label}</span>
        {description ? <p className="oh-course-file-manager__desc">{description}</p> : null}
      </div>

      <CourseFileUploadField
        label={hasFile ? null : pickButtonLabel}
        fileUrl={isEdit || !pendingFile ? trimmed : ""}
        updatedAt={updatedAt}
        disabled={disabled}
        uploading={uploading}
        pendingFile={pendingFile}
        onFileSelected={onFileSelected}
        onValidationError={onValidationError}
        isEdit={isEdit}
        allowPickBeforeSave={allowPickBeforeSave}
        pickButtonLabel={pickButtonLabel}
        courseId={courseId}
        fileKind={fileKind}
        onRemove={onRemove ? requestRemove : null}
        showUploadedStatus
      />

      {!hasFile && !isEdit && allowPickBeforeSave ? (
        <p className="oh-course-file-manager__empty-hint">يُستخدم هذا الملف ضمن خطوات الاختبار النهائي.</p>
      ) : null}

      {allowAdvancedUrl && onChangeUrl ? (
        <details className="oh-course-file-manager__advanced">
          <summary>إعدادات متقدمة</summary>
          <p className="oh-course-file-manager__advanced-hint">
            إدخال رابط ملف PDF يدوياً (اختياري — للاستخدام المتقدم فقط).
          </p>
          <label className="oh-admin-courses__field oh-course-file-manager__advanced-field">
            <span>رابط الملف</span>
            <input
              className="oh-admin-courses__input"
              dir="ltr"
              value={value}
              onChange={(e) => onChangeUrl(e.target.value)}
              placeholder="https://..."
              disabled={disabled || busy}
            />
          </label>
        </details>
      ) : null}

      <ConfirmDialog
        open={removeConfirmOpen}
        title="تأكيد إزالة الملف"
        body="سيتم إزالة هذا الملف من بيانات الدورة. لن يظهر للمستقلين بعد الحفظ."
        cancelLabel="إلغاء"
        confirmLabel="إزالة الملف"
        confirmVariant="danger"
        confirmBusy={removing}
        layerClassName={layerClassName}
        onCancel={cancelRemove}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
