import { useId, useRef, useState } from "react";
import { FileText, FileImage, File as FileIcon, Paperclip, X } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  MAX_ORDER_UPLOAD_TOTAL_BYTES,
  ORDER_UPLOAD_ACCEPT,
  ORDER_UPLOAD_TYPES_LABEL,
  orderUploadRejectionReason,
  validateOrderFilesSize,
} from "../../utils/orderUploadLimits";
import "./order-files-picker.css";

/** Western digits in both locales (matches dates/prices across the platform). */
function formatSize(bytes) {
  const n = Number(bytes) || 0;
  const kb = n / 1024;
  const fmt = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return kb < 1024 ? `${fmt(kb)} KB` : `${fmt(kb / 1024)} MB`;
}

function iconFor(file) {
  const type = String(file?.type || "");
  if (type.startsWith("image/")) return FileImage;
  if (type === "application/pdf" || /\.(docx?|txt|pdf)$/i.test(file?.name || "")) return FileText;
  return FileIcon;
}

/**
 * Accessible multi-file picker for order uploads (delivery, revision, briefs).
 * Drag & drop or browse; selected files listed with name, size and remove; total-size check inline.
 * Unsupported types, empty files and files over the count limit are refused with an inline message
 * (never dropped silently). Server-side validation (MIME/signature/size) stays authoritative.
 *
 * @param {{ files: File[], onChange: (files: File[]) => void, maxFiles?: number, disabled?: boolean, label?: string, hint?: string }} props
 */
export default function OrderFilesPicker({ files, onChange, maxFiles = 5, disabled = false, label, hint }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState([]);
  const baseId = useId();
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const list = Array.isArray(files) ? files : [];
  const sizeOk = validateOrderFilesSize(list).ok;
  const full = list.length >= maxFiles;

  const add = (incoming) => {
    const next = [...list];
    const refused = [];
    for (const f of Array.from(incoming || [])) {
      const reason = orderUploadRejectionReason(f);
      if (reason) {
        refused.push({ name: f.name, reason });
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (next.length >= maxFiles) {
        refused.push({ name: f.name, reason: "count" });
        continue;
      }
      next.push(f);
    }
    setRejected(refused);
    onChange(next);
  };
  const remove = (idx) => {
    setRejected([]);
    onChange(list.filter((_, i) => i !== idx));
  };
  const open = () => {
    if (!disabled && !full) inputRef.current?.click();
  };

  return (
    <div className="oh-files-picker">
      {label ? (
        <span className="oh-files-picker__label" id={`${baseId}-label`}>
          {label}
        </span>
      ) : null}
      <div
        className={`oh-files-picker__zone${dragging ? " is-dragging" : ""}${disabled || full ? " is-disabled" : ""}`}
        role="button"
        tabIndex={disabled || full ? -1 : 0}
        aria-labelledby={label ? `${baseId}-label` : undefined}
        aria-describedby={`${hintId}${!sizeOk || rejected.length ? ` ${errorId}` : ""}`}
        aria-disabled={disabled || full || undefined}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) add(e.dataTransfer.files);
        }}
      >
        <Paperclip className="oh-files-picker__icon" aria-hidden="true" />
        <span className="oh-files-picker__title">
          {full ? t("orders.filesPicker.maxReached", { max: maxFiles }) : t("orders.filesPicker.dropOrBrowse")}
        </span>
        <span className="oh-files-picker__hint" id={hintId}>
          {hint ||
            t("orders.filesPicker.limits", {
              max: maxFiles,
              size: Math.round(MAX_ORDER_UPLOAD_TOTAL_BYTES / (1024 * 1024)),
            })}
          <span className="oh-files-picker__types" dir="ltr">
            {t("orders.filesPicker.types", { types: ORDER_UPLOAD_TYPES_LABEL })}
          </span>
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ORDER_UPLOAD_ACCEPT}
          className="oh-files-picker__input"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {list.length ? (
        <ul className="oh-files-picker__list" aria-label={t("orders.filesPicker.selectedAria", { count: list.length })}>
          {list.map((f, idx) => {
            const Icon = iconFor(f);
            return (
              <li key={`${f.name}-${f.size}-${idx}`} className="oh-files-picker__item">
                <Icon className="oh-files-picker__file-icon" aria-hidden="true" />
                <span className="oh-files-picker__name" dir="auto" title={f.name}>
                  {f.name}
                </span>
                <span className="oh-files-picker__size" dir="ltr">
                  {formatSize(f.size)}
                </span>
                <button
                  type="button"
                  className="oh-files-picker__remove"
                  onClick={() => remove(idx)}
                  disabled={disabled}
                  aria-label={t("orders.filesPicker.remove", { name: f.name })}
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!sizeOk || rejected.length ? (
        <div className="oh-files-picker__error" id={errorId} role="alert">
          {!sizeOk ? (
            <p>{t("orders.filesPicker.tooLarge", { size: Math.round(MAX_ORDER_UPLOAD_TOTAL_BYTES / (1024 * 1024)) })}</p>
          ) : null}
          {rejected.map((r) => (
            <p key={`${r.name}-${r.reason}`} data-testid="files-picker-rejected">
              {t(`orders.filesPicker.rejected.${r.reason}`, { name: r.name, max: maxFiles })}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
