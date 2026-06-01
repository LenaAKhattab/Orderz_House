import CourseCurrentLinkCard from "./CourseCurrentLinkCard";

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
  linkTitle = "الرابط الحالي",
}) {
  return (
    <div className="oh-course-url-field">
      <label className="oh-admin-courses__field">
        <span>
          {label}
          {optional ? <span className="oh-admin-courses__optional"> (اختياري)</span> : null}
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
      <CourseCurrentLinkCard url={value} title={linkTitle} updatedAt={updatedAt} />
    </div>
  );
}
