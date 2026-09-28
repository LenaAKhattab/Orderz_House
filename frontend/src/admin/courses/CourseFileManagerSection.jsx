import { useState } from "react";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import CourseFileUploadField from "./CourseFileUploadField";
import { useTranslation } from "../../i18n/LanguageProvider";

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
  pickButtonLabel,
  layerClassName = "z-[1300]",
}) {
  const { t } = useTranslation();
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const trimmed = String(value || "").trim();
  const hasFile = Boolean(trimmed) || Boolean(pendingFile?.name);
  const busy = uploading || removing;
  const resolvedPickLabel = pickButtonLabel ?? t("courses.assets.uploadPdf");

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
        label={hasFile ? null : resolvedPickLabel}
        fileUrl={isEdit || !pendingFile ? trimmed : ""}
        updatedAt={updatedAt}
        disabled={disabled}
        uploading={uploading}
        pendingFile={pendingFile}
        onFileSelected={onFileSelected}
        onValidationError={onValidationError}
        isEdit={isEdit}
        allowPickBeforeSave={allowPickBeforeSave}
        pickButtonLabel={resolvedPickLabel}
        courseId={courseId}
        fileKind={fileKind}
        onRemove={onRemove ? requestRemove : null}
        showUploadedStatus
      />

      {!hasFile && !isEdit && allowPickBeforeSave ? (
        <p className="oh-course-file-manager__empty-hint">{t("courses.assets.finalExamHint")}</p>
      ) : null}

      {allowAdvancedUrl && onChangeUrl ? (
        <details className="oh-course-file-manager__advanced">
          <summary>{t("courses.assets.advancedSettings")}</summary>
          <p className="oh-course-file-manager__advanced-hint">{t("courses.assets.advancedUrlHint")}</p>
          <label className="oh-admin-courses__field oh-course-file-manager__advanced-field">
            <span>{t("courses.assets.fileUrl")}</span>
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
        title={t("courses.assets.confirmRemoveFileTitle")}
        body={t("courses.assets.confirmRemoveFileBody")}
        cancelLabel={t("courses.common.cancel")}
        confirmLabel={t("courses.assets.confirmRemoveFile")}
        confirmVariant="danger"
        confirmBusy={removing}
        layerClassName={layerClassName}
        onCancel={cancelRemove}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
