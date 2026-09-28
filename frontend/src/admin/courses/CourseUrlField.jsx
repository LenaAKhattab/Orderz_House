import CourseCurrentLinkCard from "./CourseCurrentLinkCard";
import { useTranslation } from "../../i18n/LanguageProvider";

/**
 * URL input with saved-link preview card below.
 */
export default function CourseUrlField({
  label,
  optional = false,
  value,
  onChange,
  updatedAt = null,
  placeholder = "https://...",
  readOnly = false,
  required = false,
  linkTitle,
}) {
  const { t } = useTranslation();
  const resolvedLinkTitle = linkTitle ?? t("courses.assets.currentLink");

  return (
    <div className="oh-course-url-field">
      <label className="oh-admin-courses__field">
        <span>
          {label}
          {optional ? (
            <span className="oh-admin-courses__optional"> {t("courses.common.optional")}</span>
          ) : null}
        </span>
        <input
          className="oh-admin-courses__input"
          dir="ltr"
          value={value}
          onChange={readOnly ? undefined : onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          required={required}
        />
      </label>
      <CourseCurrentLinkCard url={value} title={resolvedLinkTitle} updatedAt={updatedAt} />
    </div>
  );
}
