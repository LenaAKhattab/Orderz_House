export default function WidgetLoadError({ message, onRetry }) {
  return (
    <div className="fdash-cc-load-error" role="alert">
      <p className="fdash-cc-load-error__text">{message || "تعذر تحميل هذا القسم."}</p>
      {onRetry ? (
        <button type="button" className="fdash-cc-btn fdash-cc-btn--sm" onClick={onRetry}>
          إعادة المحاولة
        </button>
      ) : null}
    </div>
  );
}
