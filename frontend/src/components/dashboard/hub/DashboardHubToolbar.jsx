export default function DashboardHubToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "بحث…",
  sortValue,
  onSortChange,
  sortOptions,
  onRefresh,
  refreshing = false,
  refreshLabel = "تحديث القائمة",
}) {
  return (
    <div className="fdash-toolbar">
      {onSearchChange != null ? (
        <div className="fdash-toolbar__search">
          <span className="fdash-toolbar__search-icon" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            className="fdash-toolbar__search-input"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
      ) : null}
      <div className="fdash-toolbar__actions">
        {sortOptions?.length ? (
          <select
            className="fdash-toolbar__select"
            value={sortValue}
            onChange={(e) => onSortChange?.(e.target.value)}
            aria-label="ترتيب"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : null}
        {onRefresh ? (
          <button
            type="button"
            className="fdash-toolbar__btn"
            disabled={refreshing}
            onClick={onRefresh}
          >
            {refreshing ? "جارٍ التحديث…" : refreshLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
